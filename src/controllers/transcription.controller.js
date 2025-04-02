const speech = require('@google-cloud/speech');
const path = require('path');
const fs = require('fs');
const storageConfig = require('../config/storage.config');
const { v4: uuidv4 } = require('uuid');
const Recording = require('../models/recording.model');
const Transcription = require('../models/transcription.model');

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
    // Verifica che l'utente sia autenticato
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        error: 'Autenticazione necessaria',
        details: 'Devi effettuare il login per utilizzare questa funzionalità'
      });
    }

    // Verifica se abbiamo un recordingId nei parametri
    const { recordingId } = req.body;
    let recording = null;
    
    // Se è fornito recordingId, controlliamo che esista
    if (recordingId) {
      try {
        recording = await Recording.findById(recordingId);
        if (!recording) {
          return res.status(404).json({
            error: 'Recording non trovato',
            details: `Nessun recording trovato con ID ${recordingId}`
          });
        }
        console.log(`Trovato recording: ${recording._id}, gcsFilename: ${recording.gcsFilename}`);
      } catch (error) {
        return res.status(400).json({
          error: 'ID recording non valido',
          details: 'Il formato dell\'ID fornito non è valido'
        });
      }
    }
    
    // Verifica se abbiamo un file o dobbiamo usare recording
    if (!req.file && !recording) {
      return res.status(400).json({ 
        error: 'Nessun file audio fornito',
        details: 'È necessario fornire un file audio o un recordingId valido'
      });
    }

    console.log(`Inizio trascrizione per: ${recording ? recording.title : req.file.originalname}`);

    // Prepara la richiesta per Speech-to-Text
    let audio = {};
    let useGcsUri = false;
    let gcsUri = '';
    
    // Se abbiamo un recording, usiamo il suo gcsFilename
    if (recording && recording.gcsFilename) {
      gcsUri = `gs://${process.env.GCS_BUCKET_NAME || 'echolog-audio-files'}/audio/${recording.gcsFilename}`;
      audio = { uri: gcsUri };
      useGcsUri = true;
      console.log('Utilizzo URI per Speech-to-Text da recording:', gcsUri);
    }
    // Altrimenti, gestiamo il file caricato
    else if (req.file) {
      // Verifica se utilizzare Google Cloud Storage
      if (storageConfig.useCloudStorage) {
        try {
          console.log('Caricamento file su GCS...');
          // Carica il file su GCS
          const fileBuffer = fs.readFileSync(req.file.path);
          const result = await storageConfig.uploadToGCS(
            fileBuffer,
            path.basename(req.file.originalname),
            req.file.mimetype
          );
          
          // Costruisci l'URI GCS
          gcsUri = `gs://${process.env.GCS_BUCKET_NAME || 'echolog-audio-files'}/audio/${result.filename}`;
          
          console.log('File caricato su GCS, utilizzo URI per Speech-to-Text:', gcsUri);
          audio = { uri: gcsUri };
          useGcsUri = true;
          
          // Crea un nuovo Recording se non esisteva
          if (!recording) {
            recording = new Recording({
              userId: req.user._id,
              title: req.file.originalname,
              audioUrl: result.url,
              filename: result.filename,
              gcsFilename: result.filename,
              duration: 0,
              format: req.file.mimetype.includes('wav') ? 'WAV' : 'MP3',
              size: req.file.size,
              status: 'completed'
            });
            await recording.save();
            console.log('Nuovo Recording creato:', recording._id);
          }
          
          // Pulisci il file temporaneo
          if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
        } catch (error) {
          console.error('Errore caricamento su GCS:', error);
          // Pulisci il file temporaneo in caso di errore
          if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
          return res.status(500).json({
            error: 'Errore nel caricamento su Google Cloud Storage',
            details: error.message
          });
        }
      } else {
        return res.status(501).json({ 
          error: 'Storage cloud non configurato',
          details: 'Il sistema è configurato per utilizzare solo Google Cloud Storage'
        });
      }
    }

    // Verifica che abbiamo un URI GCS valido prima di continuare
    if (!useGcsUri || !gcsUri) {
      return res.status(400).json({
        error: 'URI GCS non valido',
        details: 'Non è stato possibile generare un URI valido per Google Cloud Storage'
      });
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
    try {
      const [operation] = await client.longRunningRecognize(request);
      console.log('Trascrizione avviata, operationId:', operation.name);
  
      // Pulisci il file temporaneo se non è già stato fatto
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
  
      // Restituisci l'operationId al client insieme all'ID del recording
      res.status(200).json({
        message: 'Trascrizione avviata con successo',
        operationId: operation.name,
        recordingId: recording ? recording._id : null,
        useGcsUri: useGcsUri,
        gcsUri: gcsUri
      });
    } catch (error) {
      console.error('Errore nell\'avvio della trascrizione:', error);
      return res.status(500).json({
        error: 'Errore nell\'avvio della trascrizione',
        details: error.message
      });
    }

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
    const { recordingId } = req.query;

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

      const transcriptionText = operation.result.results
        .map(result => result.alternatives[0].transcript)
        .join(' ');

      // Cerca il recording tramite recordingId
      let recording = null;
      if (recordingId) {
        recording = await Recording.findById(recordingId);
        if (!recording) {
          console.warn(`Recording ${recordingId} non trovato, la trascrizione non sarà collegata`);
        }
      }

      // Crea un nuovo documento Transcription o usa un ID temporaneo
      let transcriptionId = null;
      try {
        // Se abbiamo un recording, creiamo una trascrizione collegata
        if (recording) {
          const transcription = new Transcription({
            recordingId: recording._id,
            userId: req.user._id,
            fullText: transcriptionText,
            language: 'it-IT', // Per ora hardcoded, da rendere dinamico in futuro
            status: 'completed',
            sections: []
          });
          
          await transcription.save();
          console.log(`Trascrizione salvata con ID: ${transcription._id}`);
          transcriptionId = transcription._id;
          
          // Aggiorna il recordingId nel frontend
          return res.status(200).json({
            status: 'completed',
            transcription: transcriptionText,
            transcriptionId: transcription._id,
            recordingId: recording._id
          });
        } else {
          // Se non abbiamo un recording, restituiamo solo il testo
          // Genera un ID temporaneo in un formato più riconoscibile
          const randomId = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
          const timestamp = Date.now();
          transcriptionId = `tr-${timestamp}-${randomId}`;
          
          console.warn('Nessun recording trovato, trascrizione non salvata nel database, usando ID temporaneo:', transcriptionId);
          return res.status(200).json({
            status: 'completed',
            transcription: transcriptionText,
            transcriptionId: transcriptionId,
            warning: 'Nessun recording trovato, la trascrizione non è stata salvata permanentemente'
          });
        }
      } catch (error) {
        console.error('Errore nel salvare la trascrizione:', error);
        // In caso di errore nel salvataggio, restituiamo comunque il testo con un ID temporaneo
        const randomId = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const timestamp = Date.now();
        transcriptionId = `tr-${timestamp}-${randomId}`;
        
        return res.status(200).json({
          status: 'completed',
          transcription: transcriptionText,
          transcriptionId: transcriptionId,
          error: 'Errore nel salvare la trascrizione',
          details: error.message,
          warning: 'La trascrizione non è stata salvata permanentemente'
        });
      }
    }

    // Se non è completata, restituisci lo stato attuale
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

/**
 * Controlla lo stato di una trascrizione avviata
 * @param {Request} req - Request object
 * @param {Response} res - Response object
 */
const checkTranscription = async (req, res) => {
  try {
    const { operationId } = req.params;
    
    if (!TRANSCRIPTION_OPERATIONS[operationId]) {
      return res.status(404).json({
        error: 'Operazione non trovata',
        details: 'L\'ID operazione specificato non è valido o è scaduto'
      });
    }
    
    const operation = TRANSCRIPTION_OPERATIONS[operationId];
    
    if (operation.completed) {
      console.log('Operazione già completata:', operationId);
      
      // Se c'è un errore
      if (operation.error) {
        return res.status(200).json({
          status: 'failed',
          error: operation.error
        });
      }
      
      // Se è andato tutto bene, restituisci la trascrizione
      return res.status(200).json({
        status: 'completed',
        transcription: operation.transcription,
        transcriptionId: operation.transcriptionId,
        audioFilename: operation.audioFilename // Aggiungi audioFilename alla risposta
      });
    }
    
    // Verifica lo stato dell'operazione
    const [ response ] = await operation.latestResponse.promise();
    
    // Se non è completa, restituisci lo stato
    if (!response.done) {
      console.log('Operazione ancora in corso:', operationId);
      return res.status(200).json({
        status: 'processing',
        progress: Math.floor(Math.random() * 20) + 60 // Valore esempio tra 60 e 80
      });
    }
    
    // Se c'è stato un errore
    if (response.error) {
      console.error('Errore durante la trascrizione:', response.error);
      operation.completed = true;
      operation.error = response.error.message || 'Errore sconosciuto durante la trascrizione';
      
      return res.status(200).json({
        status: 'failed',
        error: operation.error
      });
    }
    
    // Estrai la trascrizione dai risultati
    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');
    
    console.log('Trascrizione completata con successo:', operationId);
    
    // Genera un ID univoco per la trascrizione
    const transcriptionId = `tr-${uuidv4().substring(0, 12)}-${Math.floor(Math.random() * 1000)}`;
    
    // Salva i dati
    operation.completed = true;
    operation.transcription = transcription;
    operation.transcriptionId = transcriptionId;
    operation.audioFilename = operation.audioFilename; // Assicurati che venga salvato
    
    res.status(200).json({
      status: 'completed',
      transcription: transcription,
      transcriptionId: transcriptionId,
      audioFilename: operation.audioFilename // Includi audioFilename nella risposta
    });
  } catch (error) {
    console.error('Errore durante il controllo della trascrizione:', error);
    
    res.status(500).json({
      status: 'failed',
      error: error.message || 'Errore durante il controllo della trascrizione'
    });
  }
};

module.exports = {
  transcribeAudio,
  getTranscriptionStatus,
  checkTranscription
};