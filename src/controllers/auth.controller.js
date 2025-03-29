const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
require('dotenv').config();

const authController = {
    // Login con Google
    async googleLogin(req, res) {
        try {
            const { sub, email, name, picture } = req.body;
            
            // Trova o crea l'utente
            let user = await User.findOne({ googleId: sub });
            
            if (!user) {
                user = await User.create({
                    googleId: sub,
                    email,
                    name,
                    picture
                });
            } else {
                // Aggiorna le informazioni dell'utente se necessario
                user.name = name;
                user.picture = picture;
                await user.save();
            }

            // Genera il JWT
            const token = jwt.sign(
                { userId: user._id, email: user.email },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
            );

            res.json({
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    picture: user.picture
                },
                token
            });
        } catch (error) {
            console.error('Errore login:', error);
            res.status(401).json({ error: 'Autenticazione fallita' });
        }
    },

    // Verifica token JWT
    async verifyToken(req, res) {
        try {
            const user = await User.findById(req.user.userId);
            if (!user) {
                throw new Error();
            }
            res.json({ 
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    picture: user.picture
                }
            });
        } catch (error) {
            res.status(401).json({ error: 'Token non valido' });
        }
    }
};

module.exports = authController; 