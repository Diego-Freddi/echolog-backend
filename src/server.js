const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const audioRoutes = require('./routes/audio.routes');
const transcriptionRoutes = require('./routes/transcription.routes');
const analysisRoutes = require('./routes/analysis.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const storageConfig = require('./config/storage.config');

const app = express();

// Configurazione CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

// Servi i file statici dalla cartella uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Crea la cartella temporanea se non esiste
const tempDir = path.join(__dirname, '../uploads/temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/transcribe', transcriptionRoutes);
app.use('/api/analyze', analysisRoutes);
app.use('/api/dashboard', dashboardRoutes);

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Connesso a MongoDB'))
    .catch(err => console.error('❌ Errore connessione MongoDB:', err));

// Inizializza Google Cloud Storage bucket se abilitato
if (storageConfig.useCloudStorage) {
  storageConfig.initBucket()
    .then(() => console.log('✅ Google Cloud Storage inizializzato'))
    .catch(err => console.error('❌ Errore inizializzazione Google Cloud Storage:', err));
}

// Basic route for testing
app.get('/', (req, res) => {
    res.json({ message: 'EchoLog API is running' });
});

// Gestione errori globale
app.use((err, req, res, next) => {
  console.error('❌ Errore:', err);
  res.status(500).json({
    error: 'Errore interno del server',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server in ascolto sulla porta ${PORT}`);
    console.log(`📦 Storage mode: ${storageConfig.useCloudStorage ? 'Google Cloud Storage' : 'Local Storage'}`);
}); 