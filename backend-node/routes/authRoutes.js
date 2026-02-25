/**
 * ROUTES/AUTHROUTES.JS - KİMLİK DOĞRULAMA ROTALARI
 *
 * Endpoint'ler:
 *   POST /api/auth/register   → Yeni kullanıcı kaydı
 *   POST /api/auth/login      → Kullanıcı girişi + JWT üretimi
 *   GET  /api/auth/profile    → Profil getir (korumalı)
 *   PUT  /api/auth/profile    → Profil güncelle (korumalı)
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'mediclear_super_secret_key_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';

const log = {
    info: (...args) => console.log(`[${new Date().toISOString()}] [INFO ] [AuthRoutes]`, ...args),
    warn: (...args) => console.warn(`[${new Date().toISOString()}] [WARN ] [AuthRoutes]`, ...args),
    error: (...args) => console.error(`[${new Date().toISOString()}] [ERROR] [AuthRoutes]`, ...args),
};

// ---------------------------------------------------------------------------
// POST /api/auth/register — Yeni Kullanıcı Kaydı
// ---------------------------------------------------------------------------
router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    log.info(`Kayıt isteği alındı → email: "${email}", name: "${name}"`);

    try {
        // Zorunlu alan kontrolü
        if (!name || !email || !password) {
            log.warn(`Eksik kayıt alanları → name: ${!!name}, email: ${!!email}, password: ${!!password}`);
            return res.status(400).json({ message: 'Tüm alanlar (isim, e-posta, şifre) zorunludur.' });
        }

        // E-posta zaten kayıtlı mı?
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            log.warn(`Kayıt başarısız: "${email}" e-postası zaten kullanımda.`);
            return res.status(400).json({ message: 'Bu e-posta adresi ile kayıtlı bir hesap zaten var.' });
        }

        // Yeni kullanıcı oluştur (şifre User modelindeki pre-save hook ile hashlenir)
        const newUser = new User({ name, email, password });
        await newUser.save();

        log.info(`✅ Yeni kullanıcı kaydedildi → email: "${email}", id: ${newUser._id}`);
        res.status(201).json({ message: 'Kayıt işlemi başarılı. Hesap oluşturuldu.' });

    } catch (error) {
        log.error(`Kayıt hatası (${email}): ${error.message}`);
        if (error.code === 11000) {
            return res.status(400).json({ message: 'Bu e-posta adresi zaten kullanımda.' });
        }
        res.status(500).json({ message: `Sunucu Hatası: ${error.message}` });
    }
});

// ---------------------------------------------------------------------------
// POST /api/auth/login — Kullanıcı Girişi
// ---------------------------------------------------------------------------
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    log.info(`Giriş isteği alındı → email: "${email}"`);

    try {
        // Kullanıcıyı veritabanında bul
        const user = await User.findOne({ email });
        if (!user) {
            log.warn(`Giriş başarısız: "${email}" e-postası veritabanında bulunamadı.`);
            return res.status(401).json({ message: 'Kullanıcı bulunamadı veya şifre hatalı.' });
        }

        // Şifre doğrulama
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            log.warn(`Giriş başarısız: "${email}" için hatalı şifre girildi.`);
            return res.status(401).json({ message: 'Kullanıcı bulunamadı veya şifre hatalı.' });
        }

        // JWT Token Oluştur
        log.info(`Şifre doğrulandı, JWT oluşturuluyor → email: "${email}", userId: ${user._id}`);
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        log.info(`✅ Giriş başarılı → email: "${email}", token geçerlilik: ${JWT_EXPIRES_IN}`);
        res.status(200).json({
            message: 'Giriş başarılı.',
            token,
            user: { id: user._id, name: user.name, email: user.email }
        });

    } catch (error) {
        log.error(`Giriş hatası (${email}): ${error.message}`);
        res.status(500).json({ message: 'Sunucu tarafında bir hata oluştu.' });
    }
});

// ---------------------------------------------------------------------------
// GET /api/auth/profile — Kullanıcı Profilini Getir (Korumalı)
// ---------------------------------------------------------------------------
router.get('/profile', protect, async (req, res) => {
    log.info(`Profil getirme isteği → userId: ${req.user._id}, email: "${req.user.email}"`);
    try {
        const user = await User.findById(req.user._id).select('-password');
        if (!user) {
            log.warn(`Profil bulunamadı → userId: ${req.user._id}`);
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }
        log.info(`✅ Profil döndürüldü → email: "${user.email}"`);
        res.json(user);
    } catch (error) {
        log.error(`Profil getirme hatası: ${error.message}`);
        res.status(500).json({ message: 'Sunucu hatası.' });
    }
});

// ---------------------------------------------------------------------------
// PUT /api/auth/profile — Kullanıcı Profilini Güncelle (Korumalı)
// ---------------------------------------------------------------------------
router.put('/profile', protect, async (req, res) => {
    log.info(`Profil güncelleme isteği → userId: ${req.user._id}, email: "${req.user.email}"`);
    log.info(`  Güncellenen alanlar: name=${!!req.body.name}, email=${!!req.body.email}, password=${!!req.body.password}`);

    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            log.warn(`Profil güncelleme başarısız → userId: ${req.user._id} bulunamadı.`);
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }

        user.name = req.body.name || user.name;
        user.email = req.body.email || user.email;

        if (req.body.password) {
            log.info(`  Şifre güncelleniyor → userId: ${user._id}`);
            user.password = req.body.password;
        }

        const updatedUser = await user.save();
        log.info(`✅ Profil güncellendi → email: "${updatedUser.email}"`);

        res.json({
            message: 'Profil güncellendi.',
            user: { id: updatedUser._id, name: updatedUser.name, email: updatedUser.email }
        });
    } catch (error) {
        log.error(`Profil güncelleme hatası: ${error.message}`);
        res.status(500).json({ message: 'Profil güncellenirken sunucu hatası.' });
    }
});

module.exports = router;
