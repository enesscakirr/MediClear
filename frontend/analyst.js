/**
 * ANALYST.JS - UI KATMANI
 *
 * Bu dosya sadece kullanıcı arayüzü işlemlerini yönetir:
 *   1. Resim yükleme & önizleme
 *   2. "Analiz Et" butonuna basınca Python AI Service'e istek gönderme
 *   3. Gelen sonucu ekranda Markdown olarak gösterme
 *
 * Tüm LLM / AI mantığı → ai-service/graph.py (LangGraph) tarafından yürütülür.
 *
 * Bağlantı Noktaları:
 *   Python AI Service : http://localhost:8000/api/analyze
 *
 * NOT: auth.js de global `const log` tanımladığı için bu dosyada
 *      çakışmayı önlemek amacıyla IIFE kullanıldı.
 */

(function () {

    // ─── YAPILANDIRMA ──────────────────────────────────────────────────────────
    const PYTHON_API_URL = 'http://localhost:8000/api/analyze';

    /** Basit frontend logger */
    const log = {
        info: (...args) => console.info('[MediClear | analyst]', ...args),
        warn: (...args) => console.warn('[MediClear | analyst]', ...args),
        error: (...args) => console.error('[MediClear | analyst]', ...args),
    };

    log.info(`Analyst modülü yüklendi. AI Service URL: ${PYTHON_API_URL}`);

    // ─── DOM ELEMANLARI ─────────────────────────────────────────────────────────
    const fileInput = document.getElementById('imageInput');
    const uploadBtn = document.getElementById('uploadBtn');
    const fileNameDisplay = document.getElementById('fileName');
    const imagePreview = document.getElementById('imagePreview');
    const previewImg = imagePreview.querySelector('img');
    const removeBtn = document.getElementById('removeImageBtn');

    let selectedImageBase64 = null;

    // ─── RESİM YÜKLEME ──────────────────────────────────────────────────────────
    uploadBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        log.info(`Resim seçildi: "${file.name}" (${(file.size / 1024).toFixed(1)} KB, type: ${file.type})`);
        fileNameDisplay.textContent = file.name;

        const reader = new FileReader();
        reader.onload = (event) => {
            selectedImageBase64 = event.target.result.split(',')[1];
            previewImg.src = event.target.result;
            imagePreview.style.display = 'block';
            log.info(`Resim Base64'e dönüştürüldü (${selectedImageBase64.length} karakter).`);
        };
        reader.onerror = (err) => {
            log.error('Resim okuma hatası:', err);
        };
        reader.readAsDataURL(file);
    });

    removeBtn.addEventListener('click', () => {
        log.info('Resim kaldırıldı.');
        fileInput.value = '';
        selectedImageBase64 = null;
        imagePreview.style.display = 'none';
        fileNameDisplay.textContent = '';
    });


    // ─── ANALİZ BUTONU ──────────────────────────────────────────────────────────
    document.getElementById('analyzeBtn').addEventListener('click', async () => {
        const input = document.getElementById('medicalInput').value.trim();
        const btn = document.getElementById('analyzeBtn');
        const spinner = btn.querySelector('.loading-spinner');
        const btnText = btn.querySelector('span');
        const icon = btn.querySelector('.fa-wand-magic-sparkles');
        const resultArea = document.getElementById('resultArea');
        const aiOutput = document.getElementById('aiOutput');

        // ── Girdi Doğrulama ──
        if (!input && !selectedImageBase64) {
            log.warn('Boş analiz denemesi: metin ve görsel ikisi de boş.');
            alert('Lütfen bir metin girin veya resim yükleyin. Boş analiz yapamam!');
            return;
        }

        log.info(`Analiz başlatılıyor → metin: ${!!input}, görsel: ${!!selectedImageBase64}`);

        // ── İşlem Göstergesi ──
        let stepsLog = resultArea.querySelector('.process-log');
        if (!stepsLog) {
            stepsLog = document.createElement('div');
            stepsLog.className = 'process-log';
            stepsLog.style.cssText = 'font-size:0.9rem;color:#666;margin-bottom:1rem;font-style:italic;';
            resultArea.prepend(stepsLog);
        }
        const updateStatus = (msg) => {
            stepsLog.style.display = 'block';
            stepsLog.innerHTML = `<i class="fa-solid fa-gear fa-spin"></i> ${msg}`;
        };

        // ── UI Hazırlık ──
        btn.disabled = true;
        spinner.style.display = 'block';
        btnText.style.display = 'none';
        icon.style.display = 'none';
        aiOutput.innerHTML = '';
        updateStatus('Python AI Service\'e bağlanılıyor...');
        resultArea.style.display = 'block';

        const requestBody = {
            text: input,
            image_base64: selectedImageBase64,
        };

        log.info(`POST ${PYTHON_API_URL} — istek gönderiliyor...`);
        const fetchStart = performance.now();

        try {
            const res = await fetch(PYTHON_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            const fetchTime = (performance.now() - fetchStart).toFixed(0);
            log.info(`POST ${PYTHON_API_URL} → ${res.status} ${res.statusText} (${fetchTime}ms)`);

            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(err.detail || `Sunucu hatası: ${res.status}`);
            }

            const data = await res.json();
            log.info(`Yanıt alındı: ${data.steps?.length || 0} adım, sonuç uzunluğu: ${data.result?.length || 0} karakter`);

            // Tüm adımları birlikte, kalıcı olarak göster
            if (data.steps && data.steps.length > 0) {
                stepsLog.style.display = 'block';
                stepsLog.innerHTML = data.steps
                    .map((s, i) => `<div style="margin:2px 0;"><span style="color:var(--primary);font-weight:600;">${i + 1}.</span> ${s}</div>`)
                    .join('');
                stepsLog.style.cssText += 'font-style:normal;border:1px solid #e0f0ff;border-radius:6px;padding:0.75rem;background:#f5fbff;';
            }

            // Sonucu Markdown olarak render et
            aiOutput.innerHTML = marked.parse(data.result);

            // ── Teknik Detaylar (isteğe bağlı, collapsible) ──
            const hasDetails = data.english_text || data.english_analysis;
            if (hasDetails) {
                const tableSection = data.extracted_table
                    ? `<p><strong>0. Görselden Çıkarılan Tablo:</strong><br><pre style="white-space:pre-wrap;font-size:0.8rem;">${data.extracted_table}</pre></p><hr>`
                    : '';

                const detailsHTML = `
                <div style="margin-top:2rem;border-top:1px solid #eee;padding-top:1rem;">
                    <button
                        onclick="const d=this.nextElementSibling;d.style.display=d.style.display==='none'?'block':'none';this.textContent=d.style.display==='none'?'Teknik Detaylari Goster':'Teknik Detaylari Gizle';"
                        style="background:none;border:none;cursor:pointer;color:#888;font-size:0.85rem;text-decoration:underline;padding:0;">
                        Teknik Detaylari Goster
                    </button>
                    <div style="display:none;background:#f8f9fa;padding:1rem;margin-top:0.75rem;border-radius:8px;font-size:0.82rem;line-height:1.5;">
                        ${tableSection}
                        <p><strong>1. Girdi (Ham Veri):</strong><br>${data.raw_input || '-'}</p>
                        <hr>
                        <p><strong>2. Ingilizce Ceviri:</strong><br>${data.english_text || '-'}</p>
                        <hr>
                        <p><strong>3. Doktor Analizi (Ingilizce):</strong><br>${data.english_analysis || '-'}</p>
                    </div>
                </div>`;
                aiOutput.insertAdjacentHTML('beforeend', detailsHTML);
            }

            setTimeout(() => (stepsLog.style.display = 'none'), 3000);
            resultArea.scrollIntoView({ behavior: 'smooth', block: 'start' });

        } catch (error) {
            const fetchTime = (performance.now() - fetchStart).toFixed(0);
            log.error(`Analiz istegi basarisiz (${fetchTime}ms):`, error.message);
            updateStatus('HATA OLUSTU: ' + error.message);
            aiOutput.innerHTML = `
            <div class="alert alert-danger">
                <strong>Bir sorun olustu:</strong> ${error.message}<br>
                <small>
                    Python AI servisini baslatmak icin:<br>
                    <code>cd ai-service</code> &rarr;
                    <code>uv run python -m uvicorn main:app --reload --port 8000</code>
                </small>
            </div>`;
        } finally {
            btn.disabled = false;
            spinner.style.display = 'none';
            btnText.style.display = 'block';
            icon.style.display = 'block';
        }
    });

})(); // IIFE sonu
