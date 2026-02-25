/**
 * MIDDLEWARE/AUTHMIDDLEWARE.JS - JWT DOĞRULAMA MIDDLEWARE
 *
 * Korumalı rotalara gelen isteklerde JWT token'ı doğrular.
 * Başarıyla doğrulandığında kullanıcı bilgisini req.user'a ekler.
 */

const jwt = require('jsonwebtoken');
const path = require('path');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'mediclear_super_secret_key_2026';

const log = {
    info: (...args) => console.log(`[${new Date().toISOString()}] [INFO ] [AuthMiddleware]`, ...args),
    warn: (...args) => console.warn(`[${new Date().toISOString()}] [WARN ] [AuthMiddleware]`, ...args),
    error: (...args) => console.error(`[${new Date().toISOString()}] [ERROR] [AuthMiddleware]`, ...args),
};

const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Header'dan token'ı çıkar: "Bearer <token>"
            token = req.headers.authorization.split(' ')[1];
            log.info(`JWT token alındı, doğrulanıyor... (${req.method} ${req.originalUrl})`);

            // Token'ı doğrula
            const decoded = jwt.verify(token, JWT_SECRET);
            log.info(`JWT doğrulandı → userId: ${decoded.userId}, email: ${decoded.email}`);

            // Token içindeki id ile kullanıcıyı bul (şifreyi dahil etme)
            req.user = await User.findById(decoded.userId).select('-password');

            if (!req.user) {
                log.warn(`JWT geçerli ancak userId "${decoded.userId}" veritabanında bulunamadı.`);
                return res.status(401).json({ message: 'Yetkisiz erişim: kullanıcı bulunamadı.' });
            }

            log.info(`✅ Kullanıcı doğrulandı: "${req.user.email}" (${req.method} ${req.originalUrl})`);
            next();
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                log.warn(`JWT token süresi dolmuş: ${error.message}`);
                return res.status(401).json({ message: 'Oturumunuz sona erdi. Lütfen tekrar giriş yapın.' });
            }
            if (error.name === 'JsonWebTokenError') {
                log.warn(`JWT geçersiz token: ${error.message}`);
                return res.status(401).json({ message: 'Yetkisiz erişim: token geçersiz.' });
            }
            log.error(`JWT doğrulama hatası: ${error.message}`);
            return res.status(401).json({ message: 'Yetkisiz erişim, token doğrulanamadı.' });
        }
    } else {
        log.warn(`Korumalı rotaya token olmadan erişim denemesi: ${req.method} ${req.originalUrl}`);
        return res.status(401).json({ message: 'Yetkisiz erişim: token bulunamadı.' });
    }
};

module.exports = { protect };
