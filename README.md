<h1 align="center">MediClear - Yapay Zeka Destekli Tıbbi Asistan 🩺</h1>

<p align="center">
  Karmaşık tıbbi raporlarınızı ve tahlil sonuçlarınızı, <strong>3-katmanlı yerel yapay zeka (LLaVA, Mistral, Gemma)</strong> teknolojisiyle saniyeler içinde anlayabileceğiniz, herkes için sadeleştirilmiş bir dile çeviren profesyonel Açık Kaynak Web Uygulaması.
</p>

## 🚀 Projenin Amacı ve Özellikleri

MediClear, hastaların doktorlarından aldıkları "anlaşılmaz" terimlerle dolu laboratuvar ve görüntüleme sonuçlarını analiz etmek için geliştirilmiş bir asistan arayüzüdür.

- 🧠 **3-Katmanlı Yapay Zeka Mimarisi:**
  - **1. Katman (Görüş):** `LLaVA` modeli sayesinde fiziksel reçeteleri veya tahlil kağıtlarının fotoğraflarını dijital veriye (OCR formatına) çevirebilir.
  - **2. Katman (Analiz ve RAG):** `Mistral / Medbot` destekli lokal arama yeteneği sayesinde büyük tıbbi veri tabanlarından destek alarak tahlil değerlerini yorumlar.
  - **3. Katman (Sadeleştirme):** Çıkan karmaşık sonuçları `Gemma` yardımıyla yaşlı veya çocuk hastaların anlayabileceği "insan diline" çevirir.
- 🔐 **Gelişmiş Kimlik Doğrulama:** bcrypt ile şifrelenmiş parolalar ve yetkisiz erişimi engelleyen JWT korumalı REST API.
- 🎨 **Modern ve Pürüzsüz Arayüz:** Custom Vanilla CSS ile dizayn edilmiş, flexbox destekli, temiz (clean) responsive tasarım.

## 🛠 Yığın (Tech Stack)

### Frontend (İstemci)
* **Temel Yapı:** HTML5, CSS3, Vanilla JavaScript
* **Tasarım Mimarisi:** Custom Grid/Flexbox Layout, Asenkron Fetch API entegrasyonu

### Backend (Sunucu)
* **Çekirdek:** [Node.js](https://nodejs.org/) ve [Express.js](https://expressjs.com/)
* **Veritabanı:** [MongoDB](https://www.mongodb.com/) ve Mongoose ODM
* **Güvenlik Katmanları:** `bcrypt` (şifre hashleme), `jsonwebtoken` (JWT Session)

### Yapay Zeka (AI)
* **Motor:** [Ollama](https://ollama.ai/) (Yerel, internet gerektirmeyen veri gizliliği odaklı LLM çalıştırıcısı)
* **Modeller:** LLaVA (Vision), Mistral (Core), Gemma (Summarizer)

---

## 💻 Sistem Gereksinimleri

Projeyi kendi ortamınızda ayağa kaldırmak için şunların cihazınızda kurulu olması gerekir:
1. **Node.js** (v16 veya üzeri)
2. **MongoDB** (Yerel Community Server veya bulut tabanlı Atlas - Varsayılan Port: `27017`)
3. **Ollama** (Yapay zeka modellerini yerelde host etmek için kurulu olmalı. API Varsayılan: `11434`)

## ⚙️ Kurulum Rehberi (Adım Adım)

### 1. Repoyu Klonlayın
```bash
git clone https://github.com/KULLANICI_ADINIZ/MediClear.git
cd MediClear
```

### 2. Gerekli Paketleri (Dependencies) Yükleyin
Proje kök dizinindeyken Node.js modüllerini kurun:
```bash
npm install
```

### 3. Çevre Değişkenlerini Ayarlayın
Repo ile birlikte gelen şablon konfigürasyon dosyasını (**.env.example**) kopyalayarak **.env** isimli yeni bir dosya oluşturun:
```bash
# Windows (PowerShell) için:
cp .env.example .env
```
Ardından oluşan `.env` dosyasını favori metin editörünüzde (VS Code vb.) açın ve JWT secret, MongoDB URI gibi değerleri doldurun.

### 4. Sunucuyu Başlatın
Tüm ayarlar tamamlandığında veritabanı bağlantısı ve Express sunucusunu aktif etmek için:
```bash
node server.js
```
Konsolda şu mesaji görmelisiniz:
> `MongoDB veritabanına başarıyla bağlanıldı! 🚀 DB Adı: MediClear`
> `Sunucu http://localhost:5000 üzerinde çalışıyor.`

### 5. Frontend'i Çalıştırın
Tasarımı görüntülemek için bilgisayarınızdaki basit bir statik sunucuyu kullanabilirsiniz (VS Code kullanıyorsanız `Live Server` eklentisi mükemmel çalışır). Tarayıcıda `index.html` sayfasını açtığınız an Backend ile otomatik haberleşecektir.

---

## 🤝 Katkıda Bulunun
1. Bu projeyi fork edin (`Fork`)
2. Yeni özellik dalınızı (`branch`) oluşturun (`git checkout -b feature/YeniOzellik`)
3. Değişiklikleri commit edin (`git commit -m 'Yeni efsane özellik eklendi'`)
4. Dalı repoya pushlayın (`git push origin feature/YeniOzellik`)
5. Bir Pull Request açın!

**Lisans:** MIT Lisansı ile açık kaynaklı sunulmuştur.
