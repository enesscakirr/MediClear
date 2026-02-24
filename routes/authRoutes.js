/*Bu dosyada kayıt olma (Register) ve giriş yapma (Login) mantığını
 (Endpoint'lerini) yazıyoruz. Giriş başarılı olduğunda bir JWT üretiyoruz.*/

const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();
// Gerçek projelerde bu JWT anahtarını .env dosyasından çekmek en güvenlisidir: process.env.JWT_SECRET
const JWT_SECRET = process.env.JWT_SECRET || 'mediclear_super_secret_key_2026';

// POST /api/auth/register - Yeni Kullanıcı Kaydı
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Bu email adresi sistemde var mı kontrol et
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Bu e-posta adresi ile kayıtlı bir hesap zaten var.' });
        }

        // Yeni kullanıcı oluştur (Şifre User modelindeki 'pre' metoduyla otomatik hash'lenir)
        const newUser = new User({ name, email, password });
        await newUser.save();

        res.status(201).json({ message: 'Kayıt işlemi başarılı. Hesap oluşturuldu.' });
    } catch (error) {
        console.error('Kayıt Hatası Detayı:', error);
        // Hata mesajını geçici olarak frontend tarafına yolluyoruz ki kullanıcı tam olarak neyin patladığını ekranda görebilsin
        res.status(500).json({ message: `Sunucu Hatası: ${error.message}` });
    }
});

// POST /api/auth/login - Kullanıcı Girişi
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Kullanıcıyı veritabanında bul
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Kullanıcı bulunamadı veya şifre hatalı.' });
        }

        // Şifre doğrulama
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Kullanıcı bulunamadı veya şifre hatalı.' });
        }

        // JWT (Token) Oluştur
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            JWT_SECRET,
            { expiresIn: '1d' } // Token 1 gün geçerli
        );

        res.status(200).json({
            message: 'Giriş başarılı.',
            token: token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Giriş Hatası:', error);
        res.status(500).json({ message: 'Sunucu tarafında bir hata oluştu.' });
    }
});

const { protect } = require('../middleware/authMiddleware');

// GET /api/auth/profile - Kullanıcı Profilini Getir (Korumalı)
router.get('/profile', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }
        res.json(user);
    } catch (error) {
        console.error('Profil Getirme Hatası:', error);
        res.status(500).json({ message: 'Sunucu hatası' });
    }
});

// PUT /api/auth/profile - Kullanıcı Profilini Güncelle (Korumalı)
router.put('/profile', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ message: 'Kullanıcı bulunamadı.' });
        }

        user.name = req.body.name || user.name;
        user.email = req.body.email || user.email;

        // Şifre de gönderilmişse güncelle
        if (req.body.password) {
            user.password = req.body.password;
        }

        const updatedUser = await user.save();

        res.json({
            message: 'Profil güncellendi',
            user: {
                id: updatedUser._id,
                name: updatedUser.name,
                email: updatedUser.email
            }
        });
    } catch (error) {
        console.error('Profil Güncelleme Hatası:', error);
        res.status(500).json({ message: 'Profil güncellenirken sunucu hatası.' });
    }
});

module.exports = router;
