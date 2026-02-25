/**
 * AUTH.JS - KİMLİK DOĞRULAMA & NAVBAR KATMANI
 *
 * Bu dosya tüm sayfalarda yüklenir ve şunları yönetir:
 *   1. Kullanıcı kayıt / giriş / çıkış API çağrıları (Node.js backend)
 *   2. JWT token'ı LocalStorage'da saklama / okuma
 *   3. Navbar'ı kullanıcı durumuna göre güncelleme
 *   4. Korumalı sayfalara yetkisiz erişimi engelleme
 *
 * Bağlantı Noktaları:
 *   Node.js Backend: http://localhost:5000/api/auth
 */

/** Basit frontend logger */
const log = {
    info: (...args) => console.info('[MediClear | auth]', ...args),
    warn: (...args) => console.warn('[MediClear | auth]', ...args),
    error: (...args) => console.error('[MediClear | auth]', ...args),
};

class Auth {
    constructor() {
        this.baseURL = 'http://localhost:5000/api/auth';
        this.tokenKey = 'mediclear_token';
        log.info(`Auth modülü hazır. Backend URL: ${this.baseURL}`);
    }

    // ── Yardımcı: Fetch Wrapper ────────────────────────────────────────────
    async #apiFetch(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const method = options.method || 'GET';
        log.info(`${method} ${url} — istek gönderiliyor...`);
        const start = performance.now();

        try {
            const response = await fetch(url, {
                headers: { 'Content-Type': 'application/json' },
                ...options,
            });
            const elapsed = (performance.now() - start).toFixed(0);
            log.info(`${method} ${url} → ${response.status} ${response.statusText} (${elapsed}ms)`);

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || `HTTP ${response.status}: İstek başarısız.`);
            }
            return data;
        } catch (error) {
            const elapsed = (performance.now() - start).toFixed(0);
            log.error(`${method} ${url} hatası (${elapsed}ms): ${error.message}`);
            throw error;
        }
    }

    // ── Yardımcı: Auth Header ──────────────────────────────────────────────
    #authHeader() {
        const token = localStorage.getItem(this.tokenKey);
        if (!token) {
            log.warn('Auth header oluşturulurken token bulunamadı!');
        }
        return { Authorization: `Bearer ${token}` };
    }

    /**
     * Yeni kullanıcı kaydı oluşturur.
     */
    async register(name, email, password) {
        log.info(`Kayıt isteği → email: "${email}", name: "${name}"`);
        try {
            const data = await this.#apiFetch('/register', {
                method: 'POST',
                body: JSON.stringify({ name, email, password }),
            });
            log.info(`✅ Kayıt başarılı → email: "${email}"`);
            return data;
        } catch (error) {
            log.error(`Kayıt başarısız (${email}): ${error.message}`);
            throw error;
        }
    }

    /**
     * Kullanıcı girişi yapar. Başarıda token + kullanıcı bilgisini saklar.
     */
    async login(email, password) {
        log.info(`Giriş isteği → email: "${email}"`);
        try {
            const data = await this.#apiFetch('/login', {
                method: 'POST',
                body: JSON.stringify({ email, password }),
            });

            localStorage.setItem(this.tokenKey, data.token);
            localStorage.setItem('mediclear_user', JSON.stringify(data.user));
            log.info(`✅ Giriş başarılı → email: "${email}", userId: ${data.user?.id}`);
            return data;
        } catch (error) {
            log.error(`Giriş başarısız (${email}): ${error.message}`);
            throw error;
        }
    }

    /**
     * Kullanıcının giriş yapmış olup olmadığını kontrol eder.
     */
    isLoggedIn() {
        const token = localStorage.getItem(this.tokenKey);
        const status = !!token;
        log.info(`Token kontrolü → ${status ? 'Oturum açık ✅' : 'Oturum yok ❌'}`);
        return status;
    }

    /**
     * LocalStorage'daki kullanıcı bilgilerini getirir.
     */
    getCurrentUser() {
        const user = localStorage.getItem('mediclear_user');
        return user ? JSON.parse(user) : null;
    }

    /**
     * Korumalı /profile endpoint'inden kullanıcı profilini getirir.
     */
    async getProfile() {
        log.info('Profil getirme isteği (JWT ile)...');
        try {
            const data = await this.#apiFetch('/profile', {
                headers: {
                    'Content-Type': 'application/json',
                    ...this.#authHeader(),
                },
            });
            log.info(`✅ Profil alındı → email: "${data.email}"`);
            return data;
        } catch (error) {
            log.error(`Profil getirme hatası: ${error.message}`);
            throw error;
        }
    }

    /**
     * Kullanıcı profilini günceller.
     */
    async updateProfile(profileData) {
        log.info(`Profil güncelleme isteği → alanlar: ${Object.keys(profileData).join(', ')}`);
        try {
            const data = await this.#apiFetch('/profile', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.#authHeader(),
                },
                body: JSON.stringify(profileData),
            });
            if (data.user) {
                localStorage.setItem('mediclear_user', JSON.stringify(data.user));
                log.info(`✅ Profil güncellendi, LocalStorage güncellendi → email: "${data.user.email}"`);
            }
            return data;
        } catch (error) {
            log.error(`Profil güncelleme hatası: ${error.message}`);
            throw error;
        }
    }

    /**
     * Çıkış yapar, token + kullanıcı bilgisini siler, ana sayfaya yönlendirir.
     */
    logout() {
        log.info('Çıkış yapılıyor, token ve kullanıcı bilgisi siliniyor...');
        localStorage.removeItem(this.tokenKey);
        localStorage.removeItem('mediclear_user');
        log.info('✅ Çıkış başarılı, index.html\'e yönlendiriliyor.');
        window.location.href = 'index.html';
    }
}

// ─── GLOBAL INSTANCE ────────────────────────────────────────────────────────
const auth = new Auth();


// ─── NAVBAR GÜNCELLEME ──────────────────────────────────────────────────────
function updateNavbarAuth() {
    const navContainer = document.querySelector('.nav-container');
    if (!navContainer) return;

    const existingAuthBtn = document.querySelector('.auth-btn-group');
    if (existingAuthBtn) existingAuthBtn.remove();

    const authDiv = document.createElement('div');
    authDiv.className = 'auth-btn-group';
    authDiv.style.cssText = 'display:flex; align-items:center; gap:1rem;';

    if (auth.isLoggedIn()) {
        const user = auth.getCurrentUser() || { name: 'Kullanıcı' };
        log.info(`Navbar güncellendi: oturum açık → Merhaba, ${user.name}`);
        authDiv.innerHTML = `
            <span class="user-greeting" style="font-weight:500;color:var(--primary);">Merhaba, ${user.name}</span>
            <a href="profile.html" class="btn btn-primary" style="padding:0.5rem 1rem;font-size:0.9rem;background-color:var(--secondary);">
                <i class="fa-solid fa-user"></i> Profilim
            </a>
            <button onclick="auth.logout()" class="btn" style="padding:0.5rem 1rem;font-size:0.9rem;background-color:#e63946;color:white;border:none;cursor:pointer;border-radius:5px;">
                <i class="fa-solid fa-right-from-bracket"></i> Çıkış
            </button>
        `;
    } else {
        log.info('Navbar güncellendi: oturum yok → Giriş Yap / Kayıt Ol gösteriliyor.');
        authDiv.innerHTML = `
            <a href="login.html" class="btn btn-outline" style="padding:0.5rem 1rem;font-size:0.9rem;">Giriş Yap</a>
            <a href="register.html" class="btn btn-primary" style="padding:0.5rem 1rem;font-size:0.9rem;">Kayıt Ol</a>
        `;
    }

    navContainer.appendChild(authDiv);
}


// ─── GÜVENLİK KONTROLÜ ──────────────────────────────────────────────────────
function checkAuth() {
    const path = window.location.pathname;
    let page = path.split('/').pop();
    if (page === '' || page === 'index.html') page = 'index.html';

    const publicPages = ['login.html', 'register.html', 'index.html'];
    const isPublic = publicPages.includes(page);

    log.info(`Sayfa güvenlik kontrolü → sayfa: "${page}", herkese açık: ${isPublic}, oturum: ${auth.isLoggedIn()}`);

    if (!auth.isLoggedIn() && !isPublic) {
        log.warn(`Korumalı sayfaya yetkisiz erişim denemesi → "${page}" → login.html'e yönlendiriliyor.`);
        window.location.href = 'login.html';
    }
}


// ─── SAYFA YÜKLEME ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    updateNavbarAuth();
});
