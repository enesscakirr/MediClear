"""
MAIN.PY - MEDICLEAR AI SERVICE (FastAPI)

FastAPI uygulaması: LangGraph tabanlı tıbbi analiz pipeline'ını dış dünyaya açar.
Portlar:
  - Bu servis    : 8000
  - Node.js API  : 5000 (ayrı süreç)
  - Ollama LLM   : 11434 (ayrı süreç)

Başlatma:
  cd ai-service
  uv run python -m uvicorn main:app --reload --port 8000
"""

import logging
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import asyncio
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# ENV YÜKLEME — Proje kökündeki .env (ai-service/../.env)
# ---------------------------------------------------------------------------
_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
# override=False → Docker Compose env vars take priority over .env file
load_dotenv(dotenv_path=_ENV_PATH, override=False)

# ---------------------------------------------------------------------------
# LOGLAMA YAPILANDIRMASI
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)-5s] [%(name)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("mediclear.ai-service")

logger.info("MediClear AI Service başlatılıyor...")
_env_status = "bulundu [OK]" if _ENV_PATH.exists() else "BULUNAMADI [HATA]"
logger.info(f"  .env dosyasi: {_ENV_PATH} ({_env_status})")


# Graph'ı import et (Ollama model bağlantıları burada kurulur)
try:
    from graph import medical_graph
    logger.info("LangGraph medical_graph başarıyla yüklendi ✅")
except Exception as e:
    logger.critical(f"LangGraph yüklenemedi: {e}", exc_info=True)
    raise

# ---------------------------------------------------------------------------
# FASTAPI UYGULAMASI
# ---------------------------------------------------------------------------
app = FastAPI(
    title="MediClear AI Service",
    description="LangGraph tabanlı tıbbi analiz API'si (LLaVA + Gemma + MedBot)",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — Frontend (tarayıcı) ve Node.js backend'den gelen isteklere izin ver
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# İSTEK LOGLAMA MIDDLEWARE
# ---------------------------------------------------------------------------
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    logger.info(f"→ {request.method} {request.url.path} — istek alındı")
    response = await call_next(request)
    elapsed = (time.perf_counter() - start) * 1000
    level = logging.WARNING if response.status_code >= 400 else logging.INFO
    logger.log(level, f"← {request.method} {request.url.path} → {response.status_code} ({elapsed:.1f}ms)")
    return response


# ---------------------------------------------------------------------------
# REQUEST / RESPONSE ŞEMALARI
# ---------------------------------------------------------------------------
class AnalyzeRequest(BaseModel):
    text: str = ""
    image_base64: Optional[str] = None


class AnalyzeResponse(BaseModel):
    result: str
    steps: list[str]
    # Teknik Detaylar — pipeline ara çıktıları (isteğe bağlı gösterim)
    raw_input: str = ""
    extracted_table: str = ""
    english_text: str = ""
    english_analysis: str = ""


# ---------------------------------------------------------------------------
# ENDPOINT: POST /api/analyze
# ---------------------------------------------------------------------------
@app.post("/api/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest):
    """
    Kullanıcının tıbbi metnini veya resmini alır,
    LangGraph pipeline'ından geçirir ve Türkçe analiz döner.
    """
    has_text = bool(request.text.strip())
    has_image = bool(request.image_base64)

    logger.info(f"/api/analyze isteği → metin: {has_text}, görsel: {has_image}")

    if not has_text and not has_image:
        logger.warning("Boş istek reddedildi: metin ve görsel ikisi de boş.")
        raise HTTPException(
            status_code=400,
            detail="Lütfen bir metin girin veya resim gönderin.",
        )

    initial_state = {
        "raw_input": request.text.strip(),
        "image_base64": request.image_base64,
        "extracted_table": "",
        "english_text": "",
        "english_analysis": "",
        "final_result": "",
        "steps": [],
    }

    logger.info("LangGraph pipeline başlatılıyor...")
    graph_start = time.perf_counter()

    try:
        # graph.invoke() senkron; event loop'u bloke etmemek için to_thread kullan
        final_state = await asyncio.to_thread(medical_graph.invoke, initial_state)
        elapsed = (time.perf_counter() - graph_start) * 1000
        logger.info(f"✅ LangGraph pipeline tamamlandı ({elapsed:.0f}ms) — {len(final_state.get('steps', []))} adım")

        return AnalyzeResponse(
            result=final_state.get("final_result", ""),
            steps=final_state.get("steps", []),
            raw_input=final_state.get("raw_input", ""),
            extracted_table=final_state.get("extracted_table", ""),
            english_text=final_state.get("english_text", ""),
            english_analysis=final_state.get("english_analysis", ""),
        )


    except TimeoutError as e:
        elapsed = (time.perf_counter() - graph_start) * 1000
        logger.error(f"❌ LangGraph zaman aşımı ({elapsed:.0f}ms): {e}")
        raise HTTPException(
            status_code=504,
            detail="Analiz zaman aşımına uğradı. Ollama servisinin çalıştığını kontrol edin.",
        )
    except Exception as e:
        elapsed = (time.perf_counter() - graph_start) * 1000
        logger.error(f"❌ LangGraph pipeline hatası ({elapsed:.0f}ms): {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=(
                f"Analiz sırasında bir hata oluştu: {str(e)}. "
                "Ollama'nın çalışıp çalışmadığını ve modellerin yüklü olduğunu kontrol edin."
            ),
        )


class HospitalSearchRequest(BaseModel):
    location: str

# ---------------------------------------------------------------------------
# ENDPOINT: POST /api/find_hospitals
# ---------------------------------------------------------------------------
@app.post("/api/find_hospitals")
async def find_hospitals_endpoint(request: HospitalSearchRequest):
    """
    Kullanıcının metnindeki konumu algılayıp MCP üzerinden hastaneleri bulur.
    """
    logger.info(f"/api/find_hospitals isteği alındı, konum: {request.location}")
    if not request.location.strip():
        raise HTTPException(status_code=400, detail="Konum (location) boş olamaz.")
        
    try:
        from hospital_agent import find_hospitals_for_location
        # Bu fonksiyon zaten asenkron ve loglamasını içeride yapıyor
        result = await find_hospitals_for_location(request.location)
        return result
    except Exception as e:
        logger.error(f"Hastane arama endpoint hatası: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Arama sırasında hata oluştu: {str(e)}")

# ---------------------------------------------------------------------------
# SAĞLIK KONTROLÜ: GET /health
# ---------------------------------------------------------------------------

@app.get("/health")
async def health_check():
    """Servisin ayakta olduğunu doğrular."""
    logger.info("Sağlık kontrolü isteği alındı.")
    return {"status": "ok", "message": "MediClear AI Service çalışıyor ✅"}


# ---------------------------------------------------------------------------
# ÇALIŞTIRMA (doğrudan python main.py ile)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
