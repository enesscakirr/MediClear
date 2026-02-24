const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware'ler
app.use(cors()); // Frontend'den gelecek isteklere izin verir (CORS hatalarını önler)
app.use(express.json()); // Body'deki JSON verilerini okuyabilmemizi sağlar

// Route'lar
app.use('/api/auth', authRoutes);

// MongoDB Bağlantısı ve Sunucuyu Başlatma
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/MediClear';

// DOĞRU KOD (Güncel Mongoose sürümü tarzı)
mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('MongoDB veritabanına başarıyla bağlanıldı! 🚀 DB Adı:', mongoose.connection.name);
        // Sunucuyu başlatma kodunuz silinmişti, geri ekliyoruz:
        app.listen(PORT, () => {
            console.log(`Sunucu http://localhost:${PORT} üzerinde çalışıyor.`);
        });
    })
    .catch((err) => console.error('MongoDB bağlantı hatası:', err));
