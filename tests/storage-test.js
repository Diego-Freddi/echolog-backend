/**
 * Test di verifica della configurazione di Google Cloud Storage
 * 
 * Questo script verifica che il bucket sia correttamente configurato 
 * e che le operazioni di base funzionino correttamente.
 * 
 * Per eseguire: node tests/storage-test.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const storageConfig = require('../src/config/storage.config');

// Path di un file di test
const testFilePath = path.join(__dirname, 'test-audio.mp3');

// Crea un file di test se non esiste
if (!fs.existsSync(testFilePath)) {
  // Crea un file vuoto di 10KB
  const buffer = Buffer.alloc(10 * 1024, 0);
  fs.writeFileSync(testFilePath, buffer);
  console.log('✅ File di test creato:', testFilePath);
}

async function runTest() {
  console.log('🧪 Test storage Google Cloud Storage');
  console.log('-------------------------------------');
  
  if (!storageConfig.useCloudStorage) {
    console.log('❌ Google Cloud Storage non è abilitato. Imposta USE_CLOUD_STORAGE=true nel file .env');
    return;
  }
  
  try {
    // Inizializza il bucket
    console.log('1. Inizializzazione bucket...');
    await storageConfig.initBucket();
    console.log('✅ Bucket inizializzato correttamente');
    
    // Upload file
    console.log('\n2. Test upload file...');
    const fileBuffer = fs.readFileSync(testFilePath);
    const uploadResult = await storageConfig.uploadToGCS(
      fileBuffer,
      'test-audio.mp3',
      'audio/mpeg'
    );
    console.log('✅ File caricato:', uploadResult.url);
    
    // Download file
    console.log('\n3. Test download file...');
    const downloadedBuffer = await storageConfig.getFromGCS(uploadResult.filename);
    console.log('✅ File scaricato, dimensione:', downloadedBuffer.length, 'bytes');
    
    // URL firmato
    console.log('\n4. Test URL firmato...');
    const signedUrl = await storageConfig.getSignedUrl(uploadResult.filename, 60);
    console.log('✅ URL firmato generato (valido per 60 secondi):', signedUrl);
    
    // Eliminazione file
    console.log('\n5. Test eliminazione file...');
    await storageConfig.deleteFromGCS(uploadResult.filename);
    console.log('✅ File eliminato correttamente');
    
    console.log('\n📝 Riepilogo del test:');
    console.log('- Cloud Storage è configurato correttamente');
    console.log('- Il bucket esiste ed è accessibile');
    console.log('- Tutte le operazioni (upload, download, URL firmati, eliminazione) funzionano correttamente');
    console.log('\n✅ Test completato con successo!');
    
  } catch (error) {
    console.error('❌ Errore durante il test:', error);
  }
}

runTest(); 