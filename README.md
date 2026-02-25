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
│     │                        │                             │
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
│                    OLLAMA  (:11434)                          │
│   • llava:7b          (görsel → Markdown tablo)             │
│   • translategemma    (TR ↔ EN çeviri)                       │
│   • Goosedev/medbot   (tıbbi analiz)                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🗂️ Klasör Yapısı

```
MediClear/
├── frontend/           → HTML, CSS, Vanilla JS (kullanıcı arayüzü)
├── backend-node/       → Express.js API, MongoDB, JWT Auth
│   ├── routes/
│   ├── middleware/
│   └── models/
├── ai-service/         → FastAPI + LangGraph + Ollama entegrasyonu
├── .env                → Gerçek ortam değerleri (Git'e ekleme!)
├── .env.example        → Değişken şablonu (herkese açık)
└── README.md
```

---

## ⚙️ Kurulum ve Çalıştırma

### Ön Gereksinimler

| Araç | Sürüm | Kaynak |
|------|-------|--------|
| Node.js | ≥ 18 | [nodejs.org](https://nodejs.org) |
| MongoDB | ≥ 7 | [mongodb.com](https://www.mongodb.com) |
| Python | ≥ 3.12 | [python.org](https://www.python.org) |
| Ollama | En güncel | [ollama.com](https://ollama.com) |
| uv *(önerilen)* | En güncel | [docs.astral.sh/uv](https://docs.astral.sh/uv) |

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

| Değişken | Açıklama | Örnek |
|----------|----------|-------|
| `PORT` | Node.js sunucu portu | `5000` |
| `MONGODB_URI` | MongoDB bağlantı adresi | `mongodb://127.0.0.1:27017/MediClear` |
| `JWT_SECRET` | JWT imzalama anahtarı (güçlü tutun!) | `uzun-rastgele-bir-string` |
| `OLLAMA_BASE_URL` | Ollama adresi | `http://localhost:11434` |
| `VISION_MODEL` | LLaVA model adı | `llava:7b` |
| `TRANSLATOR_MODEL` | Gemma çeviri modeli | `translategemma:latest` |
| `MEDICAL_MODEL` | Tıbbi analiz modeli | `Goosedev/medbot:latest` |

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

---

### 6. Uygulamayı Aç

Tarayıcıda [http://localhost:5000](http://localhost:5000) adresine gidin.

---

## 🔌 API Referansı

### Node.js Backend (`:5000`)

| Method | Endpoint | Açıklama | Auth |
|--------|----------|----------|------|
| `POST` | `/api/auth/register` | Yeni kullanıcı kaydı | Hayır |
| `POST` | `/api/auth/login` | Giriş — JWT döner | Hayır |
| `GET` | `/api/auth/profile` | Profil getir | JWT Bearer |
| `PUT` | `/api/auth/profile` | Profil güncelle | JWT Bearer |

### Python AI Service (`:8000`)

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `POST` | `/api/analyze` | Metin/görsel analiz — LangGraph pipeline |
| `GET` | `/health` | Servis sağlık kontrolü |
| `GET` | `/docs` | Swagger UI (interaktif API dökümantasyonu) |

---

## 🤝 Katkı

1. Bu repoyu fork edin
2. Özellik dalı oluşturun: `git checkout -b feat/yeni-ozellik`
3. Değişikliklerinizi commit edin: `git commit -m 'feat: yeni özellik ekle'`
4. Dalınızı push edin: `git push origin feat/yeni-ozellik`
5. Pull Request açın

---

## ⚠️ Sorumluluk Reddi

MediClear yalnızca **bilgi amaçlıdır** ve tıbbi tavsiye yerine geçmez.
Sağlığınızla ilgili kararlar için her zaman bir doktora başvurun.

---

## 📄 Lisans

MIT Lisansı — Ayrıntılar için [LICENSE](LICENSE) dosyasına bakın.
