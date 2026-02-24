class Auth {
    constructor() {
        // Backend sunucunuzun temel URL adresi
        this.baseURL = 'http://localhost:5000/api/auth';
        this.tokenKey = 'mediclear_token';
    }

    /**
     * Kullanıcı kayıt isteği atar
     * @param {string} name 
     * @param {string} email 
     * @param {string} password 
     * @returns {Promise<Object>} Backend'den dönen response datası
     */
    async register(name, email, password) {
        try {
            const response = await fetch(`${this.baseURL}/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, email, password })
            });

            const data = await response.json();

            // Eğer backend 400 ya da 500 gibi hata kodları döndüyse hatayı fırlat
            if (!response.ok) {
                throw new Error(data.message || 'Kayıt olurken bilinmeyen bir hata oluştu.');
            }

            return data;
        } catch (error) {
            console.error('Kayıt İşlemi Başarısız:', error);
            throw error;
        }
    }

    /**
     * Kullanıcı giriş isteği atar. Başarılıysa Token'i kaydeder.
     * @param {string} email 
     * @param {string} password 
     * @returns {Promise<Object>} Backend'den dönen response datası
     */
    async login(email, password) {
        try {
            const response = await fetch(`${this.baseURL}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Giriş başarısız oldu.');
            }

            // Başarılı girişte Token'ı LocalStorage'a kaydet
            localStorage.setItem(this.tokenKey, data.token);
            // Kullanıcı bilgilerini de kaydet
            localStorage.setItem('mediclear_user', JSON.stringify(data.user));

            return data;
        } catch (error) {
            console.error('Giriş İşlemi Başarısız:', error);
            throw error;
        }
    }

    /**
     * Kullanıcı sistemde giriş yapmış durumda mı kontrol eder.
     * @returns {boolean}
     */
    isLoggedIn() {
        const token = localStorage.getItem(this.tokenKey);
        // İleri seviyede token'in formatı ve geçerlilik süresi de (decode edilerek) test edilebilir.
        return !!token; // token varsa true, null ise false döner.
    }

    /**
     * LocalStorage'daki geçerli kullanıcı bilgilerini getirir.
     * @returns {Object|null}
     */
    getCurrentUser() {
        const user = localStorage.getItem('mediclear_user');
        return user ? JSON.parse(user) : null;
    }

    /**
     * Kullanıcı profilini backend'den getirir (JWT ile korumalı)
     * @returns {Promise<Object>} Backend'den dönen profile datası
     */
    async getProfile() {
        try {
            const token = localStorage.getItem(this.tokenKey);
            const response = await fetch(`${this.baseURL}/profile`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Profil yüklenemedi.');
            return data;
        } catch (error) {
            console.error('Profil Getirme Hatası:', error);
            throw error;
        }
    }

    /**
     * Kullanıcı profilini backend'de günceller
     * @param {Object} profileData - {name, email, password}
     * @returns {Promise<Object>} Backend'den dönen response datası
     */
    async updateProfile(profileData) {
        try {
            const token = localStorage.getItem(this.tokenKey);
            const response = await fetch(`${this.baseURL}/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(profileData)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Profil güncellenemedi.');

            // Eğer profil başarıyla güncellendiyse LocalStorage'ı da güncelle
            if (data.user) {
                localStorage.setItem('mediclear_user', JSON.stringify(data.user));
            }
            return data;
        } catch (error) {
            console.error('Profil Güncelleme Hatası:', error);
            throw error;
        }
    }

    /**
     * Kullanıcı çıkışı yapar, tokeni siler ve ana sayfaya yönlendirir.
     */
    logout() {
        localStorage.removeItem(this.tokenKey);
        localStorage.removeItem('mediclear_user');

        // Çıkış sonrası kullanılacak ana sayfa dizini (projenize göre değiştirebilirsiniz)
        window.location.href = '/index.html';
    }
}

// Uygulamada kullanmak üzere instance oluşturalım
const auth = new Auth();


// --- NAVBAR GÜNCELLEME ---
// Sağ üstteki menüyü duruma göre (Giriş Yap / Çıkış) değiştirir
function updateNavbarAuth() {
    // Tüm navigasyon barını kapsayan ana konteyneri bul
    const navContainer = document.querySelector('.nav-container');
    if (!navContainer) return;

    // Daha önce eklenmiş buton grubu varsa temizle (tekrar tekrar eklenmesin)
    const existingAuthBtn = document.querySelector('.auth-btn-group');
    if (existingAuthBtn) existingAuthBtn.remove();

    // Yeni bir div oluştur (Artık ul içinde değil, ana barda sağda duracak)
    const authDiv = document.createElement('div');
    authDiv.className = 'auth-btn-group';

    // Görünüm ayarları (CSS yerine buradan hızlıca stil verildi)
    authDiv.style.display = 'flex';
    authDiv.style.alignItems = 'center';
    authDiv.style.gap = '1rem';

    // DURUM KONTROLÜ
    if (auth.isLoggedIn()) {
        // -- DURUM 1: GİRİŞ YAPILMIŞ --
        const user = auth.getCurrentUser() || { name: 'Kullanıcı' };
        // İsim göster, profil butonu ve kırmızı "Çıkış" butonu koy
        authDiv.innerHTML = `
            <span class="user-greeting" style="font-weight: 500; color: var(--primary);">Merhaba, ${user.name}</span>
            <a href="profile.html" class="btn btn-primary" style="padding: 0.5rem 1rem; font-size: 0.9rem; background-color: var(--secondary);">
                <i class="fa-solid fa-user"></i> Profilim
            </a>
            <button onclick="auth.logout()" class="btn" style="padding: 0.5rem 1rem; font-size: 0.9rem; background-color: #e63946; color: white; border: none; cursor: pointer; border-radius: 5px;">
                <i class="fa-solid fa-right-from-bracket"></i> Çıkış 
            </button>
        `;
    } else {
        // -- DURUM 2: GİRİŞ YAPILMAMIŞ --
        // "Giriş Yap" ve "Kayıt Ol" butonlarını koy
        authDiv.innerHTML = `
            <a href="login.html" class="btn btn-outline" style="padding: 0.5rem 1rem; font-size: 0.9rem;">Giriş Yap</a>
            <a href="register.html" class="btn btn-primary" style="padding: 0.5rem 1rem; font-size: 0.9rem;">Kayıt Ol</a>
        `;
    }

    // Oluşturulan bu bağımsız alanı Ana Container'ın en sonuna (en sağına) ekle
    navContainer.appendChild(authDiv);
}

// --- GÜVENLİK KONTROLÜ ---
// Sayfa yüklenirken çalışır. İzinsiz girişleri engeller.
function checkAuth() {
    const path = window.location.pathname;
    // Hangi sayfadayız? (örn: 'blog.html')
    let page = path.split("/").pop();
    // Eğer anasayfadaysak (boşluk veya index.html)
    if (page === "" || page === "index.html") page = "index.html";

    // Herkesin görebileceği sayfalar listesi
    const publicPages = ['login.html', 'register.html'];

    // KURAL: Giriş yapılmadıysa VE açık sayfalardan birinde değilse -> LOGIN'e AT
    if (!auth.isLoggedIn() && !publicPages.includes(page)) {
        window.location.href = 'login.html';
    }
}

// Sayfa tamamen yüklendiğinde bu fonksiyonları çalıştır
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();        // Önce güvenlik kontrolü
    updateNavbarAuth(); // Sonra menüyü güncelle
});
