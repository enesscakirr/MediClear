/**
 * SERVER.JS - MEDICLEAR BACKEND-NODE ANA DOSYASI
 *
 * Express.js sunucusu: MongoDB bağlantısı, Auth rotaları ve Frontend servisi.
 * Portlar:
 *   - Bu sunucu: PORT (varsayılan 5000)
 *   - Python AI Service: 8000 (ayrı süreç)
 */

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./routes/authRoutes');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// ---------------------------------------------------------------------------
// BASIT LOGGER YARDIMCISI
// ---------------------------------------------------------------------------
const log = {
    info: (...args) => console.log(`[${new Date().toISOString()}] [INFO ]`, ...args),
    warn: (...args) => console.warn(`[${new Date().toISOString()}] [WARN ]`, ...args),
    error: (...args) => console.error(`[${new Date().toISOString()}] [ERROR]`, ...args),
};

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

log.info(`MediClear Backend-Node başlatılıyor... Ortam: ${NODE_ENV}`);

// ---------------------------------------------------------------------------
// MIDDLEWARE'LER
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json());

// Frontend statik dosyalarını servis et (proje kökündeki frontend/ klasörü)
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));
log.info(`Statik dosyalar şuradan servis ediliyor: ${frontendPath}`);

// Basit istek loglama middleware'i
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
        log[level](`${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
    });
    next();
});

// ---------------------------------------------------------------------------
// ROTALAR
// ---------------------------------------------------------------------------
app.use('/api/auth', authRoutes);

// SPA fallback: Tüm bilinmeyen GET istekleri index.html'e yönlendirilir
app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// ---------------------------------------------------------------------------
// GENEL HATA YÖNETİCİSİ
// ---------------------------------------------------------------------------
app.use((err, req, res, next) => {
    log.error(`Yakalanmamış hata: ${err.message}`, err.stack);
    res.status(500).json({ message: 'Sunucu tarafında beklenmedik bir hata oluştu.' });
});

// ---------------------------------------------------------------------------
// MONGODB BAĞLANTISI VE SUNUCUYU BAŞLATMA
// ---------------------------------------------------------------------------
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/MediClear';

log.info(`MongoDB bağlantısı deneniyor: ${MONGODB_URI.replace(/:\/\/.*@/, '://***@')}`);

mongoose.connect(MONGODB_URI)
    .then(() => {
        const dbName = mongoose.connection.name;
        log.info(`✅ MongoDB bağlantısı başarılı! Veritabanı: "${dbName}"`);

        app.listen(PORT, () => {
            log.info(`✅ MediClear Backend-Node çalışıyor → http://localhost:${PORT}`);
            log.info(`   API Rotası      : http://localhost:${PORT}/api/auth`);
            log.info(`   Frontend Servisi: http://localhost:${PORT}/`);
            log.info(`   Python AI Servis: http://localhost:8000 (ayrı süreç)`);
        });
    })
    .catch((err) => {
        log.error(`❌ MongoDB bağlantısı BAŞARISIZ: ${err.message}`);
        log.error('   MongoDB servisinin çalışıp çalışmadığını kontrol edin.');
        process.exit(1); // Bağlantı olmadan çalışmaya devam etme
    });

// Beklenmedik process hatalarını yakala
process.on('unhandledRejection', (reason) => {
    log.error('Yakalanmamış Promise Reddi:', reason);
});

process.on('uncaughtException', (err) => {
    log.error('Yakalanmamış Exception:', err.message);
    process.exit(1);
});
