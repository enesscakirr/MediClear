/**
 * MODELS/USER.JS - KULLANICI VERİ MODELI
 *
 * Mongoose şeması: name, email, password (bcrypt ile hashlenmiş).
 * pre('save') hook'u şifreyi otomatik hashler.
 * comparePassword() metodu giriş doğrulaması için kullanılır.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const log = {
    info: (...args) => console.log(`[${new Date().toISOString()}] [INFO ] [User Model]`, ...args),
    warn: (...args) => console.warn(`[${new Date().toISOString()}] [WARN ] [User Model]`, ...args),
    error: (...args) => console.error(`[${new Date().toISOString()}] [ERROR] [User Model]`, ...args),
};

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'İsim alanı zorunludur.'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'E-posta alanı zorunludur.'],
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: [true, 'Şifre alanı zorunludur.'],
        minlength: [6, 'Şifre en az 6 karakter olmalıdır.']
    }
}, { timestamps: true });

// ---------------------------------------------------------------------------
// PRE-SAVE HOOK: Şifreyi Kaydetmeden Önce Hash'le (bcrypt)
// ---------------------------------------------------------------------------
userSchema.pre('save', async function () {
    // Şifre değiştirilmemişse veya yeni eklenmemişse hash'lemeyi atla
    if (!this.isModified('password')) {
        log.info(`Kullanıcı "${this.email}" için şifre değişmedi, hash atlandı.`);
        return;
    }

    log.info(`Kullanıcı "${this.email}" için şifre bcrypt ile hashleniyor (rounds: 10)...`);
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        log.info(`Kullanıcı "${this.email}" için şifre başarıyla hashlendi.`);
    } catch (error) {
        log.error(`Şifre hashleme hatası (${this.email}): ${error.message}`);
        throw error;
    }
});

// ---------------------------------------------------------------------------
// METOD: Şifre Karşılaştırma (Login Doğrulaması)
// ---------------------------------------------------------------------------
userSchema.methods.comparePassword = async function (candidatePassword) {
    log.info(`Kullanıcı "${this.email}" için şifre doğrulaması yapılıyor...`);
    try {
        const isMatch = await bcrypt.compare(candidatePassword, this.password);
        log.info(`Kullanıcı "${this.email}" şifre doğrulama sonucu: ${isMatch ? '✅ Eşleşti' : '❌ Eşleşmedi'}`);
        return isMatch;
    } catch (error) {
        log.error(`Şifre karşılaştırma hatası (${this.email}): ${error.message}`);
        throw error;
    }
};

const User = mongoose.model('User', userSchema);
module.exports = User;
