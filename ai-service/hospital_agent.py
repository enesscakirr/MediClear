"""
HOSPITAL_AGENT.PY - MCP Tabanlı Hastane Bulucu Ajan

Bu modül, kullanıcının girdiği konum bilgisini kullanarak
yakındaki hastaneleri bulmak için bir AI Ajanı ve
Model Context Protocol (MCP) tabanlı bir araç (tool) yönetimini içerir.

Kullanım özet:
1. `find_hospitals(location)` çağrılır.
2. MCP Server (Örn: Google Maps veya Mock) üzerinden lokasyondaki hastaneler aranır.
3. Sonuçlar yapılandırılmış JSON (dict) olarak Frontend'e gönderilmek üzere döndürülür.
"""

import logging
import json
import asyncio
import os
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from dotenv import load_dotenv

# LangChain / Ollama integrasyonu
from langchain_ollama import OllamaLLM
from langchain_core.prompts import PromptTemplate

# Logger ayarları yapılandırması
logger = logging.getLogger("mediclear.hospital-agent")

# Çevresel değişkenleri yükle
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
HOSPITAL_MODEL = os.getenv("TRANSLATOR_MODEL", "translategemma:latest")


# ---------------------------------------------------------------------------
# VERİ MODELLERİ (Verinin Standartlaştırılması)
# ---------------------------------------------------------------------------
class HospitalRecord(BaseModel):
    id: str
    name: str
    address: str
    rating: float
    vicinity: str
    lat: float
    lng: float
    types: List[str]

class HospitalResult(BaseModel):
    location_detected: str
    hospitals: List[HospitalRecord]
    message: str


# ---------------------------------------------------------------------------
# MCP SERVER ENTEGRASYONU (Şablon / Mock)
# ---------------------------------------------------------------------------
# Not: Gerçek bir MCP entegrasyonu için "mcp" paketi gereklidir (`pip install mcp`).
# Eğer Google Maps MCP düzgün çalışmazsa diye "FallBack / Mock" verisi de sağlıyoruz
# böylece frontend geliştirimi kopukluğa uğramaz.

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
import json
import httpx

async def call_mcp_google_maps(location_query: str) -> List[Dict[str, Any]]:
    """
    Kullanıcının lokasyon metnini alır ve @modelcontextprotocol/server-google-maps
    MCP Sunucusu üzerinden 'maps_search_places' toolunu çağırarak sonuç döner.
    """
    logger.info(f" MCP Google Maps sunucusu üzerinden '{location_query}' aranıyor...")
    
    env = os.environ.copy()
    if "GOOGLE_MAPS_API_KEY" not in env or not env["GOOGLE_MAPS_API_KEY"]:
        logger.error(" GOOGLE_MAPS_API_KEY çevresel değişkeni bulunamadı. Lütfen .env dosyanızı güncelleyin.")
        return []

    server_params = StdioServerParameters(
        command="npx",
        args=["-y", "@modelcontextprotocol/server-google-maps"],
        env=env
    )
    
    try:
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                # Google Maps MCP toolu "maps_search_places" çağrılıyor.
                # Parametre olarak "{location_query} çevresi hastaneler" gibi bir metin yollanabilir.
                result = await session.call_tool("maps_search_places", arguments={"query": f"hospitals in {location_query}"})
                
                # result.content[0].text genellikle tool'un string formatındaki JSON çıktısıdır.
                tool_output_str = result.content[0].text
                places_data = json.loads(tool_output_str)
                
                places = places_data.get("places", [])
                logger.info(f" MCP Google Maps üzerinden {len(places)} adet sonuç döndü.")
                
                real_hospitals = []
                for i, p in enumerate(places):
                    name = p.get("name", "Bilinmeyen Hastane")
                    address = p.get("formatted_address", "Adres yok")
                    location = p.get("location", {})
                    lat = location.get("lat", 0.0)
                    lng = location.get("lng", 0.0)
                    rating = p.get("rating", 0.0)
                    types = p.get("types", [])
                    
                    real_hospitals.append({
                        "id": p.get("place_id", f"real_{i}"),
                        "name": name,
                        "address": address,
                        "rating": float(rating),
                        "vicinity": location_query.title(),
                        "lat": float(lat),
                        "lng": float(lng),
                        "types": types
                    })

                return real_hospitals
                
    except Exception as e:
        logger.error(f" Google Maps MCP sunucusuna bağlanırken veya veri çekerken hata: {e}", exc_info=True)
        return []


# ---------------------------------------------------------------------------
# ANA FONKSİYON: Konum Çıkarma ve Hastane Bulma
# ---------------------------------------------------------------------------
async def find_hospitals_for_location(user_query: str) -> HospitalResult:
    """
    1. Kullanıcının metninden (örn: "Kadıköy'de hastane") konumu algılar.
    2. MCP üzerinden o konumdaki hastaneleri arar.
    3. Standart bir HospitalResult JSON nesnesi döner.
    """
    logger.info(f"Hastane Arama İsteği: '{user_query}'")
    
    # 1. Adım: Konum çıkarımı (Entity Extraction)
    # LLM kullanarak kullanıcının metnindeki şehri/ilçeyi bulalım.
    prompt = PromptTemplate(
        input_variables=["query"],
        template="Extract the specific location from the text where someone is looking for a hospital. If both a city and district are provided, return them together like 'District, City' (e.g. 'Kadıköy, İstanbul'). Exclude words like 'hastane', 'nerede', 'bul'. If no specific location is mentioned, return 'İstanbul'.\n\nText: {query}\n\nLocation:"
    )
    
    try:
        logger.info(" AI ile konum çıkarımı başlatılıyor...")
        llm = OllamaLLM(model=HOSPITAL_MODEL, base_url=OLLAMA_BASE_URL)
        chain = prompt | llm
        
        extracted_loc = chain.invoke({"query": user_query})
        extracted_loc = extracted_loc.strip()
        
        # Basit temizlik
        if not extracted_loc or len(extracted_loc) > 30:
            extracted_loc = "İstanbul" # Fallback
            
        logger.info(f"Tespit edilen konum: '{extracted_loc}'")
        
    except Exception as e:
        logger.error(f"Konum çıkarılırken LLM hatası: {e}")
        extracted_loc = user_query # Algoritma patlarsa girdiği query'yi direkt kullan.
        
    # 2. Adım: MCP ile Hastane verisini çek
    try:
        raw_hospitals_data = await call_mcp_google_maps(extracted_loc)
        
        # Veriyi temizle ve doğrula
        hospitals = []
        for item in raw_hospitals_data:
            hospitals.append(HospitalRecord(
                id=item.get("id", ""),
                name=item.get("name", "Bilinmeyen Hastane"),
                address=item.get("address", item.get("vicinity", "Adres yok")),
                rating=float(item.get("rating", 0.0)),
                vicinity=item.get("vicinity", ""),
                lat=float(item.get("lat", 0.0)),
                lng=float(item.get("lng", 0.0)),
                types=item.get("types", [])
            ))
            
        return HospitalResult(
            location_detected=extracted_loc,
            hospitals=hospitals,
            message=f"{extracted_loc} çevresinde {len(hospitals)} adet sağlık kuruluşu bulundu."
        )
        
    except Exception as e:
        logger.error(f" MCP / Veri çekme hatası: {e}", exc_info=True)
        return HospitalResult(
            location_detected=extracted_loc,
            hospitals=[],
            message="Hastaneler aranırken bir sorun oluştu. Lütfen bağlantınızı kontrol edip tekrar deneyin."
        )
