/**
 * ANALYST.JS - YAPAY ZEKA VE GÖRSEL İŞLEME MERKEZİ
 * 
 * Bu dosya, sitemizin "Beyni"dir.
 * 1. Resim yüklenirse: "Gören Göz" (LLaVA) onu okur ve tabloya çevirir.
 * 2. Çeviri: İngilizceye çevirir (Çünkü yapay zeka İngilizceyi daha iyi anlar).
 * 3. Analiz: "Tıbbi Akıl" (Mistral) sonuçları yorumlar.
 * 4. Sonuç: "Çevirmen" (Gemma) her şeyi Türkçeye çevirip ekrana basar.
 */

// Ollama sunucusuyla konuşacağımız adres (Kapı Numarası)
const OLLAMA_API_URL = 'http://localhost:11434/api/generate';

// --- AYARLAR (KULLANILAN MODELLER) ---
// Buradaki isimler bilgisayarınızda yüklü olan modellerle AYNI olmalıdır.
const TRANSLATOR_MODEL = 'translategemma:latest'; // Dil Uzmanı (Çevirmen)
const MEDICAL_MODEL = 'Goosedev/medbot:latest';   // Tıp Uzmanı (Doktor)
const VISION_MODEL = 'llava:7b';                  // Görsel Uzmanı (Göz)

// Global değişken: Yüklenen resmin kodunu burada tutacağız
let selectedImageBase64 = null;

// --- RESİM YÜKLEME İŞLEMLERİ ---
// HTML sayfasındaki elemanları (butonlar, resim kutusu) seçiyoruz
const fileInput = document.getElementById('imageInput'); // Gizli dosya seçici
const uploadBtn = document.getElementById('uploadBtn');  // "Resim Yükle" butonu
const fileNameDisplay = document.getElementById('fileName'); // Dosya adı yazan yer
const imagePreview = document.getElementById('imagePreview'); // Resmin önizlemesi
const previewImg = imagePreview.querySelector('img'); // Önizleme etiketi
const removeBtn = document.getElementById('removeImageBtn'); // "Kaldır" butonu

// "Fotoğraf Yükle" butonuna basınca, gizli dosya seçiciyi tetikle
uploadBtn.addEventListener('click', () => fileInput.click());

// Kullanıcı bir dosya seçtiğinde çalışır
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0]; // Seçilen ilk dosyayı al
    if (!file) return; // Dosya yoksa dur

    fileNameDisplay.textContent = file.name; // Dosya adını ekrana yaz

    // Resmi bilgisayarın anlayacağı dile (Base64) çevirmemiz lazım
    const reader = new FileReader();
    reader.onload = function (event) {
        // Base64 kodunu al ve değişkene kaydet
        selectedImageBase64 = event.target.result.split(',')[1];
        // Önizleme alanında resmi göster
        previewImg.src = event.target.result;
        imagePreview.style.display = 'block';
    };
    reader.readAsDataURL(file); // Okuma işlemini başlat
});

// "Resmi Kaldır" butonuna basınca her şeyi temizle
removeBtn.addEventListener('click', () => {
    fileInput.value = '';
    selectedImageBase64 = null;
    imagePreview.style.display = 'none';
    fileNameDisplay.textContent = '';
});


// --- "ANALİZ ET" BUTONUNA BASINCA NELER OLUYOR? ---
document.getElementById('analyzeBtn').addEventListener('click', async () => {
    // Kullanıcının yazdığı metni al (veya boşsa da sorun değil, belki sadece resim vardır)
    let input = document.getElementById('medicalInput').value.trim();

    // Ekranda değişiklik yapacağımız yerleri seçelim
    const btn = document.getElementById('analyzeBtn');
    const spinner = document.querySelector('.loading-spinner'); // Dönme efekti
    const btnText = btn.querySelector('span');
    const icon = btn.querySelector('.fa-wand-magic-sparkles');
    const resultArea = document.getElementById('resultArea'); // Sonuç kutusu
    const aiOutput = document.getElementById('aiOutput'); // Cevabın yazılacağı yer
    const stepsLog = document.createElement('div'); // İşlem adımlarını gösterecek yeni bir kutu oluştur

    // Eğer ne metin var ne de resim, kullanıcıyı uyar
    if (!input && !selectedImageBase64) {
        alert("Lütfen bir metin girin veya resim yükleyin. Boş analiz yapamam!");
        return;
    }

    // --- HAZIRLIK MODU ---
    btn.disabled = true; // Butona tekrar basılmasın
    spinner.style.display = 'block'; // Dönme efekti başlasın
    btnText.style.display = 'none'; // "Analiz Et" yazısı gizlensin
    icon.style.display = 'none'; // İkon gizlensin
    resultArea.style.display = 'none'; // Eski sonuç varsa gizle
    aiOutput.innerHTML = ''; // Eski cevabı sil

    // Adım adım ne yaptığımızı gösterecek bilgi çubuğunu hazırla
    stepsLog.className = 'process-log';
    stepsLog.style.fontSize = '0.9rem';
    stepsLog.style.color = '#666';
    stepsLog.style.marginBottom = '1rem';
    stepsLog.style.fontStyle = 'italic';
    resultArea.prepend(stepsLog); // Sonuç alanının en tepesine ekle

    // Durum güncelleme fonksiyonu (Ekrana "Şunu yapıyorum..." yazar)
    const updateStatus = (message) => {
        stepsLog.innerHTML = `<i class="fa-solid fa-gear fa-spin"></i> ${message}`;
    };

    try {
        // --- ADIM 0: GÖRSEL OKUMA (VISION) ---
        // Eğer bir resim yüklenmişse önce onu okumamız lazım
        if (selectedImageBase64) {
            updateStatus(`"${VISION_MODEL}" ile resim tabloya dönüştürülüyor...`);

            // Yapay zekaya (LLaVA) verdiğimiz emir: "Bunu Excel tablosu gibi yap"
            const visionPrompt = `
            Extract the medical data from this image and format it as a Markdown Table.
            Columns: Test Name | Result | Unit | Reference Range.
            If a value is not visible, leave it empty.
            Do NOT write any introduction or explanation, just the table.
            `;

            // Vision modeline resmi ve emri gönderiyoruz
            const visionResponse = await fetch(OLLAMA_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: VISION_MODEL,
                    prompt: visionPrompt,
                    images: [selectedImageBase64],
                    stream: false
                })
            });

            if (!visionResponse.ok) throw new Error("Görsel okuma modeli (Vision) cevap vermedi.");

            const visionData = await visionResponse.json();
            const extractedText = visionData.response.trim();

            console.log("Tablo Olarak Okunan:", extractedText);

            // Okunan tabloyu metnin başına ekle, böylece sonraki aşamalarda analiz edilebilir
            input = `[GÖRSELDEN ÇIKARILAN TABLO]:\n${extractedText}\n\n[KULLANICI NOTU]:\n${input}`;
        }

        // --- ADIM 1: İNGİLİZCEYE ÇEVİRİ ---
        // Tıbbi modeller İngilizceyi daha iyi anladığı için önce her şeyi İngilizce yapıyoruz
        updateStatus(`"${TRANSLATOR_MODEL}" ile veriler İngilizceye çevriliyor...`);
        const englishText = (await callOllama(TRANSLATOR_MODEL, `Translate this medical text/table to English. Keep the table structure intact. Text: "${input}"`)).response.trim();

        // --- ADIM 2: TIBBİ ANALİZ (DOKTOR GÖRÜŞÜ) ---
        updateStatus(`"${MEDICAL_MODEL}" tahlilleri inceliyor...`);
        // Doktora verdiğimiz emir: "Yetişkin birine anlatır gibi açıkla"
        const analysisPrompt = `
        You are an expert medical AI. Analyze the following medical findings (text or table).
        Explain what the values mean to an adult patient. 
        - If there is a table, go through abnormal values first.
        - Explain what "High" or "Low" results might indicate effectively.
        - Use reassurance and clear language.
        - Warning: "This is not a medical diagnosis."
        
        Medical Data: "${englishText}"
        `;
        const englishAnalysis = (await callOllama(MEDICAL_MODEL, analysisPrompt)).response.trim();

        // --- ADIM 3: TÜRKÇEYE ÇEVİRİ (SONUÇ) ---
        // Doktorun İngilizce yorumunu alıp Türkçeye çeviriyoruz
        updateStatus(`"${TRANSLATOR_MODEL}" ile sonuçlar Türkçeye çevriliyor...`);
        const finalTranslationPrompt = `
        Translate the following medical analysis into clear, professional Turkish.
        Do not use childish tones. Use "Siz" (polite form).
        
        Text: "${englishAnalysis}"
        `;
        const finalTurkishResult = (await callOllama(TRANSLATOR_MODEL, finalTranslationPrompt)).response.trim();

        // --- SONUÇLARI GÖSTER ---
        updateStatus("İşlem Tamamlandı! ✅");
        setTimeout(() => stepsLog.style.display = 'none', 3000); // 3 saniye sonra durum çubuğunu gizle

        // Markdown formatındaki sonucu (kalın yazılar, tablolar) HTML'e çevirip ekrana bas
        // 'marked.parse' kütüphaneden gelir
        aiOutput.innerHTML = marked.parse(finalTurkishResult);

        // --- DETAYLAR BUTONU ---
        // Kullanıcı isterse arka planda neler döndüğünü (ham verileri) görebilsin
        const detailsHTML = `
            <div style="margin-top: 2rem; border-top: 1px solid #eee; padding-top: 1rem;">
                <button onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'" 
                        class="btn-link" style="background:none; border:none; cursor:pointer; color:#666; font-size:0.9rem; text-decoration:underline;">
                    <i class="fa-solid fa-code-branch"></i> Teknik Detayları Göster
                </button>
                <div style="display: none; background: #f8f9fa; padding: 1rem; margin-top: 0.5rem; border-radius: 8px; font-size: 0.85rem;">
                    <p><strong>1. Girdi (Ham Veri):</strong><br>${input}</p>
                    <hr>
                    <p><strong>2. İngilizce Çeviri:</strong><br>${englishText}</p>
                    <hr>
                    <p><strong>3. Doktor Analizi (İngilizce):</strong><br>${englishAnalysis}</p>
                </div>
            </div>
        `;
        aiOutput.insertAdjacentHTML('beforeend', detailsHTML);

        // Sonuç alanını görünür yap ve oraya kaydır
        resultArea.style.display = 'block';
        resultArea.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (error) {
        // Bir hata olursa (örn: Ollama kapalıysa) burası çalışır
        console.error(error);
        updateStatus("HATA OLUŞTU: " + error.message);
        aiOutput.innerHTML = `<div class="alert alert-danger">
            <strong>Bir sorun var:</strong> ${error.message} <br>
            <small>Lütfen Ollama'nın açık olduğundan ve modellerin yüklü olduğundan emin olun.</small>
        </div>`;
        resultArea.style.display = 'block';
    } finally {
        // --- TEMİZLİK ---
        // İşlem bitince (başarılı veya hatalı) butonu tekrar aktif yap
        btn.disabled = false;
        spinner.style.display = 'none';
        btnText.style.display = 'block';
        icon.style.display = 'block';
    }
});

/**
 * YARDIMCI FONKSİYON: OLLAMA İLE İLETİŞİM
 * Bu fonksiyon, sürekli aynı fetch kodunu yazmamak için yapılmıştır.
 * Sadece model ismini ve soruyu verirsiniz, cevabı döner.
 */
async function callOllama(model, prompt) {
    const res = await fetch(OLLAMA_API_URL, {
        method: 'POST', // Mektup gönderiyoruz
        headers: { 'Content-Type': 'application/json' }, // Formatımız JSON
        body: JSON.stringify({ model, prompt, stream: false }) // Parça parça değil, bütün cevap istiyoruz
    });
    if (!res.ok) throw new Error(`${model} yanıt vermedi. (Durum: ${res.status})`);
    return await res.json();
}
