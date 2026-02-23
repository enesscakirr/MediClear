/**
 * BLOG.JS - BLOG ETKİLEŞİMİ
 * 
 * Bu dosya, blog sayfasındaki "Devamını Oku" butonlarının çalışmasını sağlar.
 * Metni açıp kapatma (Accordion) mantığı buradadır.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Sayfadaki tüm "Devamını Oku" butonlarını bul
    const buttons = document.querySelectorAll('.read-more-btn');

    // Her bir buton için şu işlemi yap:
    buttons.forEach(btn => {
        // Butona tıklandığında...
        btn.addEventListener('click', () => {
            // Butonun hemen öncesindeki elementi bul (Gizli metin kutusu)
            const content = btn.previousElementSibling;

            // Eğer metin gizliyse (display: none)
            if (content.style.display === 'none') {
                // Görünür yap (block)
                content.style.display = 'block';
                // Buton yazısını "Gizle" olarak değiştir ve oku yukarı çevir
                btn.innerHTML = '<span class="read-more">Gizle <i class="fa-solid fa-chevron-up"></i></span>';
            } else {
                // Eğer zaten açıksa, tekrar gizle
                content.style.display = 'none';
                // Buton yazısını tekrar "Devamını Oku" yap ve oku sağa çevir
                btn.innerHTML = '<span class="read-more">Devamını Oku <i class="fa-solid fa-arrow-right"></i></span>';
            }
        });
    });
});