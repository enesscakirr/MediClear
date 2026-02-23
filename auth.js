/**
 * AUTH.JS - KULLANICI GİRİŞ SİSTEMİ
 * 
 * Bu dosya, sitenin güvenlik görevlisidir. 
 * Kullanıcıların kayıt olmasını, giriş yapmasını ve çıkış işlemini yönetir.
 * Gerçek bir sunucu olmadığı için bilgileri tarayıcının hafızasına (LocalStorage) yazar.
 */

class Auth {
    constructor() {
        // Tarayıcı hafızasından kayıtlı tüm kullanıcıları al
        // Eğer hiç kullanıcı yoksa boş bir liste ([]) başlat
        this.users = JSON.parse(localStorage.getItem('users')) || [];

        // Şu an giriş yapmış olan kullanıcıyı hafızadan al
        // Eğer kimse giriş yapmamışsa 'null' (boş) döner
        this.currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;
    }

    // --- KAYIT OLMA FONKSİYONU ---
    register(name, email, password) {
        // Kontrol 1: Bu e-posta ile daha önce kayıt olunmuş mu?
        if (this.users.find(user => user.email === email)) {
            return { success: false, message: 'Bu e-posta adresi zaten kayıtlı.' };
        }

        // Yeni kullanıcı objesi oluştur
        const newUser = {
            id: Date.now(), // Benzersiz bir kimlik numarası (şu anki zaman)
            name,
            email,
            password // NOT: Gerçek projelerde şifreler şifrelenerek (hash) saklanmalıdır!
        };

        // Listeye ekle ve hafızayı güncelle
        this.users.push(newUser);
        localStorage.setItem('users', JSON.stringify(this.users));

        return { success: true, message: 'Kayıt başarılı! Giriş yapabilirsiniz.' };
    }

    // --- GİRİŞ YAPMA FONKSİYONU ---
    login(email, password) {
        // Kullanıcı listesinde e-postası ve şifresi eşleşen birini ara
        const user = this.users.find(u => u.email === email && u.password === password);

        if (user) {
            // Eşleşme bulundu, 'currentUser' olarak işaretle
            this.currentUser = user;
            // Tarayıcı kapatılsa bile hatırla
            localStorage.setItem('currentUser', JSON.stringify(user));
            return { success: true, message: 'Giriş başarılı.' };
        }

        // Eşleşme yoksa hata dön
        return { success: false, message: 'E-posta veya şifre hatalı.' };
    }

    // --- ÇIKIŞ YAPMA FONKSİYONU ---
    logout() {
        this.currentUser = null;
        // Hafızadan 'şu anki kullanıcı' bilgisini sil
        localStorage.removeItem('currentUser');
        // Ana sayfaya yönlendir
        window.location.href = 'index.html';
    }

    // Kullanıcı giriş yapmış mı? (Evet/Hayır döner)
    isLoggedIn() {
        return !!this.currentUser; // '!!' işareti değeri true/false'a çevirir
    }

    // Giriş yapmış kullanıcının bilgilerini ver
    getCurrentUser() {
        return this.currentUser;
    }
}

// Auth sınıfından bir örnek oluştur (artık 'auth' değişkeni ile her yerden erişilebilir)
const auth = new Auth();

// --- NAVBAR GÜNCELLEME ---
// Sağ üstteki menüyü duruma göre (Giriş Yap / Çıkış) değiştirir
function updateNavbarAuth() {
    // Menü listesini bul (<ul class="nav-links">)
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return; // Eğer menü yoksa (bazı sayfalarda olmayabilir) dur

    // Daha önce eklenmiş buton varsa temizle (tekrar tekrar eklenmesin)
    const existingAuthBtn = navLinks.querySelector('.auth-btn-group');
    if (existingAuthBtn) existingAuthBtn.remove();

    // Yeni bir liste elemanı (<li>) oluştur
    const authLi = document.createElement('li');
    authLi.className = 'auth-btn-group';

    // Görünüm ayarları (CSS yerine buradan hızlıca stil verildi)
    authLi.style.marginLeft = '1rem';
    authLi.style.display = 'flex';
    authLi.style.alignItems = 'center';
    authLi.style.gap = '1rem';

    // DURUM KONTROLÜ
    if (auth.isLoggedIn()) {
        // -- DURUM 1: GİRİŞ YAPILMIŞ --
        const user = auth.getCurrentUser();
        // İsim göster ve "Çıkış" butonu koy
        authLi.innerHTML = `
            <span style="font-weight: 500; color: var(--primary);">Merhaba, ${user.name}</span>
            <button onclick="auth.logout()" class="btn btn-outline" style="padding: 0.5rem 1rem; font-size: 0.9rem;">
                <i class="fa-solid fa-right-from-bracket"></i> Çıkış
            </button>
        `;
    } else {
        // -- DURUM 2: GİRİŞ YAPILMAMIŞ --
        // "Giriş Yap" ve "Kayıt Ol" butonlarını koy
        authLi.innerHTML = `
            <a href="login.html" class="btn btn-outline" style="padding: 0.5rem 1rem; font-size: 0.9rem;">Giriş Yap</a>
            <a href="register.html" class="btn btn-primary" style="padding: 0.5rem 1rem; font-size: 0.9rem;">Kayıt Ol</a>
        `;
    }

    // Hazırlanan butonları menüye ekle
    navLinks.appendChild(authLi);
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
