const { Storage } = require('@google-cloud/storage');
const path = require('path');

// Percorso assoluto al file JSON di credenziali
const keyPath = path.join(__dirname, '../../Google/gcloud-key.json');

console.log('🔑 Carico credenziali da:', keyPath);

// Crea istanza autenticata
const storage = new Storage({ keyFilename: keyPath });

const bucketName = 'echolog-audio-files';

exports.uploadToGCS = async (localFilePath, destinationFileName) => {
  try {
    console.log('📤 Inizio upload su GCS:', {
      bucket: bucketName,
      localFile: localFilePath,
      destination: destinationFileName
    });

    // Verifica che il bucket esista
    const [exists] = await storage.bucket(bucketName).exists();
    if (!exists) {
      throw new Error(`Bucket ${bucketName} non trovato`);
    }

    console.log('✅ Bucket trovato, procedo con l\'upload...');

    await storage.bucket(bucketName).upload(localFilePath, {
      destination: destinationFileName,
      metadata: {
        contentType: 'audio/mp3'
      }
    });

    const gcsUri = `gs://${bucketName}/${destinationFileName}`;
    console.log(`✅ File caricato con successo:`, gcsUri);
    return gcsUri;

  } catch (error) {
    console.error('❌ Errore durante upload su GCS:', error);
    console.error('Stack trace:', error.stack);
    throw error;
  }
}; 