const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Route pubbliche
router.post('/google', authController.googleLogin);

// Route protette
router.get('/verify', authMiddleware, authController.verifyToken);

module.exports = router; 