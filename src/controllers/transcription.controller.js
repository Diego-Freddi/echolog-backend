const speech = require('@google-cloud/speech');
const path = require('path');
const fs = require('fs');
const storageConfig = require('../config/storage.config');
const Recording = require('../models/recording.model');
const Transcription = require('../models/transcription.model');
const Analysis = require('../models/analysis.model');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

// Inizializzazione del client Speech-to-Text
const client = new speech.SpeechClient();

/**
 * Configura le opzioni di base per la trascrizione
 * @param {Object} options - Opzioni personalizzate (opzionale)
 * @returns {Object} Configurazione per Speech-to-Text
 */
const getTranscriptionConfig = (options = {}) => ({
  encoding: options.encoding || 'MP3',
  sampleRateHertz: options.sampleRateHertz || 16000,
  languageCode: options.languageCode || 'it-IT', // Formato completo per Google Speech-to-Text (ISO 639-1 + paese)
  enableAutomaticPunctuation: true,
  model: 'latest_long', 
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
          
          // Verifica che l'upload sia andato a buon fine e abbiamo un filename valido
          if (!result || !result.filename || !result.url) {
            throw new Error('Upload su Google Cloud Storage fallito: risultato non valido');
          }
          
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

      // Verifica che recordingId sia fornito
      if (!recordingId) {
        console.error('recordingId non fornito per il salvataggio della trascrizione');
        return res.status(400).json({
          status: 'failed',
          error: 'ID del recording mancante',
          details: 'È necessario fornire un recordingId valido per salvare la trascrizione'
        });
      }

      // Cerca il recording tramite recordingId
      let recording = null;
      try {
        recording = await Recording.findById(recordingId);
        if (!recording) {
          console.error(`Recording ${recordingId} non trovato`);
          return res.status(404).json({
            status: 'failed',
            error: 'Recording non trovato',
            details: `Il recording con ID ${recordingId} non esiste o è stato eliminato`
          });
        }
      } catch (error) {
        console.error(`Errore durante la ricerca del recording ${recordingId}:`, error);
        return res.status(400).json({
          status: 'failed',
          error: 'ID recording non valido',
          details: 'Il formato dell\'ID fornito non è valido'
        });
      }

      // A questo punto abbiamo sia il testo trascritto che un recording valido
      console.log(`Creazione trascrizione per recording: ${recording._id} (${recording.title})`);
      
      try {
        // Creiamo una trascrizione collegata al recording
        const transcription = new Transcription({
          recordingId: recording._id,
          userId: req.user._id,
          fullText: transcriptionText,
          language: 'it', // Formato ISO 639-1 supportato da MongoDB
          status: 'completed',
          sections: []
        });
        
        await transcription.save();
        console.log(`Trascrizione salvata con ID: ${transcription._id}`);
        
        // Ritorna i dati completi
        return res.status(200).json({
          status: 'completed',
          transcription: transcriptionText,
          transcriptionId: transcription._id,
          recordingId: recording._id
        });
      } catch (error) {
        console.error('Errore nel salvare la trascrizione:', error);
        return res.status(500).json({
          status: 'failed',
          error: 'Errore nel salvare la trascrizione',
          details: error.message,
          recordingId: recording._id
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
 * Elimina una trascrizione e tutti i dati associati (analisi, registrazione, file GCS)
 * @param {Request} req - Request object
 * @param {Response} res - Response object
 */
const deleteTranscription = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    // Verifica che l'utente sia autenticato
    if (!userId) {
      return res.status(401).json({
        error: 'Autenticazione necessaria',
        details: 'Devi effettuare il login per utilizzare questa funzionalità'
      });
    }

    // Trova la trascrizione
    const transcription = await Transcription.findOne({ 
      _id: id,
      userId: userId
    });

    if (!transcription) {
      return res.status(404).json({
        error: 'Trascrizione non trovata',
        details: 'La trascrizione richiesta non esiste o non appartiene all\'utente'
      });
    }

    // Trova e elimina l'analisi associata
    const analysisDeleted = await Analysis.deleteMany({
      transcription: transcription._id,
      userId: userId
    });
    
    console.log(`Analisi eliminate: ${analysisDeleted.deletedCount}`);

    // Trova la registrazione associata
    const recording = await Recording.findOne({
      _id: transcription.recordingId,
      userId: userId
    });

    // Elimina il file audio da GCS se presente
    if (recording && recording.gcsFilename) {
      try {
        const deleted = await storageConfig.deleteFromGCS(recording.gcsFilename);
        console.log(`File audio eliminato da GCS: ${deleted ? 'Sì' : 'No'}`);
      } catch (error) {
        console.error('Errore nell\'eliminazione del file audio da GCS:', error);
        // Continuiamo comunque perché il file potrebbe essere già stato eliminato o scaduto
      }
    }

    // Elimina la registrazione
    if (recording) {
      await Recording.deleteOne({ _id: recording._id });
      console.log(`Registrazione eliminata: ${recording._id}`);
    }

    // Elimina la trascrizione
    await Transcription.deleteOne({ _id: transcription._id });
    console.log(`Trascrizione eliminata: ${transcription._id}`);

    // Ritorna successo
    res.status(200).json({
      message: 'Trascrizione e dati associati eliminati con successo',
      transcriptionId: transcription._id,
      recordingId: recording ? recording._id : null,
      analysisDeleted: analysisDeleted.deletedCount
    });
  } catch (error) {
    console.error('Errore nell\'eliminazione della trascrizione:', error);
    
    // Gestione specifica dell'errore di cast (ID non valido)
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'ID trascrizione non valido',
        details: 'Il formato dell\'ID fornito non è valido'
      });
    }
    
    res.status(500).json({
      error: 'Errore nell\'eliminazione della trascrizione',
      details: error.message
    });
  }
};

/**
 * Crea una trascrizione da testo inserito direttamente dall'utente
 * @param {Request} req - Request object
 * @param {Response} res - Response object
 */
const transcribeFromText = async (req, res) => {
  try {
    // Verifica che l'utente sia autenticato
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        error: 'Autenticazione necessaria',
        details: 'Devi effettuare il login per utilizzare questa funzionalità'
      });
    }

    // Verifica che il testo sia stato fornito
    const { text, title } = req.body;
    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        error: 'Testo mancante',
        details: 'È necessario fornire il testo da trascrivere'
      });
    }

    const finalTitle = title || `Testo diretto ${new Date().toLocaleString('it-IT')}`;
    
    console.log(`Creazione recording virtuale per input diretto: "${finalTitle}"`);
    
    // Crea un recording virtuale (senza file audio)
    const recording = new Recording({
      userId: req.user._id,
      title: finalTitle,
      audioUrl: null, // Nessun URL audio
      filename: null, // Nessun filename
      gcsFilename: null, // Nessun file su GCS
      duration: 0, // Durata simbolica
      format: 'TEXT', // Formato speciale per registrazioni virtuali
      size: Buffer.from(text).length, // Dimensione del testo in bytes
      status: 'completed'
    });
    
    await recording.save();
    console.log(`Recording virtuale creato con ID: ${recording._id}`);
    
    // Crea una trascrizione collegata al recording virtuale
    const transcription = new Transcription({
      recordingId: recording._id,
      userId: req.user._id,
      fullText: text,
      language: 'it', // Assumiamo italiano come default
      status: 'completed',
      sections: []
    });
    
    await transcription.save();
    console.log(`Trascrizione creata con ID: ${transcription._id}`);
    
    // Ritorna i dati completi
    return res.status(200).json({
      status: 'completed',
      message: 'Trascrizione da testo completata con successo',
      transcription: text,
      transcriptionId: transcription._id,
      recordingId: recording._id
    });
  } catch (error) {
    console.error('Errore durante la creazione della trascrizione da testo:', error);
    
    res.status(500).json({
      error: 'Errore durante la creazione della trascrizione',
      details: error.message
    });
  }
};

/**
 * Estrae e crea una trascrizione da un file (PDF, DOC, DOCX, TXT)
 * @param {Request} req - Request object
 * @param {Response} res - Response object
 */
const transcribeFromFile = async (req, res) => {
  try {
    // Verifica che l'utente sia autenticato
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        error: 'Autenticazione necessaria',
        details: 'Devi effettuare il login per utilizzare questa funzionalità'
      });
    }

    // Verifica se abbiamo un file
    if (!req.file) {
      return res.status(400).json({ 
        error: 'Nessun file fornito',
        details: 'È necessario fornire un file per l\'estrazione del testo'
      });
    }

    const file = req.file;
    const filePath = file.path;
    const fileExtension = path.extname(file.originalname).toLowerCase();
    let extractedText = '';

    console.log(`Estrazione testo da file ${file.originalname} (${fileExtension})`);

    // Estrai il testo in base al tipo di file
    try {
      if (fileExtension === '.pdf') {
        // Estrai testo da PDF
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);
        extractedText = pdfData.text;
      } else if (fileExtension === '.docx' || fileExtension === '.doc') {
        // Estrai testo da DOCX/DOC
        const dataBuffer = fs.readFileSync(filePath);
        const result = await mammoth.extractRawText({ buffer: dataBuffer });
        extractedText = result.value;
      } else if (fileExtension === '.txt') {
        // Leggi file di testo direttamente
        extractedText = fs.readFileSync(filePath, 'utf8');
      } else {
        // Formato non supportato
        return res.status(400).json({
          error: 'Formato file non supportato',
          details: `Il formato ${fileExtension} non è supportato. Formati supportati: PDF, DOCX, DOC, TXT`
        });
      }
    } catch (extractionError) {
      console.error('Errore nell\'estrazione del testo:', extractionError);
      return res.status(500).json({
        error: 'Errore nell\'estrazione del testo',
        details: extractionError.message
      });
    } finally {
      // Pulisci il file temporaneo
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`File temporaneo eliminato: ${filePath}`);
      }
    }

    // Verifica che sia stato estratto del testo
    if (!extractedText || extractedText.trim().length === 0) {
      return res.status(400).json({
        error: 'Nessun testo estratto',
        details: 'Non è stato possibile estrarre testo dal file fornito'
      });
    }

    console.log(`Testo estratto con successo (${extractedText.length} caratteri)`);
    
    // Crea un recording virtuale (senza file audio)
    const recording = new Recording({
      userId: req.user._id,
      title: file.originalname,
      audioUrl: null, // Nessun URL audio
      filename: file.originalname,
      gcsFilename: null, // Nessun file su GCS
      duration: 0, // Durata simbolica
      format: 'TEXT', // Formato speciale per registrazioni virtuali
      size: file.size,
      status: 'completed'
    });
    
    await recording.save();
    console.log(`Recording virtuale creato con ID: ${recording._id}`);
    
    // Crea una trascrizione collegata al recording virtuale
    const transcription = new Transcription({
      recordingId: recording._id,
      userId: req.user._id,
      fullText: extractedText,
      language: 'it', // Assumiamo italiano come default
      status: 'completed',
      sections: []
    });
    
    await transcription.save();
    console.log(`Trascrizione creata con ID: ${transcription._id}`);
    
    // Ritorna i dati completi
    return res.status(200).json({
      status: 'completed',
      message: 'Estrazione testo completata con successo',
      transcription: extractedText,
      transcriptionId: transcription._id,
      recordingId: recording._id,
      filename: file.originalname
    });
  } catch (error) {
    console.error('Errore durante l\'estrazione del testo dal file:', error);
    
    // Pulisci il file temporaneo in caso di errore
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      error: 'Errore durante l\'estrazione del testo',
      details: error.message
    });
  }
};

module.exports = {
  transcribeAudio,
  getTranscriptionStatus,
  deleteTranscription,
  transcribeFromText,
  transcribeFromFile
};