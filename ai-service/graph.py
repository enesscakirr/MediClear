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
    extracted_table: str        # Vision node çıktısı (görsel → tablo)
    english_text: str           # TR→EN çeviri çıktısı
    english_analysis: str       # Tıbbi analiz çıktısı (İngilizce)
    final_result: str           # EN→TR çeviri — nihai Türkçe sonuç
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
        chat = ChatOllama(model=VISION_MODEL, base_url=OLLAMA_BASE_URL)
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
        f"Translate this medical text/table to English. "
        f"Keep the table structure intact if present. "
        f'Text: "{combined}"'
    )

    t0 = time.perf_counter()
    try:
        logger.info(f"  Ollama OllamaLLM çağrısı → model: {TRANSLATOR_MODEL}")
        llm = OllamaLLM(model=TRANSLATOR_MODEL, base_url=OLLAMA_BASE_URL)
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


# ---------------------------------------------------------------------------
# NODE 3: MEDICAL ANALYSIS — Tıbbi analiz yap (MedBot)
# ---------------------------------------------------------------------------
def medical_analysis_node(state: MedicalState) -> dict:
    """
    İngilizce metni tıbbi yapay zekaya gönderir.
    Anormal değerleri açıklar, hastaya yönelik dil kullanır.
    """
    english_text = state.get("english_text", "")
    steps = list(state.get("steps", []))

    start_msg = _node_log("medical_analysis", MEDICAL_MODEL, "⏳ Tıbbi değerler inceleniyor...")
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
        logger.info(f"  Ollama OllamaLLM çağrısı → model: {MEDICAL_MODEL}")
        llm = OllamaLLM(model=MEDICAL_MODEL, base_url=OLLAMA_BASE_URL)
        english_analysis = llm.invoke(prompt).strip()
        elapsed = (time.perf_counter() - t0) * 1000

        done_msg = _node_log("medical_analysis", MEDICAL_MODEL, f"✅ Tıbbi analiz tamamlandı ({elapsed:.0f}ms).")
        logger.info(f"  Analiz uzunluğu: {len(english_analysis)} karakter")
        return {"english_analysis": english_analysis, "steps": steps + [done_msg]}

    except Exception as e:
        elapsed = (time.perf_counter() - t0) * 1000
        logger.error(f"  ❌ Tıbbi analiz hatası ({elapsed:.0f}ms): {e}", exc_info=True)
        raise RuntimeError(f"Tıbbi analiz başarısız: {e}") from e


# ---------------------------------------------------------------------------
# NODE 4: TRANSLATE TO TURKISH — Analizi Türkçeye çevir (Gemma)
# ---------------------------------------------------------------------------
def translate_to_tr_node(state: MedicalState) -> dict:
    """
    İngilizce analizi profesyonel Türkçeye çevirir.
    Resmi "Siz" hitabı kullanılır.
    """
    english_analysis = state.get("english_analysis", "")
    steps = list(state.get("steps", []))

    start_msg = _node_log("translate_to_tr", TRANSLATOR_MODEL, "⏳ Sonuçlar Türkçeye çevriliyor...")
    steps = steps + [start_msg]

    prompt = f"""Translate the following medical analysis into clear, professional Turkish.
Do not use childish tones. Use "Siz" (polite form).

Text: "{english_analysis}" """

    t0 = time.perf_counter()
    try:
        logger.info(f"  Ollama OllamaLLM çağrısı → model: {TRANSLATOR_MODEL}")
        llm = OllamaLLM(model=TRANSLATOR_MODEL, base_url=OLLAMA_BASE_URL)
        final_result = llm.invoke(prompt).strip()
        elapsed = (time.perf_counter() - t0) * 1000

        done_msg = _node_log("translate_to_tr", TRANSLATOR_MODEL, f"✅ Türkçeye çeviri tamamlandı ({elapsed:.0f}ms).")
        logger.info(f"  Nihai sonuç uzunluğu: {len(final_result)} karakter")
        return {
            "final_result": final_result,
            "steps": steps + [done_msg, "✅ Tüm işlem tamamlandı!"],
            # Ara sonuçları da döndür — LangGraph'ın yeni sürümlerinde
            # invoke() yalnızca son node'un döndürdüklerini final state'e aktarır.
            "english_text": state.get("english_text", ""),
            "english_analysis": english_analysis,
        }

    except Exception as e:
        elapsed = (time.perf_counter() - t0) * 1000
        logger.error(f"  ❌ TR çeviri hatası ({elapsed:.0f}ms): {e}", exc_info=True)
        raise RuntimeError(f"Türkçe çeviri başarısız: {e}") from e


# ---------------------------------------------------------------------------
# CONDITIONAL EDGE: Resim var mı? → Vision node'a git veya atla
# ---------------------------------------------------------------------------
def should_run_vision(state: MedicalState) -> str:
    """Resim yüklenmişse vision_node'a, yoksa direkt translate_to_en'e git."""
    if state.get("image_base64"):
        logger.info("  Görsel tespit edildi → vision_node çalıştırılıyor.")
        return "vision_node"
    logger.info("  Görsel yok → translate_to_en doğrudan çalıştırılıyor.")
    return "translate_to_en"


# ---------------------------------------------------------------------------
# GRAPH TANIMI
# ---------------------------------------------------------------------------
def build_graph():
    logger.info("LangGraph StateGraph oluşturuluyor...")
    graph = StateGraph(MedicalState)

    graph.add_node("vision_node", vision_node)
    graph.add_node("translate_to_en", translate_to_en_node)
    graph.add_node("medical_analysis", medical_analysis_node)
    graph.add_node("translate_to_tr", translate_to_tr_node)

    graph.add_conditional_edges(START, should_run_vision, {
        "vision_node": "vision_node",
        "translate_to_en": "translate_to_en",
    })
    graph.add_edge("vision_node", "translate_to_en")
    graph.add_edge("translate_to_en", "medical_analysis")
    graph.add_edge("medical_analysis", "translate_to_tr")
    graph.add_edge("translate_to_tr", END)

    compiled = graph.compile()
    logger.info("✅ LangGraph StateGraph başarıyla derlendi (4 node: vision → translate_en → medical → translate_tr)")
    return compiled


# Graph'ı oluştur (import edildiğinde bir kez çalışır)
medical_graph = build_graph()
