const jwt = require('jsonwebtoken');
require('dotenv').config();

const authMiddleware = async (req, res, next) => {
    try {
        // Verifica se il token è presente nell'header
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            throw new Error();
        }

        // Verifica il token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Assegna decoded a req.user
        req.user = decoded;
        
        // Aggiungi _id come alias di userId per compatibilità
        if (decoded.userId && !decoded._id) {
            req.user._id = decoded.userId;
        }
        
        req.token = token;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Autenticazione richiesta' });
    }
};

module.exports = authMiddleware; 