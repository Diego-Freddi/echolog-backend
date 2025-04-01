const { Storage } = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Verifica se utilizzare Google Cloud Storage o storage locale
const useCloudStorage = process.env.USE_CLOUD_STORAGE === 'true';

// Nome del bucket su Google Cloud Storage
const bucketName = process.env.GCS_BUCKET_NAME || 'echolog-audio-files';

// Inizializzazione del client Storage solo se necessario
let storage;
if (useCloudStorage) {
  storage = new Storage();
}

/**
 * Carica un file su Google Cloud Storage
 * @param {Buffer} fileBuffer - Buffer del file
 * @param {String} fileName - Nome del file
 * @param {String} mimetype - Tipo MIME del file
 * @returns {Promise<String>} URL del file caricato
 */
const uploadToGCS = async (fileBuffer, fileName, mimetype) => {
  if (!useCloudStorage) {
    throw new Error('Google Cloud Storage non è abilitato');
  }
  
  try {
    const bucket = storage.bucket(bucketName);
    const uniqueFileName = `${uuidv4()}-${fileName}`;
    const file = bucket.file(`audio/${uniqueFileName}`);
    
    // Opzioni per il file
    const options = {
      metadata: {
        contentType: mimetype,
      },
      resumable: false // Per file piccoli è più efficiente
    };
    
    // Upload del file
    await file.save(fileBuffer, options);
    
    // Non proviamo a rendere pubblico il file
    // await file.makePublic(); <-- Questa riga causa l'errore
    
    // Generiamo un URL firmato valido per 24 ore (o configurare come necessario)
    const signedUrlConfig = {
      version: 'v4',
      action: 'read',
      expires: Date.now() + 24 * 60 * 60 * 1000, // 24 ore
    };
    
    const [signedUrl] = await file.getSignedUrl(signedUrlConfig);
    
    // Restituiamo l'URL firmato e il nome del file
    return { url: signedUrl, filename: uniqueFileName };
  } catch (error) {
    console.error('Errore durante il caricamento su GCS:', error);
    throw error;
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

// Verifica che il bucket esista e lo crea se necessario
const initBucket = async () => {
  if (!useCloudStorage) return;
  
  try {
    const [buckets] = await storage.getBuckets();
    const bucketExists = buckets.some(bucket => bucket.name === bucketName);
    
    if (!bucketExists) {
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
      const [metadata] = await storage.bucket(bucketName).getMetadata();
      
      const ubaEnabled = metadata.iamConfiguration?.uniformBucketLevelAccess?.enabled || false;
      console.log(`Accesso uniforme al bucket: ${ubaEnabled ? 'abilitato' : 'disabilitato'}`);
      
      if (!ubaEnabled) {
        console.log('ATTENZIONE: Il bucket non ha l\'accesso uniforme abilitato.');
        console.log('Consigliato: Abilita l\'accesso uniforme nella console Google Cloud.');
      }
    }
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
  initBucket
}; 