const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const storageConfig = require('../config/storage.config');
const Recording = require('../models/recording.model');

// Configurazione multer per il salvataggio temporaneo dei file audio
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/audio';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueId = uuidv4();
    cb(null, `${uniqueId}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato file non supportato. Usa WAV o MP3.'), false);
    }
  }
});

/**
 * Gestisce l'upload di un file audio
 * @param {Request} req - Request object
 * @param {Response} res - Response object
 */
const uploadAudio = async (req, res) => {
  let tempFilePath = null;
  
  try {
    // Verifica che l'utente sia autenticato
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        error: 'Autenticazione necessaria',
        details: 'Devi effettuare il login per utilizzare questa funzionalità'
      });
    }
    
    // Verifica che sia stato inviato un file
    if (!req.file) {
      return res.status(400).json({ 
        error: 'Nessun file audio fornito',
        details: 'È necessario fornire un file audio da caricare'
      });
    }

    // Salva il percorso temporaneo per la pulizia in caso di errore
    tempFilePath = req.file.path;
    
    // Verifica se GCS è abilitato
    if (!storageConfig.useCloudStorage) {
      return res.status(501).json({ 
        error: 'Storage cloud non configurato',
        details: 'Il sistema è configurato per utilizzare solo Google Cloud Storage'
      });
    }
    
    console.log(`Caricamento file audio: ${req.file.originalname} (${req.file.size} bytes, ${req.file.mimetype})`);
    const fileBuffer = fs.readFileSync(req.file.path);
    
    // Carica il file su Google Cloud Storage
    console.log('Inizio caricamento su GCS...');
    const result = await storageConfig.uploadToGCS(fileBuffer, req.file.originalname, req.file.mimetype);
    console.log('File caricato su GCS con successo');
    
    // Crea un nuovo recording
    const recording = new Recording({
      userId: req.user._id,
      title: req.file.originalname,
      audioUrl: result.url,
      filename: result.filename,
      gcsFilename: result.filename,
      duration: 0, // Per ora non abbiamo informazioni sulla durata
      format: req.file.mimetype.includes('wav') ? 'WAV' : 'MP3',
      size: req.file.size,
      status: 'completed'
    });
    
    await recording.save();
    console.log(`Recording salvato con ID: ${recording._id}`);
    
    // Pulisci il file temporaneo
    fs.unlinkSync(req.file.path);
    tempFilePath = null;
    
    // Restituisci le informazioni sul file
    res.status(200).json({
      message: 'File audio caricato con successo',
      recordingId: recording._id,
      gcsFilename: result.filename,
      audioUrl: result.url
    });
  } catch (error) {
    console.error('Errore durante il caricamento del file:', error);
    
    // Pulisci il file temporaneo in caso di errore
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log('File temporaneo eliminato dopo errore');
      } catch (e) {
        console.error('Errore durante la pulizia del file temporaneo:', e);
      }
    }
    
    res.status(500).json({
      error: 'Errore durante il caricamento del file audio',
      details: error.message
    });
  }
};

/**
 * Recupera un file audio 
 * @param {Request} req - Request object
 * @param {Response} res - Response object
 */
const getAudio = async (req, res) => {
  try {
    const { filename } = req.params;
    let gcsFilename = null;
    let downloadFilename = null;
    
    // Verifica che GCS sia abilitato
    if (!storageConfig.useCloudStorage) {
      return res.status(501).json({ 
        error: 'Storage cloud non configurato',
        details: 'Il sistema è configurato per utilizzare solo Google Cloud Storage'
      });
    }
    
    // Controlliamo se il parametro è un ObjectId (recordingId)
    if (filename.match(/^[0-9a-fA-F]{24}$/)) {
      // È un ObjectId, cerchiamo direttamente il Recording
      const recording = await Recording.findById(filename);
      
      if (!recording) {
        return res.status(404).json({ 
          error: 'Recording non trovato',
          details: `Nessun recording trovato con ID ${filename}`
        });
      }
      
      gcsFilename = recording.gcsFilename;
      downloadFilename = recording.title;
      console.log(`Recupero file da recordingId: ${filename}, gcsFilename: ${gcsFilename}`);
    } else {
      // Potrebbe essere un gcsFilename diretto
      const recording = await Recording.findOne({ gcsFilename: filename });
      
      if (recording) {
        gcsFilename = recording.gcsFilename;
        downloadFilename = recording.title;
        console.log(`Recupero file da gcsFilename: ${filename}`);
      } else {
        // Ultimo tentativo: usiamo il valore così com'è
        gcsFilename = filename;
        downloadFilename = `audio_${filename}`;
        console.log(`Tentativo recupero diretto: ${filename}`);
      }
    }
    
    if (!gcsFilename) {
      return res.status(404).json({ 
        error: 'File audio non trovato',
        details: 'Non è stato possibile determinare il nome del file'
      });
    }
    
    // Recupero da Google Cloud Storage
    try {
      console.log(`Recupero da GCS: ${gcsFilename}`);
      const fileContent = await storageConfig.getFromGCS(gcsFilename);
      
      // Imposta gli header appropriati
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}.mp3"`);
      return res.send(fileContent);
    } catch (error) {
      console.error('Errore recupero da GCS:', error);
      return res.status(404).json({ 
        error: 'File audio non trovato su GCS',
        details: error.message
      });
    }
  } catch (error) {
    console.error('Errore nel recupero del file:', error);
    res.status(500).json({ 
      error: 'Errore nel recupero del file audio',
      details: error.message
    });
  }
};

/**
 * Elimina un file audio e il relativo Recording
 * @param {Request} req - Request object
 * @param {Response} res - Response object
 */
const deleteAudio = async (req, res) => {
  try {
    const { filename } = req.params;
    let gcsFilename = null;
    let recordingId = null;
    
    // Verifica che GCS sia abilitato
    if (!storageConfig.useCloudStorage) {
      return res.status(501).json({ 
        error: 'Storage cloud non configurato',
        details: 'Il sistema è configurato per utilizzare solo Google Cloud Storage'
      });
    }
    
    // Controlliamo se il parametro è un ObjectId (recordingId)
    if (filename.match(/^[0-9a-fA-F]{24}$/)) {
      // È un ObjectId, cerchiamo direttamente il Recording
      const recording = await Recording.findById(filename);
      
      if (!recording) {
        return res.status(404).json({ 
          error: 'Recording non trovato',
          details: `Nessun recording trovato con ID ${filename}`
        });
      }
      
      gcsFilename = recording.gcsFilename;
      recordingId = recording._id;
    } else {
      // Potrebbe essere un gcsFilename diretto
      const recording = await Recording.findOne({ gcsFilename: filename });
      
      if (recording) {
        gcsFilename = recording.gcsFilename;
        recordingId = recording._id;
      } else {
        // Ultimo tentativo: usiamo il valore così com'è
        gcsFilename = filename;
      }
    }
    
    if (!gcsFilename) {
      return res.status(404).json({ 
        error: 'File audio non trovato',
        details: 'Non è stato possibile determinare il nome del file da eliminare'
      });
    }
    
    // Elimina da Google Cloud Storage
    try {
      console.log(`Eliminazione da GCS: ${gcsFilename}`);
      await storageConfig.deleteFromGCS(gcsFilename);
      
      // Se abbiamo un recordingId, eliminiamo anche il record dal database
      if (recordingId) {
        await Recording.findByIdAndDelete(recordingId);
        console.log(`Recording eliminato: ${recordingId}`);
      }
      
      return res.status(200).json({ 
        message: 'File audio eliminato con successo',
        recordingId: recordingId
      });
    } catch (error) {
      console.error('Errore eliminazione da GCS:', error);
      return res.status(500).json({ 
        error: 'Errore nell\'eliminazione del file audio da GCS',
        details: error.message
      });
    }
  } catch (error) {
    console.error('Errore nell\'eliminazione del file:', error);
    res.status(500).json({ 
      error: 'Errore nell\'eliminazione del file audio',
      details: error.message 
    });
  }
};

module.exports = {
  upload,
  uploadAudio,
  getAudio,
  deleteAudio
}; 