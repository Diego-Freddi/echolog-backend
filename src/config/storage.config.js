const { Storage } = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Verifica se utilizzare Google Cloud Storage o storage locale
const useCloudStorage = process.env.USE_CLOUD_STORAGE === 'true';

// Nome del bucket su Google Cloud Storage
const bucketName = process.env.GCS_BUCKET_NAME || 'echolog-audio-files';

// Periodo di conservazione dei file in giorni
const FILE_RETENTION_DAYS = 7;

// Inizializzazione del client Storage solo se necessario
let storage;
if (useCloudStorage) {
  storage = new Storage();
}

/**
 * Carica un file su Google Cloud Storage
 * @param {Buffer} buffer - Buffer del file da caricare
 * @param {string} originalName - Nome originale del file
 * @param {string} mimeType - MIME type del file
 * @returns {Promise<{filename: string, url: string}>} Nome del file e URL firmato
 */
const uploadToGCS = async (buffer, originalName, mimeType) => {
  try {
    if (!useCloudStorage) {
      throw new Error('Google Cloud Storage non è abilitato');
    }

    if (!buffer || buffer.length === 0) {
      throw new Error('Buffer del file non valido o vuoto');
    }

    if (!originalName) {
      throw new Error('Nome file originale non specificato');
    }

    // Verifica che il bucket esista e sia accessibile
    const bucket = storage.bucket(bucketName);
    const [exists] = await bucket.exists();
    if (!exists) {
      throw new Error(`Il bucket ${bucketName} non esiste o non è accessibile`);
    }

    // Genera un nome file unico
    const uuid = uuidv4();
    const filename = `${uuid}-${originalName}`;
    const file = bucket.file(`audio/${filename}`);
    
    console.log(`Tentativo di upload su GCS: ${filename} (${buffer.length} byte)`);
    
    // Upload del file
    const stream = file.createWriteStream({
      resumable: false,
      contentType: mimeType
    });
    
    await new Promise((resolve, reject) => {
      stream.on('error', (err) => {
        console.error('Errore durante upload su GCS:', err);
        reject(err);
      });
      
      stream.on('finish', () => {
        console.log(`File caricato su GCS: audio/${filename}`);
        resolve();
      });
      
      stream.end(buffer);
    });
    
    // Genera URL firmato (valido per 24 ore)
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 24 * 60 * 60 * 1000 // 24 ore
    });
    
    console.log('URL firmato generato per il download');
    
    return {
      filename,
      url
    };
  } catch (error) {
    console.error(`Errore nel caricamento su GCS: ${error.message}`);
    if (error.code) {
      console.error(`Codice errore: ${error.code}`);
    }
    throw error; // Rilanciamo l'errore originale senza modificarlo
  }
};

/**
 * Recupera un file da Google Cloud Storage
 * @param {String} fileName - Nome del file
 * @returns {Promise<Buffer>} Buffer del file
 */
const getFromGCS = async (fileName) => {
  if (!useCloudStorage) {
    throw new Error('Google Cloud Storage non è abilitato');
  }
  
  try {
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(`audio/${fileName}`);
    
    // Verifica se il file esiste
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error('File non trovato su Google Cloud Storage');
    }
    
    // Ottieni il contenuto del file
    const [fileContent] = await file.download();
    return fileContent;
  } catch (error) {
    console.error('Errore durante il recupero da GCS:', error);
    throw error;
  }
};

/**
 * Elimina un file da Google Cloud Storage
 * @param {String} fileName - Nome del file
 * @returns {Promise<void>}
 */
const deleteFromGCS = async (fileName) => {
  if (!useCloudStorage) {
    throw new Error('Google Cloud Storage non è abilitato');
  }
  
  try {
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(`audio/${fileName}`);
    
    // Verifica se il file esiste
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error('File non trovato su Google Cloud Storage');
    }
    
    // Elimina il file
    await file.delete();
  } catch (error) {
    console.error('Errore durante l\'eliminazione da GCS:', error);
    throw error;
  }
};

/**
 * Genera un URL firmato per accedere a un file privato
 * @param {String} fileName - Nome del file
 * @param {Number} expiration - Scadenza in secondi (default: 15 minuti)
 * @returns {Promise<String>} URL firmato
 */
const getSignedUrl = async (fileName, expiration = 900) => {
  if (!useCloudStorage) {
    throw new Error('Google Cloud Storage non è abilitato');
  }
  
  try {
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(`audio/${fileName}`);
    
    const options = {
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiration * 1000,
    };
    
    const [url] = await file.getSignedUrl(options);
    return url;
  } catch (error) {
    console.error('Errore durante la generazione dell\'URL firmato:', error);
    throw error;
  }
};

/**
 * Verifica che le regole del ciclo vita siano configurate correttamente
 * @returns {Promise<boolean>} true se la regola è configurata correttamente
 */
const verifyLifecycleRule = async () => {
  if (!useCloudStorage) return false;
  
  try {
    const bucket = storage.bucket(bucketName);
    const [metadata] = await bucket.getMetadata();
    
    // Verifica se esistono regole del ciclo vita
    if (metadata.lifecycle && metadata.lifecycle.rule) {
      const rules = metadata.lifecycle.rule;
      
      // Cerca una regola che elimina gli oggetti dopo FILE_RETENTION_DAYS giorni
      const hasCorrectRule = rules.some(rule => 
        rule.action && rule.action.type === 'Delete' && 
        rule.condition && rule.condition.age === FILE_RETENTION_DAYS
      );
      
      if (hasCorrectRule) {
        console.log(`✅ Regola ciclo vita (${FILE_RETENTION_DAYS} giorni) verificata.`);
        return true;
      } else {
        console.log(`⚠️ ATTENZIONE: Regola ciclo vita di ${FILE_RETENTION_DAYS} giorni non trovata.`);
        console.log('La regola attuale potrebbe essere diversa da quella prevista dall\'applicazione.');
        return false;
      }
    } else {
      console.log('⚠️ ATTENZIONE: Nessuna regola ciclo vita configurata sul bucket.');
      return false;
    }
  } catch (error) {
    console.error('Errore nella verifica del ciclo vita:', error);
    return false;
  }
};

// Verifica che il bucket esista e lo crea se necessario
const initBucket = async () => {
  if (!useCloudStorage) return;
  
  try {
    // Utilizziamo bucket.exists() che richiede solo il permesso storage.buckets.get
    const bucket = storage.bucket(bucketName);
    const [exists] = await bucket.exists();
    
    if (!exists) {
      console.log(`Creazione del bucket '${bucketName}'...`);
      await storage.createBucket(bucketName, {
        location: 'us-central1',
        storageClass: 'STANDARD',
        iamConfiguration: {
          uniformBucketLevelAccess: {
            enabled: true,
          },
        }
      });
      console.log(`Bucket '${bucketName}' creato con successo con accesso uniforme.`);
    } else {
      console.log(`Bucket '${bucketName}' esistente.`);
      
      // Verifichiamo le impostazioni di accesso uniforme
      const [metadata] = await bucket.getMetadata();
      
      const ubaEnabled = metadata.iamConfiguration?.uniformBucketLevelAccess?.enabled || false;
      console.log(`Accesso uniforme al bucket: ${ubaEnabled ? 'abilitato' : 'disabilitato'}`);
      
      if (!ubaEnabled) {
        console.log('ATTENZIONE: Il bucket non ha l\'accesso uniforme abilitato.');
        console.log('Consigliato: Abilita l\'accesso uniforme nella console Google Cloud.');
      }
    }
    
    // Verifica le regole del ciclo vita
    await verifyLifecycleRule();
  } catch (error) {
    console.error('Errore durante l\'inizializzazione del bucket:', error);
  }
};

module.exports = {
  useCloudStorage,
  uploadToGCS,
  getFromGCS,
  deleteFromGCS,
  getSignedUrl,
  initBucket,
  FILE_RETENTION_DAYS
}; 