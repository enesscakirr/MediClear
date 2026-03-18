"""
GRAPH.PY - MEDICLEAR AI AGENT (LangGraph)

Bu dosya, tıbbi analiz sürecini bir LangGraph StateGraph olarak tanımlar.
Her LLM çağrısı ayrı bir "node"dur; state (durum) node'lar arasında aktarılır.

Akış:
  START → [vision_node?] → translate_to_en → medical_analysis → translate_to_tr → END

Kullanılan Modeller:
  - vision_node        : LLaVA   (görsel → tablo)
  - translate_to_en    : Gemma   (TR → EN çeviri)
  - medical_analysis   : MedBot  (tıbbi analiz)
  - translate_to_tr    : Gemma   (EN → TR çeviri)
"""

import logging
import os
import time
from pathlib import Path
from typing import TypedDict, Optional, List

from dotenv import load_dotenv

from langchain_ollama import OllamaLLM, ChatOllama
from langchain_core.messages import HumanMessage
from langgraph.graph import StateGraph, START, END

# RAG (Chroma) kütüphaneleri
from langchain_chroma import Chroma
from langchain_ollama import OllamaEmbeddings
import chromadb

# ---------------------------------------------------------------------------
# ENV YÜKLEME — Proje kökündeki .env (ai-service/../.env)
# ---------------------------------------------------------------------------
_ROOT_ENV = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_ROOT_ENV)

# ---------------------------------------------------------------------------
# LOGLAMA
# ---------------------------------------------------------------------------
logger = logging.getLogger("mediclear.graph")

# ---------------------------------------------------------------------------
# AYARLAR (env'den veya varsayılan)
# ---------------------------------------------------------------------------
OLLAMA_BASE_URL  = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
VISION_MODEL     = os.getenv("VISION_MODEL", "llava:7b")
TRANSLATOR_MODEL = os.getenv("TRANSLATOR_MODEL", "translategemma:latest")
MEDICAL_MODEL    = os.getenv("MEDICAL_MODEL", "Goosedev/medbot:latest")
EMBEDDING_MODEL  = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")

logger.info(f"Ollama ayarları → base_url: {OLLAMA_BASE_URL}")
logger.info(f"  Vision model     : {VISION_MODEL}")
logger.info(f"  Translator model : {TRANSLATOR_MODEL}")
logger.info(f"  Medical model    : {MEDICAL_MODEL}")


# ---------------------------------------------------------------------------
# STATE: Node'lar arasında taşınan veri yapısı
# ---------------------------------------------------------------------------
class MedicalState(TypedDict):
    raw_input: str              # Kullanıcıdan gelen ham metin
    image_base64: Optional[str] # Yüklenen resim (Base64) — opsiyonel
    use_rag: bool               # RAG aramasının yapılıp yapılmayacağını belirten bayrak
    extracted_table: str        # Vision node çıktısı (görsel → tablo)
    english_text: str           # TR→EN çeviri çıktısı
    
    # RAG'SİZ (İlk) ANALİZ
    english_analysis_no_rag: str # Tıbbi analiz çıktısı (İngilizce - RAG olmadan)
    final_result_no_rag: str     # EN→TR çeviri — nihai Türkçe sonuç (RAG olmadan)
    
    # RAG'Lİ (Ek) ANALİZ
    retrieved_context: str      # Vektör DB'den çekilen referans bilgiler (RAG)
    references: List[str]       # Frontend'de göstermek üzere kaynak listesi (Örn: "DSO_2024.pdf")
    english_analysis_with_rag: str # Tıbbi analiz çıktısı (İngilizce - RAG ile)
    final_result_with_rag: str     # EN→TR çeviri — nihai Türkçe sonuç (RAG ile)
    
    steps: List[str]            # Her adımın log mesajı (frontend'e de iletilir)


# ---------------------------------------------------------------------------
# YARDIMCI: Node loglama dekoratörü
# ---------------------------------------------------------------------------
def _node_log(node_name: str, model: str, action: str) -> str:
    """Frontend'e gönderilecek adım mesajını dönd ve logger'a yaz."""
    msg = f"[{node_name}] [{model}] {action}"
    logger.info(msg)
    return msg


# ---------------------------------------------------------------------------
# YARDIMCI: Ollama modelini bellekten boşaltma (VRAM tasarrufu)
# ---------------------------------------------------------------------------
import urllib.request
import json

def unload_ollama_model(model_name: str, base_url: str = OLLAMA_BASE_URL) -> None:
    """Belirtilen modeli VRAM'den anında boşaltarak bir sonraki model için yer açar."""
    url = f"{base_url.rstrip('/')}/api/generate"
    data = {"model": model_name, "keep_alive": 0}
    
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(data).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=2.0) as _:
            logger.info(f"  [VRAM] {model_name} bellekten boşaltıldı.")
    except Exception as e:
        logger.warning(f"  [VRAM] {model_name} boşaltılamadı: {e}")



# ---------------------------------------------------------------------------
# NODE 1: VISION — Resmi Markdown tablosuna dönüştür (LLaVA)
# ---------------------------------------------------------------------------
def vision_node(state: MedicalState) -> dict:
    """
    Sadece image_base64 doluysa çalışır.
    LLaVA modeline resmi gönderir, dönen Markdown tablosunu extracted_table'a yazar.
    """
    image_b64 = state.get("image_base64")
    steps = list(state.get("steps", []))

    if not image_b64:
        msg = _node_log("vision_node", VISION_MODEL, "[Atlandı] Görsel yok, resim analizi yapılmadı.")
        return {"extracted_table": "", "steps": steps + [msg]}

    start_msg = _node_log("vision_node", VISION_MODEL, "⏳ Resim okunuyor ve Markdown tablosuna dönüştürülüyor...")
    steps = steps + [start_msg]

    vision_prompt = (
        "Extract the medical data from this image and format it as a Markdown Table. "
        "Columns: Test Name | Result | Unit | Reference Range. "
        "If a value is not visible, leave it empty. "
        "Do NOT write any introduction or explanation, just the table."
    )

    t0 = time.perf_counter()
    try:
        logger.info(f"  Ollama ChatOllama çağrısı başlatılıyor → model: {VISION_MODEL}")
        chat = ChatOllama(model=VISION_MODEL, base_url=OLLAMA_BASE_URL, keep_alive=0)
        message = HumanMessage(
            content=[
                {"type": "text", "text": vision_prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
            ]
        )
        response = chat.invoke([message])
        extracted = response.content.strip()
        elapsed = (time.perf_counter() - t0) * 1000

        done_msg = _node_log("vision_node", VISION_MODEL, f"✅ Resim tabloya dönüştürüldü ({elapsed:.0f}ms).")
        logger.info(f"  Çıktı uzunluğu: {len(extracted)} karakter")
        return {"extracted_table": extracted, "steps": steps + [done_msg]}

    except Exception as e:
        elapsed = (time.perf_counter() - t0) * 1000
        err_msg = f"[vision_node] ❌ LLaVA hatası ({elapsed:.0f}ms): {e}"
        logger.error(err_msg, exc_info=True)
        return {
            "extracted_table": "",
            "steps": steps + [f"⚠️ Görsel analizi başarısız: {e}. Metin girişiyle devam ediliyor."],
        }

    finally:
        # Sonraki aşamalar için RAM/VRAM aç ve 1 saniye bekle
        unload_ollama_model(VISION_MODEL)
        time.sleep(1)


# ---------------------------------------------------------------------------
# NODE 2: TRANSLATE TO ENGLISH — Türkçe/karma metni İngilizceye çevir (Gemma)
# ---------------------------------------------------------------------------
def translate_to_en_node(state: MedicalState) -> dict:
    """
    Kullanıcının metnini + varsa vision çıktısını birleştirir ve İngilizceye çevirir.
    Tıbbi modeller İngilizce metni daha iyi anlar.
    """
    raw   = state.get("raw_input", "")
    table = state.get("extracted_table", "")
    steps = list(state.get("steps", []))

    start_msg = _node_log("translate_to_en", TRANSLATOR_MODEL, "⏳ Veri İngilizceye çevriliyor...")
    steps = steps + [start_msg]

    combined = raw
    if table:
        combined = f"[EXTRACTED TABLE FROM IMAGE]:\n{table}\n\n[USER NOTE]:\n{raw}"
        logger.info(f"  Görsel tablo metinle birleştirildi ({len(table)} + {len(raw)} karakter)")

    prompt = (
        f"You are a professional medical translator. Your ONLY job is to translate the following text to English. "
        f"Do NOT add any explanations, notes, conversational text, or multiple options. "
        f"Output ONLY the direct English translation of the text.\n\n"
        f"Text to translate:\n\"{combined}\""
    )

    t0 = time.perf_counter()
    try:
        logger.info(f"  Ollama OllamaLLM çağrısı → model: {TRANSLATOR_MODEL}")
        llm = OllamaLLM(model=TRANSLATOR_MODEL, base_url=OLLAMA_BASE_URL, keep_alive=0)
        english_text = llm.invoke(prompt).strip()
        elapsed = (time.perf_counter() - t0) * 1000

        done_msg = _node_log("translate_to_en", TRANSLATOR_MODEL, f"✅ İngilizceye çeviri tamamlandı ({elapsed:.0f}ms).")
        logger.info(f"  Çıktı uzunluğu: {len(english_text)} karakter")
        return {"english_text": english_text, "steps": steps + [done_msg]}

    except Exception as e:
        elapsed = (time.perf_counter() - t0) * 1000
        logger.error(f"  ❌ Çeviri hatası ({elapsed:.0f}ms): {e}", exc_info=True)
        # Çeviri başarısız olursa ham metni İngilizce olarak kullan (devam et)
        fallback_msg = f"⚠️ Çeviri başarısız ({e}), ham metin kullanılıyor."
        return {"english_text": raw, "steps": steps + [fallback_msg]}
    finally:
        # Sonraki aşamadaki modeller için VRAM aç ve 1 saniye bekle
        unload_ollama_model(TRANSLATOR_MODEL)
        time.sleep(1)


# ---------------------------------------------------------------------------
# NODE 3: RETRIEVE CONTEXT (RAG) — Vektör DB'den benzer tıbbi belgeleri çek
# ---------------------------------------------------------------------------
def retrieve_context_node(state: MedicalState) -> dict:
    """
    Kullanıcının orijinal metnini (raw_input + extracted_table) kullanarak 
    veritabanında (ChromaDB) arama yapar. Bulunan referansları (context) state'e ekler.
    """
    steps = list(state.get("steps", []))
    
    # Kullanıcı aramayı kapattıysa direkt atla
    if not state.get("use_rag", False):
        done_msg = _node_log("retrieve_context", "ChromaDB", "ℹ️ RAG kapalı, resmi referans araması atlandı.")
        return {"retrieved_context": "", "references": [], "steps": steps + [done_msg]}

    raw_input = state.get("raw_input", "")
    table = state.get("extracted_table", "")
    query = f"{raw_input}\n{table}".strip()

    if not query:
        # Fallback to english_text if both are empty for some reason
        query = state.get("english_text", "")
    
    if not query:
        return {"retrieved_context": "", "references": [], "steps": steps}
        
    start_msg = _node_log("retrieve_context", "ChromaDB", "⏳ Referans tıbbi belgeler aranıyor...")
    steps = steps + [start_msg]
    
    t0 = time.perf_counter()
    try:
        # Veritabanı bağlantı ayarları
        chroma_host = os.getenv("CHROMADB_HOST", "localhost")
        chroma_port = os.getenv("CHROMADB_PORT", "8001")
        
        chroma_client = chromadb.HttpClient(host=chroma_host, port=chroma_port)
        embeddings = OllamaEmbeddings(model=EMBEDDING_MODEL, base_url=OLLAMA_BASE_URL, keep_alive=0)
        
        vector_store = Chroma(
            client=chroma_client,
            collection_name="mediclear_medical_docs",
            embedding_function=embeddings,
        )
        
        # En benzer özellikleri taşıyan (k=3) belge parçasını getir
        results = vector_store.similarity_search(query, k=3)
        
        context_text = ""
        references = []
        
        if results:
            for doc in results:
                # Belgenin adını al (metadata'da kaynak dosya yolu bulunur)
                source = doc.metadata.get("source", "Bilinmeyen Kaynak")
                # Windows veya Unix path işaretlerini '/' ile değiştirerek sadece dosya adını alıyoruz
                source_name = source.replace("\\", "/").split("/")[-1]
                
                context_text += f"---\nKaynak: {source_name}\nİçerik:\n{doc.page_content}\n\n"
                
                if source_name not in references:
                    references.append(source_name)
                    
            elapsed = time.perf_counter() - t0
            done_msg = _node_log("retrieve_context", "ChromaDB", f"✅ {len(references)} adet referans belge bulundu ({elapsed:.1f}s).")
            return {"retrieved_context": context_text, "references": references, "steps": steps + [done_msg]}
        else:
            done_msg = _node_log("retrieve_context", "ChromaDB", "ℹ️ Eşleşen tıbbi referans bulunamadı.")
            return {"retrieved_context": "", "references": [], "steps": steps + [done_msg]}
            
    except Exception as e:
        logger.error(f"[retrieve_context] ❌ ChromaDB araması başarısız: {e}")
        err_msg = _node_log("retrieve_context", "ChromaDB", "⚠️ Veritabanı bağlantı hatası, referanssız devam ediliyor.")
        return {"retrieved_context": "", "references": [], "steps": steps + [err_msg]}
    finally:
        # Nomic modelini bellekten at ve yeni modelin yüklenmesi için 1 saniye bekle
        unload_ollama_model(EMBEDDING_MODEL)
        time.sleep(1)


# ---------------------------------------------------------------------------
# NODE 4: MEDICAL ANALYSIS NO RAG — RAG olmadan analiz
# ---------------------------------------------------------------------------
def medical_analysis_no_rag_node(state: MedicalState) -> dict:
    english_text = state.get("english_text", "")
    steps = list(state.get("steps", []))

    start_msg = _node_log("medical_analysis_no_rag", MEDICAL_MODEL, "⏳ Tıbbi değerler değerlendiriliyor (Ön Analiz)...")
    steps = steps + [start_msg]

    prompt = f"""You are an expert medical AI. Analyze the following medical findings (text or table).
Explain what the values mean to an adult patient.
- If there is a table, go through abnormal values first.
- Explain what "High" or "Low" results might indicate effectively.
- Use reassurance and clear language.
- Warning: "This is not a medical diagnosis."

Medical Data: "{english_text}" """

    t0 = time.perf_counter()
    try:
        logger.info(f"  Ollama OllamaLLM çağrısı (No RAG) → model: {MEDICAL_MODEL}")
        llm = OllamaLLM(model=MEDICAL_MODEL, base_url=OLLAMA_BASE_URL, keep_alive=0)
        english_analysis = llm.invoke(prompt).strip()
        elapsed = (time.perf_counter() - t0) * 1000

        done_msg = _node_log("medical_analysis_no_rag", MEDICAL_MODEL, f"✅ Ön analiz tamamlandı ({elapsed:.0f}ms).")
        return {"english_analysis_no_rag": english_analysis, "steps": steps + [done_msg]}
    except Exception as e:
        logger.error(f"  ❌ Ön analiz hatası: {e}", exc_info=True)
        raise RuntimeError(f"Tıbbi analiz başarısız: {e}") from e
    finally:
        unload_ollama_model(MEDICAL_MODEL)
        time.sleep(1)


# ---------------------------------------------------------------------------
# NODE 5: TRANSLATE TO TURKISH NO RAG
# ---------------------------------------------------------------------------
def translate_to_tr_no_rag_node(state: MedicalState) -> dict:
    english_analysis = state.get("english_analysis_no_rag", "")
    steps = list(state.get("steps", []))

    start_msg = _node_log("translate_to_tr_no_rag", TRANSLATOR_MODEL, "⏳ Ön sonuçlar Türkçeye çevriliyor...")
    steps = steps + [start_msg]

    prompt = f"""Translate the following medical analysis into clear, professional Turkish.
Do not use childish tones. Use "Siz" (polite form).

Text: "{english_analysis}" """

    t0 = time.perf_counter()
    try:
        llm = OllamaLLM(model=TRANSLATOR_MODEL, base_url=OLLAMA_BASE_URL, keep_alive=0)
        final_result = llm.invoke(prompt).strip()
        elapsed = (time.perf_counter() - t0) * 1000

        done_msg = _node_log("translate_to_tr_no_rag", TRANSLATOR_MODEL, f"✅ Çeviri (Ön Analiz) tamamlandı ({elapsed:.0f}ms).")
        return {
            "final_result_no_rag": final_result,
            "steps": steps + [done_msg],
        }
    except Exception as e:
        logger.error(f"  ❌ TR çeviri hatası: {e}", exc_info=True)
        raise RuntimeError(f"Türkçe çeviri başarısız: {e}") from e
    finally:
        unload_ollama_model(TRANSLATOR_MODEL)
        time.sleep(1)


# ---------------------------------------------------------------------------
# NODE 6: MEDICAL ANALYSIS WITH RAG — Context ile Ek Analiz
# ---------------------------------------------------------------------------
def medical_analysis_with_rag_node(state: MedicalState) -> dict:
    english_text = state.get("english_text", "")
    context = state.get("retrieved_context", "")
    steps = list(state.get("steps", []))

    if not context or not state.get("use_rag", False):
        done_msg = _node_log("medical_analysis_with_rag", MEDICAL_MODEL, "ℹ️ RAG verisi yok, ek analiz atlanıyor.")
        return {"english_analysis_with_rag": "", "steps": steps + [done_msg]}

    start_msg = _node_log("medical_analysis_with_rag", MEDICAL_MODEL, "⏳ Bilgi bankası kaynaklı ek analiz yapılıyor...")
    steps = steps + [start_msg]

    prompt = f"""You are an expert medical AI. Analyze the following medical findings based strictly on the provided Knowledge Base Context.
- This is an "Additional Information" section. Keep it brief and focused ONLY on what the knowledge base says about these values.
- Explain what the context guidelines state about high/low values.
- Use reassurance and clear language.
- Start directly with the insights. Do not add formatting like "### 📚 Ek Bilgi".

Medical Data: "{english_text}"

Knowledge Base Context:
{context}
"""

    t0 = time.perf_counter()
    try:
        llm = OllamaLLM(model=MEDICAL_MODEL, base_url=OLLAMA_BASE_URL, keep_alive=0)
        english_analysis = llm.invoke(prompt).strip()
        elapsed = (time.perf_counter() - t0) * 1000

        done_msg = _node_log("medical_analysis_with_rag", MEDICAL_MODEL, f"✅ Ek analiz tamamlandı ({elapsed:.0f}ms).")
        return {"english_analysis_with_rag": english_analysis, "steps": steps + [done_msg]}
    except Exception as e:
        logger.error(f"  ❌ Ek analiz hatası: {e}")
        return {"english_analysis_with_rag": "", "steps": steps + [f"⚠️ Ek analiz başarısız: {e}"]}
    finally:
        unload_ollama_model(MEDICAL_MODEL)
        time.sleep(1)


# ---------------------------------------------------------------------------
# NODE 7: TRANSLATE TO TURKISH WITH RAG
# ---------------------------------------------------------------------------
def translate_to_tr_with_rag_node(state: MedicalState) -> dict:
    english_analysis = state.get("english_analysis_with_rag", "")
    steps = list(state.get("steps", []))

    if not english_analysis:
        return {"final_result_with_rag": "", "steps": steps + ["✅ Tüm işlemler tamamlandı!"]}

    start_msg = _node_log("translate_to_tr_with_rag", TRANSLATOR_MODEL, "⏳ Ek analiz sonuçları Türkçeye çevriliyor...")
    steps = steps + [start_msg]

    prompt = f"""Translate the following medical analysis into clear, professional Turkish.
Do not use childish tones. Use "Siz" (polite form).

Text: "{english_analysis}" """

    t0 = time.perf_counter()
    try:
        llm = OllamaLLM(model=TRANSLATOR_MODEL, base_url=OLLAMA_BASE_URL, keep_alive=0)
        final_result = llm.invoke(prompt).strip()
        elapsed = (time.perf_counter() - t0) * 1000

        done_msg = _node_log("translate_to_tr_with_rag", TRANSLATOR_MODEL, f"✅ Ek analiz çevirisi tamamlandı ({elapsed:.0f}ms).")
        return {
            "final_result_with_rag": final_result,
            "steps": steps + [done_msg, "✅ Tüm işlemler tamamlandı!"]
        }
    except Exception as e:
        logger.error(f"  ❌ TR çeviri hatası: {e}")
        return {"final_result_with_rag": "", "steps": steps + [f"⚠️ Çeviri başarısız: {e}", "✅ İşlem tamamlandı!"]}
    finally:
        unload_ollama_model(TRANSLATOR_MODEL)


# ---------------------------------------------------------------------------
# CONDITIONAL EDGE: Resim var mı?
# ---------------------------------------------------------------------------
def should_run_vision(state: MedicalState) -> str:
    """Resim yüklenmişse vision_node'a, yoksa direkt translate_to_en'e git."""
    if state.get("image_base64"):
        return "vision_node"
    return "translate_to_en"


# ---------------------------------------------------------------------------
# GRAPH TANIMI
# ---------------------------------------------------------------------------
def build_graph():
    logger.info("LangGraph StateGraph oluşturuluyor...")
    graph = StateGraph(MedicalState)

    graph.add_node("vision_node", vision_node)
    graph.add_node("translate_to_en", translate_to_en_node)
    graph.add_node("medical_analysis_no_rag", medical_analysis_no_rag_node)
    graph.add_node("translate_to_tr_no_rag", translate_to_tr_no_rag_node)
    graph.add_node("retrieve_context", retrieve_context_node)
    graph.add_node("medical_analysis_with_rag", medical_analysis_with_rag_node)
    graph.add_node("translate_to_tr_with_rag", translate_to_tr_with_rag_node)

    graph.add_conditional_edges(START, should_run_vision, {
        "vision_node": "vision_node",
        "translate_to_en": "translate_to_en",
    })
    
    graph.add_edge("vision_node", "translate_to_en")
    graph.add_edge("translate_to_en", "medical_analysis_no_rag")
    graph.add_edge("medical_analysis_no_rag", "translate_to_tr_no_rag")
    graph.add_edge("translate_to_tr_no_rag", "retrieve_context")
    graph.add_edge("retrieve_context", "medical_analysis_with_rag")
    graph.add_edge("medical_analysis_with_rag", "translate_to_tr_with_rag")
    graph.add_edge("translate_to_tr_with_rag", END)

    compiled = graph.compile()
    logger.info("✅ LangGraph çift RAG yollu şekilde başarıyla derlendi.")
    return compiled


# Graph'ı oluştur (import edildiğinde bir kez çalışır)
medical_graph = build_graph()
