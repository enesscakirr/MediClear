/* Mongoose kullanarak kullanıcı şemamızı oluşturuyoruz. 
Kaydetmeden önce (pre('save') hook'u ile) bcrypt kullanarak şifreyi geri döndürülemez 
sekilde hash'liyoruz. */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    }
}, { timestamps: true });

// Veritabanına kaydetmeden önce şifreyi Hash'le
userSchema.pre('save', async function () {
    // Şifre değiştirilmemişse veya yeni eklenmemişse hash'lemeyi atla
    if (!this.isModified('password')) return;

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
        throw error;
    }
});

// Giriş sırasında girilen şifre ile hashlenmiş şifreyi karşılaştırmak için özel metod
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);
module.exports = User;
