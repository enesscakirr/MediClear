/**
 * HOSPITALS.JS
 * 
 * Yakınımdaki Hastaneler sayfası için harita ve API mantığını yönetir.
 */

(function () {
    // ─── YAPILANDIRMA ──────────────────────────────────────────────────────────
    const API_URL = 'http://localhost:8000/api/find_hospitals';

    // ─── DOM ELEMANLARI ─────────────────────────────────────────────────────────
    const searchForm = document.getElementById('hospitalSearchForm');
    const locationInput = document.getElementById('locationInput');
    const hospitalList = document.getElementById('hospitalList');
    const aiStatus = document.getElementById('aiStatus');

    // ─── HARİTA BAŞLATMA (Leaflet.js) ───────────────────────────────────────────
    // Başlangıçta Türkiye merkezli bir görünüm
    const initialCoords = [41.0082, 28.9784]; 
    const map = L.map('hospitalMap').setView(initialCoords, 10);

    // Ücretsiz OpenStreetMap katmanını ekle
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap contributors</a>'
    }).addTo(map);

    // Markerları tutacağımız dizi
    let currentMarkers = [];

    // ─── KULLANICI LOKASYON İZNİ (Opsiyonel Geliştirme) ─────────────────────────
    /* 
    İstenirse Geolocation API ile kullanıcının anlık konumu alınıp map oraya focuslanabilir:
    if ("geolocation" in navigator) { ... }
    */

    // ─── API İSTEĞİ VE HARİTA ÇİZİMİ ───────────────────────────────────────────
    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const locationQuery = locationInput.value.trim();
        
        if (!locationQuery) return;

        // UI Güncelleme (Yükleniyor)
        aiStatus.style.display = 'flex';
        hospitalList.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <p>AI "${locationQuery}" çevresindeki hastaneleri araştırıyor...</p>
            </div>
        `;

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ location: locationQuery })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Sunucu hatası');
            }

            const data = await response.json();
            
            // Markerları sıfırla
            currentMarkers.forEach(marker => map.removeLayer(marker));
            currentMarkers = [];

            if (data.hospitals && data.hospitals.length > 0) {
                // Listeyi temizle
                hospitalList.innerHTML = '';
                
                // Haritanın merkezini ve zoom'unu ayarlamak için tüm koordinatları tutacağız
                const bounds = [];

                data.hospitals.forEach((hosp, index) => {
                    // 1. Liste için Ekle
                    const card = document.createElement('div');
                    card.className = 'hospital-card';
                    card.innerHTML = `
                        <div class="card-rating"><i class="fa-solid fa-star"></i> ${hosp.rating}</div>
                        <h3 class="hospital-name">${hosp.name}</h3>
                        <div class="hospital-address">
                            <i class="fa-solid fa-map-pin"></i>
                            <span>${hosp.address}</span>
                        </div>
                        <div class="hospital-tags">
                            <span class="hospital-tag">Hizmete Açık</span>
                            <span class="hospital-tag">AI Önerisi</span>
                        </div>
                    `;
                    
                    hospitalList.appendChild(card);

                    // 2. Harita için Marker (Pin) Ekle
                    const customIcon = L.divIcon({
                        className: 'custom-pin',
                        html: `<div style="background:var(--primary);color:white;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 6px rgba(0,0,0,0.3);border:2px solid white;"><i class="fa-solid fa-plus"></i></div>`,
                        iconSize: [30, 30],
                        iconAnchor: [15, 30],
                        popupAnchor: [0, -30]
                    });

                    const marker = L.marker([hosp.lat, hosp.lng], { icon: customIcon }).addTo(map);
                    
                    marker.bindPopup(`
                        <div class="custom-popup">
                            <h4>${hosp.name}</h4>
                            <p>${hosp.address}</p>
                        </div>
                    `);

                    currentMarkers.push(marker);
                    bounds.push([hosp.lat, hosp.lng]);

                    // Kart tıklanınca haritada o pine git ve popup aç
                    card.addEventListener('click', () => {
                        // Diğer aktifleri kaldır
                        document.querySelectorAll('.hospital-card').forEach(c => c.classList.remove('active'));
                        card.classList.add('active');
                        
                        map.setView([hosp.lat, hosp.lng], 16, { animate: true });
                        marker.openPopup();
                    });
                });

                // Haritayı tüm iğneleri (pinleri) sığdıracak şekilde yakınlaştır
                if (bounds.length > 0) {
                    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
                }

                // AI Mesajını göster (örn: "Kadıköy bölgesinde 3 hastane bulundu")
                const msgEl = document.createElement('div');
                msgEl.style.cssText = "font-size:0.85rem; color:#64748b; margin-bottom:1rem; padding:0.75rem 1.5rem; border-bottom:1px solid #e2e8f0; font-style:italic; text-align:center; line-height:1.5;";
                msgEl.innerHTML = `<i class="fa-solid fa-robot text-primary"></i> ${data.message}`;
                hospitalList.prepend(msgEl);

            } else {
                // Hastane bulunamadıysa
                hospitalList.innerHTML = `
                    <div class="empty-state">
                        <i class="fa-regular fa-face-frown-open"></i>
                        <p>Belirttiğiniz konumda (${data.location_detected || locationQuery}) hastane bulunamadı.</p>
                        <small>Farklı bir ilçe/şehir yazmayı deneyebilirsiniz.</small>
                    </div>
                `;
            }

        } catch (error) {
            console.error("API Hatası:", error);
            hospitalList.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-triangle-exclamation" style="color:#ef4444;"></i>
                    <p>Arama sırasında bir teknik hata oluştu.</p>
                    <small>${error.message}</small>
                </div>
            `;
        } finally {
            aiStatus.style.display = 'none';
        }
    });

})();
