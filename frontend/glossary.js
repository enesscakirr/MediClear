/**
 * GLOSSARY.JS - SÖZLÜK MANTIĞI
 * 
 * Bu dosya, sözlük sayfasındaki veri listesini tutar,
 * arama yapmayı sağlar ve terimlerin açılıp kapanmasını yönetir.
 */

// TERİM VERİTABANI
// Gerçek bir veritabanı olmadığı için verileri bu listenin içinde tutuyoruz.
const terms = [
    {
        term: "Hemogram (Tam Kan Sayımı)",
        definition: "Kandaki hücrelerin (alyuvar, akyuvar, trombosit) sayısını ve oranlarını ölçen en temel kan testidir. Kansızlık, enfeksiyon veya lösemi gibi durumların tespitinde kullanılır."
    },
    {
        term: "CRP (C-Reaktif Protein)",
        definition: "Vücutta bir enfeksiyon veya iltihaplanma olduğunda karaciğer tarafından üretilen bir proteindir. Yüksekliği genellikle vücutta iltihap olduğuna işaret eder."
    },
    {
        term: "ALT (Alanin Aminotransferaz)",
        definition: "Karaciğer hasarını tespit etmek için kullanılan bir enzim testidir. Yüksek değerler genellikle karaciğerde bir sorun olduğunu gösterir."
    },
    {
        term: "AST (Aspartat Aminotransferaz)",
        definition: "Karaciğer ve kalp sağlığını kontrol etmek için bakılan bir enzimdir. ALT ile birlikte değerlendirilir."
    },
    {
        term: "TSH (Tiroid Stimüle Edici Hormon)",
        definition: "Tiroid bezinin ne kadar iyi çalıştığını gösterir. Yüksekliği genellikle hipotiroidi (az çalışma), düşüklüğü ise hipertiroidi (çok çalışma) anlamına gelir."
    },
    {
        term: "Glukoz (Açlık Kan Şekeri)",
        definition: "Kandaki şeker miktarını ölçer. Diyabet (şeker hastalığı) teşhisi ve takibi için en önemli testtir."
    },
    {
        term: "LDL Kolesterol",
        definition: "'Kötü kolesterol' olarak bilinir. Damar tıkanıklığı riskini artıran yağ türüdür. Düşük olması tercih edilir."
    },
    {
        term: "HDL Kolesterol",
        definition: "'İyi kolesterol' olarak bilinir. Damarları temizlemeye yardımcı olur. Yüksek olması kalp sağlığı için iyidir."
    },
    {
        term: "Üre / Kreatinin",
        definition: "Böbrek fonksiyonlarını gösteren testlerdir. Böbreklerin kanı ne kadar iyi süzdüğünü (temizlediğini) anlamak için bakılır."
    },
    {
        term: "Ferritin",
        definition: "Vücuttaki demir depolarını gösteren bir proteindir. Düşüklüğü demir eksikliği anemisine işaret eder."
    }
];

document.addEventListener('DOMContentLoaded', () => {
    // HTML'deki gerekli alanları seç
    const grid = document.getElementById('glossaryGrid');   // Kartların konacağı kutu
    const searchInput = document.getElementById('searchInput'); // Arama kutusu
    const noResults = document.getElementById('noResults');     // "Sonuç yok" mesajı

    // --- LİSTELEME FONKSİYONU ---
    // filter: Arama kutusuna yazılan yazı (varsayılan değer boş "")
    function renderTerms(filter = "") {
        // Önce kutunun içini tamamen temizle
        grid.innerHTML = '';

        // Listeyi filtrele (arama kelimesi terim adında veya tanımında geçiyor mu?)
        const filtered = terms.filter(item =>
            item.term.toLowerCase().includes(filter.toLowerCase()) ||
            item.definition.toLowerCase().includes(filter.toLowerCase())
        );

        // Eğer hiç sonuç yoksa
        if (filtered.length === 0) {
            noResults.style.display = 'block'; // Uyarı mesajını göster
        } else {
            noResults.style.display = 'none'; // Uyarıyı gizle

            // Bulunan her terim için bir kart oluştur
            filtered.forEach(item => {
                const card = document.createElement('div');
                card.className = 'term-card'; // CSS sınıfı
                // Kartın HTML içeriğini oluştur
                card.innerHTML = `
                    <div class="term-header">
                        <span class="term-title">${item.term}</span>
                        <i class="fa-solid fa-chevron-down term-icon"></i>
                    </div>
                    <div class="term-content">
                        ${item.definition}
                    </div>
                `;

                // Tıklama Olayı (Accordion)
                const header = card.querySelector('.term-header');
                header.addEventListener('click', () => {
                    // 'active' sınıfını ekle/çıkar (CSS'de bu sınıf içeriği açar)
                    card.classList.toggle('active');
                });

                // Kartı ana kutuya ekle
                grid.appendChild(card);
            });
        }
    }

    // Sayfa açılınca listeyi ilk kez çiz
    renderTerms();

    // Arama kutusuna her harf yazıldığında listeyi yeniden çiz
    searchInput.addEventListener('input', (e) => {
        renderTerms(e.target.value);
    });
});
