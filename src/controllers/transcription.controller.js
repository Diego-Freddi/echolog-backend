const speech = require('@google-cloud/speech');
const path = require('path');
const fs = require('fs');
const storageConfig = require('../config/storage.config');

// Inizializzazione del client Speech-to-Text
const client = new speech.SpeechClient();

/**
 * Configura le opzioni di base per la trascrizione
 * @param {Object} options - Opzioni personalizzate (opzionale)
 * @returns {Object} Configurazione per Speech-to-Text
 */
const getTranscriptionConfig = (options = {}) => ({
  encoding: options.encoding || 'LINEAR16',
  sampleRateHertz: options.sampleRateHertz || 16000,
  languageCode: options.languageCode || 'it-IT',
  enableAutomaticPunctuation: true,
  model: 'default', // Usiamo il modello default per ora
  useEnhanced: true,
  enableWordTimeOffsets: true,
});

/**
 * Gestisce la trascrizione di un file audio
 * @param {Request} req - Request object
 * @param {Response} res - Response object
 */
const transcribeAudio = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'Nessun file audio fornito',
        details: 'È necessario fornire un file audio da trascrivere'
      });
    }

    console.log('Inizio trascrizione per:', req.file.originalname);

    // Prepara la richiesta per Speech-to-Text
    let audio = {};
    let useGcsUri = false;
    let gcsUri = '';
    
    // Verifica se utilizzare Google Cloud Storage
    if (storageConfig.useCloudStorage) {
      try {
        // Carica il file su GCS se non è già caricato
        // Questo permette di gestire sia i casi in cui il file viene caricato dal controllo
        // audio sia quando il file viene inviato direttamente per la trascrizione
        const fileBuffer = fs.readFileSync(req.file.path);
        const result = await storageConfig.uploadToGCS(
          fileBuffer,
          path.basename(req.file.originalname),
          req.file.mimetype
        );
        
        // Costruisci l'URI GCS (formato gs://bucket-name/path)
        // Importante: per Speech-to-Text usiamo l'URI GCS, non l'URL firmato
        gcsUri = `gs://${process.env.GCS_BUCKET_NAME || 'echolog-audio-files'}/audio/${result.filename}`;
        
        console.log('File caricato su GCS, utilizzo URI per Speech-to-Text:', gcsUri);
        audio = {
          uri: gcsUri
        };
        useGcsUri = true;
        
        // Pulisci il file temporaneo
        fs.unlinkSync(req.file.path);
      } catch (error) {
        console.error('Errore caricamento su GCS, fallback a trascrizione diretta:', error);
        // Fallback al caricamento diretto del contenuto
        const audioBytes = fs.readFileSync(req.file.path).toString('base64');
        audio = {
          content: audioBytes
        };
      }
    } else {
      // Modalità standard: invio diretto del contenuto
      const audioBytes = fs.readFileSync(req.file.path).toString('base64');
      audio = {
        content: audioBytes
      };
    }

    const config = getTranscriptionConfig();
    const request = {
      audio: audio,
      config: config,
    };

    console.log('Configurazione trascrizione:', {
      encoding: config.encoding,
      sampleRate: config.sampleRateHertz,
      language: config.languageCode,
      useGcsUri: useGcsUri
    });

    // Avvia la trascrizione
    const [operation] = await client.longRunningRecognize(request);
    console.log('Trascrizione avviata, operationId:', operation.name);

    // Pulisci il file temporaneo se non è già stato fatto
    if (!useGcsUri && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    // Restituisci l'operationId al client
    res.status(200).json({
      message: 'Trascrizione avviata con successo',
      operationId: operation.name,
      useGcsUri: useGcsUri,
      gcsUri: useGcsUri ? gcsUri : null
    });

  } catch (error) {
    console.error('Errore durante la trascrizione:', error);

    // Pulisci il file temporaneo in caso di errore
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: 'Errore durante la trascrizione',
      details: error.message
    });
  }
};

/**
 * Verifica lo stato di una trascrizione in corso
 * @param {Request} req - Request object
 * @param {Response} res - Response object
 */
const getTranscriptionStatus = async (req, res) => {
  try {
    const { operationId } = req.params;

    if (!operationId) {
      return res.status(400).json({
        error: 'ID operazione non fornito',
        details: 'È necessario fornire l\'ID dell\'operazione da verificare'
      });
    }

    console.log('Controllo stato per operationId:', operationId);
    const operation = await client.checkLongRunningRecognizeProgress(operationId);
    console.log('Stato operazione:', operation);
    
    if (operation.done) {
      if (operation.error) {
        console.error('Errore nella trascrizione:', operation.error);
        return res.status(500).json({
          status: 'failed',
          error: operation.error.message
        });
      }

      if (!operation.result || !operation.result.results || operation.result.results.length === 0) {
        console.error('Nessun risultato trovato nella trascrizione');
        return res.status(500).json({
          status: 'failed',
          error: 'Nessun risultato trovato nella trascrizione'
        });
      }

      const transcription = operation.result.results
        .map(result => result.alternatives[0].transcript)
        .join(' ');

      // Genera un ID univoco per la trascrizione
      const transcriptionId = `tr-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      console.log('Trascrizione completata:', transcription);
      console.log('ID trascrizione generato:', transcriptionId);
      
      return res.status(200).json({
        status: 'completed',
        transcription: transcription,
        transcriptionId: transcriptionId
      });
    }

    console.log('Trascrizione ancora in corso...');
    res.status(200).json({
      status: 'in_progress',
      metadata: operation.metadata
    });

  } catch (error) {
    console.error('Errore nel controllo stato trascrizione:', error);
    res.status(500).json({
      error: 'Errore nel controllo stato trascrizione',
      details: error.message
    });
  }
};

module.exports = {
  transcribeAudio,
  getTranscriptionStatus
};