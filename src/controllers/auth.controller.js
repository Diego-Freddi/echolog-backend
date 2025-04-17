const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/user.model');
require('dotenv').config();
const fetch = require('node-fetch');

// Crea un client OAuth2 utilizzando l'ID client di Google
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const authController = {
    // Login con Google
    async googleLogin(req, res) {
        try {
            const { access_token } = req.body;
            
            if (!access_token) {
                return res.status(400).json({ error: 'Token di accesso mancante' });
            }
            
            // Poiché abbiamo un access_token e non un ID token, dobbiamo usare l'API userinfo
            // per ottenere le informazioni dell'utente
            try {
                const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: {
                        Authorization: `Bearer ${access_token}`
                    },
                    timeout: 15000
                });
                
                if (!userInfoResponse.ok) {
                    throw new Error('Risposta API Google non valida');
                }
                
                const payload = await userInfoResponse.json();
                
                // Estrai i dati necessari
                const { sub, email, name, picture, email_verified } = payload;
                
                // Verifica che l'email sia verificata
                if (!email_verified) {
                    return res.status(401).json({ error: 'Email non verificata da Google' });
                }
                
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
                    // Aggiorna le informazioni dell'utente e la data di ultimo accesso
                    user.name = name;
                    user.picture = picture;
                    user.lastLogin = new Date();
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
                console.error('Errore nella verifica con userinfo API:', error);
                return res.status(401).json({ error: 'Impossibile verificare il token con Google' });
            }
        } catch (error) {
            console.error('Errore verifica token Google:', error);
            res.status(401).json({ error: 'Token non valido o errore durante l\'autenticazione' });
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