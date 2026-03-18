"""
INGEST_DATA.PY - RAG Veri Yükleme (Ingestion) Scripti

Bu script, `knowledge_base` klasörüne konulan PDF ve TXT belgelerini okur,
parçalara ayırır (chunking), metinleri matematiksel vektörlere dönüştürür (embedding)
ve ChromaDB adlı vektör veritabanına kaydeder.

RAG Mantığı:
1. Ingestion (Bu Script): Belgeler -> Vektörler -> Veritabanı
2. Retrieval (graph.py içinde): Kullanıcı Sorusu -> Vektör Arama -> İlgili Belge Parçaları
3. Generation (graph.py içinde): Bulunan Belgeler + YZ Modeli (MedBot) -> Doğru Yanıt
"""

import os
import glob
import logging
import time
from pathlib import Path
from dotenv import load_dotenv

# LangChain Bileşenleri
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_ollama import OllamaEmbeddings
import chromadb

# ---------------------------------------------------------------------------
# LOGLAMA VE ORTAM DEĞİŞKENLERİ
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ingest")

# Proje kök dizinindeki .env dosyasını yükle
_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_ENV_PATH)

# Çevresel değişkenleri ayarla (eğer .env yoksa varsayılan değerler kullanılır)
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "nomic-embed-text")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# Bu script host makinede (Docker dışında) çalıştığı için,
# eğer .env dosyasında 'host.docker.internal' yazıyorsa bunu 'localhost' olarak düzelt.
if "host.docker.internal" in OLLAMA_BASE_URL:
    OLLAMA_BASE_URL = OLLAMA_BASE_URL.replace("host.docker.internal", "localhost")

# Docker üzerinde değil, host bilgisayarda (vscode terminalinde) çalıştıracağımız için
# localhost:8001 varsayılanını kullanıyoruz (.env.example içinde böyle verdik)
CHROMADB_HOST = os.getenv("CHROMADB_HOST", "localhost")
CHROMADB_PORT = os.getenv("CHROMADB_PORT", "8001")

KNOWLEDGE_BASE_DIR = Path(__file__).resolve().parent / "knowledge_base"

# ---------------------------------------------------------------------------
# ADIM 1: Belgeleri Okuma (Loaders)
# ---------------------------------------------------------------------------
def load_documents(directory: Path):
    """Verilen klasördeki (knowledge_base) PDF ve TXT dosyalarını okur."""
    documents = []
    
    if not directory.exists():
        logger.error(f"❌ Klasör bulunamadı: {directory}")
        directory.mkdir(parents=True, exist_ok=True)
        logger.info("  -> Klasör oluşturuldu. Lütfen içine .pdf veya .txt dosyaları ekleyin.")
        return documents

    logger.info(f"📂 Belgeler aranıyor: {directory}")
    
    # PDF'leri bul ve yükle
    for file_path in directory.glob("*.pdf"):
        logger.info(f"  📄 Yükleniyor (PDF): {file_path.name}")
        loader = PyPDFLoader(str(file_path))
        documents.extend(loader.load())
        
    # TXT'leri bul ve yükle
    for file_path in directory.glob("*.txt"):
        logger.info(f"  📝 Yükleniyor (TXT): {file_path.name}")
        loader = TextLoader(str(file_path), encoding="utf-8")
        documents.extend(loader.load())
        
    logger.info(f"✅ Toplam {len(documents)} sayfa/belge başarıyla okundu.")
    return documents

# ---------------------------------------------------------------------------
# ADIM 2: Metni Parçalamak (Chunking)
# Niye parçalıyoruz? Yapay zeka modellerinin belli bir token sınırı vardır.
# Koca bir PDF'i tek seferde veremeyiz, ufak ve anlamlı parçalara böleriz.
# ---------------------------------------------------------------------------
def split_documents(documents):
    """Belgeleri daha küçük anlamlı parçalara (chunk) böler."""
    
    # RecursiveCharacterTextSplitter: Doğal dil yapısını (paragraflar, cümleler) 
    # bozmadan bölmeye çalışan akıllı bir bölücüdür.
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,    # Her bir parça yaklaşık 1000 karakter olacak
        chunk_overlap=200,  # Parçalar arası %20 örtüşme olsun (anlam kopukluğu olmasın diye)
        add_start_index=True 
    )
    
    chunks = text_splitter.split_documents(documents)
    logger.info(f"✂️  Belgeler toplam {len(chunks)} parçaya bölündü.")
    return chunks

# ---------------------------------------------------------------------------
# ADIM 3: Embedding ve Veritabanına Yazma
# Embedding: Kelimelerin anlamsal özelliklerini sayı disizine (vektör) çevirme işlemidir. 
# Böylece AI, "kırmızı" ile "bordo" kelimelerinin birbirine yakın sayılar olduğunu anlayabilir.
# ---------------------------------------------------------------------------
def ingest_into_chromadb(chunks):
    """Bölünen metin parçalarını vektörlere dönüştürür ve ChromaDB'ye yazar."""
    if not chunks:
        logger.warning("⚠️ Veritabanına yazılacak belge bulunamadı.")
        return

    logger.info(f"🧠 Embedding Modeli: {EMBEDDING_MODEL} (Ollama üzerinden)")
    
    # Embedding Fonksiyonu: Metin->Vektör dönüşümü Ollama üzerinden yapılacak
    embeddings = OllamaEmbeddings(
        model=EMBEDDING_MODEL,
        base_url=OLLAMA_BASE_URL,
        keep_alive=0
    )
    
    logger.info(f"💾 ChromaDB'ye bağlanılıyor... Host: {CHROMADB_HOST}, Port: {CHROMADB_PORT}")
    
    try:
        # Chroma HTTP client ile (docker'daki sunucuya) bağlan
        chroma_client = chromadb.HttpClient(host=CHROMADB_HOST, port=CHROMADB_PORT)
        
        # LangChain üzerinden veritabanı objesini oluştur / al
        vector_store = Chroma(
            client=chroma_client,
            collection_name="mediclear_medical_docs",
            embedding_function=embeddings,
        )
        
        # Parçaları vektörleştirip ChromaDB koleksiyonuna ekliyoruz.
        logger.info(f"⏳ {len(chunks)} parça vektörleştiriliyor ve kaydediliyor. Bu işlem model hızınıza bağlı olarak biraz sürebilir...")
        
        t0 = time.time()
        vector_store.add_documents(documents=chunks)
        t1 = time.time()
        
        logger.info(f"🎉 BAŞARILI! Veriler başarıyla ChromaDB'ye eklendi. (Süre: {t1-t0:.1f} saniye)")
        
    except Exception as e:
        logger.error(f"❌ ChromaDB'ye bağlanılamadı veya veriler yazılamadı:\n{e}", exc_info=True)
        logger.info("💡 Not: 'docker-compose up -d chromadb' komutunu çalıştırarak veritabanının ayakta olduğundan emin olun.")
        logger.info("💡 Not: Ollama'nın çalışıp çalışmadığını ('ollama serve') ve 'nomic-embed-text' modelinin yüklü olduğunu kontrol edin ('ollama pull nomic-embed-text').")


# ---------------------------------------------------------------------------
# ANA FONKSİYON
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("="*60)
    print(" MediClear RAG - Veri Yükleme (Ingestion) Başlatıldı")
    print("="*60)
    
    docs = load_documents(KNOWLEDGE_BASE_DIR)
    
    if docs:
        chunks = split_documents(docs)
        ingest_into_chromadb(chunks)
    else:
        print("\nİşlem iptal edildi: Okunacak belge yok.")
