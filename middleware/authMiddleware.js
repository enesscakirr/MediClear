const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'mediclear_super_secret_key_2026';

const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Token'ı başlık (header) kısmından al: "Bearer <token>"
            token = req.headers.authorization.split(' ')[1];

            // Token'ı doğrula
            const decoded = jwt.verify(token, JWT_SECRET);

            // Token içindeki id ile kullanıcıyı bul (şifreyi dahil etme)
            req.user = await User.findById(decoded.userId).select('-password');

            next();
        } catch (error) {
            console.error('Yetkilendirme Hatası:', error);
            res.status(401).json({ message: 'Yetkisiz erişim, token geçersiz.' });
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Yetkisiz erişim, token bulunamadı.' });
    }
};

module.exports = { protect };
