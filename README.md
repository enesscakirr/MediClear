# 🩺 MediClear — Tıbbi Yapay Zeka Asistanı

> **MediClear**, tıbbi analiz sonuçlarınızı (kan testi, tahlil raporu vb.) yükleyerek yapay zeka destekli, anlaşılır Türkçe açıklamalar almanızı sağlayan, 3 katmanlı bir açık kaynak web uygulamasıdır.

---

## 📐 Mimari

```
┌─────────────────────────────────────────────────────────────┐
│                      KULLANICI (Browser)                    │
│         index.html · analyst.html · profile.html vb.        │
└────────────────────────┬────────────────────────────────────┘
                         │  HTTP (express.static)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              BACKEND-NODE  (Express.js · :5000)             │
│   • Kullanıcı kaydı / giriş (bcrypt + JWT)                  │
│   • MongoDB ile kullanıcı verisi                            │
│   • Frontend dosyalarını statik olarak servis eder          │
└────────────────────────┬────────────────────────────────────┘
                         │  POST /api/analyze (HTTP · :8000)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│             AI-SERVICE  (FastAPI + LangGraph · :8000)       │
│                                                             │
│   START                                                     │
│     │                                                       │
│     ├─[Görsel varsa]──► vision_node (LLaVA :llava:7b)       │
│     │                        │                              │
│     └──────────────────────► translate_to_en (Gemma)        │
│                                    │                        │
│                              medical_analysis (MedBot)      │
│                                    │                        │
│                              translate_to_tr (Gemma)        │
│                                    │                        │
│                                   END                       │
└────────────────────────┬────────────────────────────────────┘
                         │  HTTP API (:11434)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    OLLAMA  (:11434)                         │
│   • llava:7b          (görsel → Markdown tablo)             │
│   • translategemma    (TR ↔ EN çeviri)                      │
│   • Goosedev/medbot   (tıbbi analiz)                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 🗂️ Klasör Yapısı

```
MediClear/
├── frontend/              → HTML, CSS, Vanilla JS (kullanıcı arayüzü)
├── backend-node/          → Express.js API, MongoDB, JWT Auth
│   ├── routes/
│   ├── middleware/
│   └── models/
├── ai-service/            → FastAPI + LangGraph + Ollama entegrasyonu
│   ├── main.py
│   ├── graph.py
│   ├── hospital_agent.py
│   └── requirements.txt
├── deploy/                ← Docker Orkestrasyonu (Tüm Docker Dosyaları)
│   ├── docker-compose.yml
│   ├── Dockerfile.backend
│   └── Dockerfile.ai
├── .dockerignore          ← İmajlara girmeyen dosyalar
├── .env                   → Gerçek ortam değerleri (Git'e ekleme!)
├── .env.example           → Değişken şablonu (herkese açık)
└── README.md
```

---

## ⚙️ Kurulum ve Çalıştırma

### Ön Gereksinimler

| Araç            | Sürüm     | Kaynak                                         |
| --------------- | --------- | ---------------------------------------------- |
| Node.js         | ≥ 18      | [nodejs.org](https://nodejs.org)               |
| MongoDB         | ≥ 7       | [mongodb.com](https://www.mongodb.com)         |
| Python          | ≥ 3.12    | [python.org](https://www.python.org)           |
| Ollama          | En güncel | [ollama.com](https://ollama.com)               |
| uv _(önerilen)_ | En güncel | [docs.astral.sh/uv](https://docs.astral.sh/uv) |

---

### 1. Repoyu Klonla

```bash
git clone https://github.com/KULLANICI_ADINIZ/MediClear.git
cd MediClear
```

---

### 2. Ortam Değişkenlerini Ayarla

```bash
# Şablon dosyasını kopyala
cp .env.example .env
```

`.env` dosyasını açarak aşağıdaki değişkenleri düzenleyin:

| Değişken           | Açıklama                             | Örnek                                 |
| ------------------ | ------------------------------------ | ------------------------------------- |
| `PORT`             | Node.js sunucu portu                 | `5000`                                |
| `MONGODB_URI`      | MongoDB bağlantı adresi              | `mongodb://127.0.0.1:27017/MediClear` |
| `JWT_SECRET`       | JWT imzalama anahtarı (güçlü tutun!) | `uzun-rastgele-bir-string`            |
| `OLLAMA_BASE_URL`  | Ollama adresi                        | `http://localhost:11434`              |
| `VISION_MODEL`     | LLaVA model adı                      | `llava:7b`                            |
| `TRANSLATOR_MODEL` | Gemma çeviri modeli                  | `translategemma:latest`               |
| `MEDICAL_MODEL`    | Tıbbi analiz modeli                  | `Goosedev/medbot:latest`              |

---

### 3. Ollama Modellerini İndir

```bash
ollama pull llava:7b
ollama pull translategemma:latest
ollama pull Goosedev/medbot:latest

# Ollama servisinin çalıştığını doğrula
ollama list
```

---

### 4. Node.js Backend'i Başlat

```bash
cd backend-node
npm install

# Geliştirme (nodemon ile otomatik yeniden başlatma):
npm run dev

# Üretim:
npm start
```

✅ Başarılı log çıktısı:

```
[INFO ] MongoDB bağlantısı başarılı! Veritabanı: "MediClear"
[INFO ] MediClear Backend-Node çalışıyor → http://localhost:5000
```

---

### 5. Python AI Servisini Başlat

**uv ile (önerilen):**

```bash
# Proje kök dizininde
uv run python -m uvicorn ai_service.main:app --reload --port 8000
```

**pip ile (alternatif):**

```bash
cd ai-service
python -m venv .venv

# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

✅ Başarılı log çıktısı:

```
INFO  [mediclear.graph] LangGraph StateGraph başarıyla derlendi (4 node)
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### 6. Yakınımdaki Hastaneler (MCP) Özelliği

MediClear artık konum tabanlı hastane önerme özelliğine sahiptir. `Yakınımdaki Hastaneler` sayfasında çalışır.
Bu özellik arka planda Model Context Protocol (MCP) konseptini kullanarak Google Maps entegrasyonu sağlar. Yapay zeka, girdiğiniz serbest metindeki lokasyon bilgisini algılar ve haritada size özel sonuçları gösterir.

**ÖNEMLİ:** Bu özelliğin çalışabilmesi için `.env` dosyanızda mutlaka geçerli bir Google Maps API anahtarı tanımlamış olmanız gerekmektedir:

```env
GOOGLE_MAPS_API_KEY=sizin_api_anahtariniz_buraya
```

Sistem kendi içinde Google Maps MCP sunucusunu çalıştırarak sizin için veriyi çekecektir. Özel bir sunucu başlatmanıza gerek yoktur, uygulamanın çalışmasıyla eşzamanlı olarak Python servisi tarafından otomatik yönetilir.

---

### 7. Uygulamayı Aç

Tarayıcıda [http://localhost:5000](http://localhost:5000) adresine gidin.

---

## 🐳 Docker ile Çalıştırma

MediClear'ı Docker ve Docker Compose kullanarak **tek komutla** ayağa kaldırabilirsiniz. Bu yöntem, MongoDB ve Python AI servisini otomatik olarak yönetir; yalnızca Ollama'yı ayrıca çalıştırmanız gerekir.

### Ön Gereksinimler (Docker)

| Araç            | Sürüm     | Kaynak                                                |
| --------------- | --------- | ----------------------------------------------------- |
| Docker Engine   | ≥ 24      | [docker.com](https://www.docker.com/get-started)      |
| Docker Compose  | ≥ 2.20    | Docker Desktop ile birlikte gelir                     |
| Ollama          | En güncel | [ollama.com](https://ollama.com) — host'ta çalışır    |

---

### Adım 1: Ollama'yı Host Makinede Başlat

> **Önemli:** Ollama, Docker konteynerinin **dışında**, doğrudan host işletim sisteminde çalışır. Konteynerler ona `host.docker.internal:11434` adresi üzerinden ulaşır.

```bash
# Ollama servisini başlat
ollama serve

# Ayrı bir terminalde modelleri indir
ollama pull llava:7b
ollama pull translategemma:latest
ollama pull Goosedev/medbot:latest
```

---

### Adım 2: Ortam Değişkenlerini Ayarla

```bash
cp .env.example .env
```

`.env` dosyasında Docker için kritik değerleri kontrol edin:

```env
# Docker Compose ortamında MongoDB servis adıyla ulaşılır
MONGODB_URI=mongodb://db:27017/MediClear

# Ollama, host makinede çalışır — konteynerden bu adresiyle ulaşılır
OLLAMA_BASE_URL=http://host.docker.internal:11434

# Güvenlik için mutlaka değiştirin!
JWT_SECRET=guclu_ve_uzun_bir_gizli_anahtar_girin
```

---

### Adım 3: Sistemi Başlat

```bash
# Deploy dizinine geçin ve çalıştırın
cd deploy
docker-compose up --build -d
```

İlk çalıştırmada Docker imajları inşa edilir (~2-5 dk.). Sonraki başlatmalarda:

```bash
docker-compose up -d       # Önceki imajları kullan (hızlı)
docker-compose up --build -d # İmajları yeniden derle (kod değişikliği sonrası)
docker-compose up -d       # Arka planda (detach) çalıştır
```

---

### Adım 4: Uygulamayı Aç

Tarayıcıda [http://localhost:5000](http://localhost:5000) adresine gidin.

Servisler başarıyla başladığında:

| Servis          | Adres                                          |
| --------------- | ---------------------------------------------- |
| Frontend + API  | [http://localhost:5000](http://localhost:5000)  |
| AI Service Docs | [http://localhost:8000/docs](http://localhost:8000/docs) |
| MongoDB         | `mongodb://localhost:27017`                    |

---

### Servislerin Birbiriyle İletişimi

```
Tarayıcı
  │
  │ HTTP :5000
  ▼
backend-node (container: mediclear-backend)
  ├── mongodb://db:27017       →  db (container: mediclear-db)
  └── http://ai-service:8000   →  ai-service (container: mediclear-ai)
                                        │
                                        │ http://host.docker.internal:11434
                                        ▼
                                   Ollama (host makinede)
```

> Docker'ın iç ağı (`mediclear-network`) sayesinde servisler birbirine **container adıyla** (`db`, `ai-service`) ulaşır. Ollama ise konteynerin dışında çalıştığı için `host.docker.internal` özel DNS adresi kullanılır (Windows/Mac otomatik tanımlar; Linux'ta `extra_hosts: host-gateway` ayarı geçerlidir).

---

### Veri Kalıcılığı

MongoDB verileri `mediclear_mongo_data` adlı Docker volume'unda saklanır. Konteynerler durdurulsa veya silinse bile veriler korunur:

```bash
# Volume listesi
docker volume ls

# Sistemi tamamen sıfırla (verileri de sil)
docker-compose down -v
```

---

### Faydalı Komutlar

```bash
# Tüm servislerin loglarını izle
docker-compose logs -f

# Sadece bir servisin logları
docker-compose logs -f backend-node

# Çalışan konteynerlerin durumu
docker-compose ps

# Bir konteynere bağlan (shell)
docker exec -it mediclear-ai bash

# Sistemi durdur (verileri koru)
docker-compose down

# Sistemi durdur ve volume'ları sil
docker-compose down -v
```

---

## 🔌 API Referansı

### Node.js Backend (`:5000`)

| Method | Endpoint             | Açıklama             | Auth       |
| ------ | -------------------- | -------------------- | ---------- |
| `POST` | `/api/auth/register` | Yeni kullanıcı kaydı | Hayır      |
| `POST` | `/api/auth/login`    | Giriş — JWT döner    | Hayır      |
| `GET`  | `/api/auth/profile`  | Profil getir         | JWT Bearer |
| `PUT`  | `/api/auth/profile`  | Profil güncelle      | JWT Bearer |

### Python AI Service (`:8000`)

| Method | Endpoint       | Açıklama                                   |
| ------ | -------------- | ------------------------------------------ |
| `POST` | `/api/analyze` | Metin/görsel analiz — LangGraph pipeline   |
| `GET`  | `/health`      | Servis sağlık kontrolü                     |
| `GET`  | `/docs`        | Swagger UI (interaktif API dökümantasyonu) |

---

## 🛡️ Güvenlik ve Veri Gizliliği

MediClear, kullanıcı verilerinin güvenliğini en üst düzeyde tutmak modern standartları kullanır:

- **Bcrypt Hashing**: Şifreleriniz veritabanına asla düz metin (plain-text) olarak kaydedilmez. Kayıt aşamasında şifreler, tuzlama (salting) yöntemiyle `Bcrypt` algoritması kullanılarak tek yönlü şifrelenir.
- **JWT (JSON Web Tokens)**: Sistemdeki tüm özel rotalara (profil, oturum kapatma vb.) erişim JWT ile sağlanır. Giriş yapıldığında üretilen token, `Authorization: Bearer <token>` formatında sunucuya gönderilir ve expire (geçerlilik) süresi ile güvenliği artırır.
- **Veri İzolasyonu**: Python (Yapay Zeka) servisi doğrudan kullanıcı yetki bilgilerine veya şifrelerine erişmez. Backend-Node yalnızca yetkisi doğrulanmış istekleri kabul ederek veri bütünlüğünü sağlar.

---

## ⚠️ Sorumluluk Reddi

MediClear yalnızca **bilgi amaçlıdır** ve tıbbi tavsiye yerine geçmez.
Sağlığınızla ilgili kararlar için her zaman bir doktora başvurun.
