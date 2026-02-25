/**
 * SCRIPT.JS - GENEL SİTE MANTIĞI
 * 
 * Bu dosya tüm sayfalarda çalışır. 
 * Mobil menüyü açıp kapamak ve hangi sayfada olduğumuzu göstermek gibi
 * ortak işleri yapar.
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. MOBİL MENÜ MANTIĞI ---
    const mobileBtn = document.querySelector('.mobile-menu-btn'); // Hamburger butonu
    const navLinks = document.querySelector('.nav-links'); // Linklerin olduğu liste

    // Eğer buton ve menü sayfada varsa (hata almamak için kontrol)
    if (mobileBtn && navLinks) {
        mobileBtn.addEventListener('click', () => {
            // Menü şu an gizli mi? Kontrol et.
            const isHidden = navLinks.style.display === 'none' || navLinks.style.display === '';

            // Gizliyse göster ('flex'), açıksa gizle ('none')
            navLinks.style.display = isHidden ? 'flex' : 'none';

            // Mobilde menüyü güzelleştirmek için stil ayarları (JS ile dinamik ekleme)
            if (window.innerWidth <= 768) {
                navLinks.style.flexDirection = 'column'; // Alt alta diz
                navLinks.style.position = 'absolute';   // Sayfanın üzerine bindir
                navLinks.style.top = '70px';            // Header'ın hemen altına koy
                navLinks.style.left = '0';
                navLinks.style.right = '0';
                navLinks.style.background = 'white';    // Arka plan beyaz
                navLinks.style.padding = '1rem';
                navLinks.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'; // Gölge ekle
            }
        });
    }

    // --- 2. AKTİF SAYFAYI İŞARETLEME ---
    // Hangi sayfadayız? (Adres çubuğundaki yolu al)
    const currentPath = window.location.pathname;
    // Menüdeki tüm linkleri seç
    const links = document.querySelectorAll('.nav-links a');

    links.forEach(link => {
        // Linkin gittiği adresi al
        const linkPath = link.getAttribute('href');

        // Eğer şu anki adres bu linkle bitiyorsa (örn: 'index.html')
        // Veya anasayfadaysak ('/') ve link 'index.html' ise
        if (currentPath.endsWith(linkPath) || (currentPath === '/' && linkPath === 'index.html')) {
            // Bu linke 'active' sınıfını ekle (CSS'de altı çizili yapıyoruz)
            link.classList.add('active');
        }
    });
});
