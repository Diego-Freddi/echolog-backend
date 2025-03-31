const speech = require('@google-cloud/speech');
const { VertexAI } = require('@google-cloud/vertexai');
const path = require('path');
const fs = require('fs');

// Configurazione del percorso delle credenziali
const credentialsPath = path.join(__dirname, '../Google/gcloud-key.json');
process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;

async function testSpeechToText(audioFormat = 'wav') {
    try {
        console.log(`🎤 Test Speech-to-Text API con file ${audioFormat.toUpperCase()}...`);
        const client = new speech.SpeechClient();
        
        // Leggi il file audio di test
        const testAudioPath = path.join(__dirname, `audio/test.${audioFormat}`);
        const audioBytes = fs.readFileSync(testAudioPath).toString('base64');
        
        // Configura la richiesta
        const audio = {
            content: audioBytes
        };
        const config = {
            encoding: audioFormat === 'wav' ? 'LINEAR16' : 'MP4',
            sampleRateHertz: 16000,
            languageCode: 'it-IT',
            enableAutomaticPunctuation: true,
            model: 'latest_long'
        };
        
        console.log('📤 Invio richiesta di trascrizione...');
        const [response] = await client.recognize({ audio, config });
        
        if (response.results && response.results.length > 0) {
            console.log('✅ Trascrizione completata con successo');
            console.log('📝 Testo trascritto:', response.results[0].alternatives[0].transcript);
            return true;
        } else {
            console.log('⚠️ Nessun risultato nella trascrizione');
            return false;
        }
    } catch (error) {
        console.error(`❌ Speech-to-Text API Error (${audioFormat.toUpperCase()}):`, error.message);
        return false;
    }
}

async function testVertexAI() {
    try {
        console.log('🤖 Test Vertex AI (Gemini)...');
        const vertex_ai = new VertexAI({
            project: 'echolog-455210',
            location: 'us-central1',
        });
        
        const model = vertex_ai.preview.getGenerativeModel({
            model: 'gemini-pro'
        });
        
        const prompt = 'Rispondi con "OK" se riesci a leggere questo messaggio.';
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.candidates[0].content.parts[0].text;
        
        console.log('✅ Vertex AI Response:', text);
        return true;
    } catch (error) {
        console.error('❌ Vertex AI Error:', error.message);
        return false;
    }
}

async function runTests() {
    console.log('🔑 Test Credenziali Google Cloud');
    console.log('================================');
    
    // Test con WAV
    const speechResultWav = await testSpeechToText('wav');
    console.log('--------------------------------');
    
    // Test con MP4
    const speechResultMp4 = await testSpeechToText('mp3'); // Il file è in realtà MP4
    console.log('--------------------------------');
    
    const vertexResult = await testVertexAI();
    
    console.log('================================');
    if (speechResultWav && speechResultMp4 && vertexResult) {
        console.log('✨ Tutti i test completati con successo!');
    } else {
        console.log('⚠️ Alcuni test sono falliti. Controlla gli errori sopra.');
    }
}

runTests(); 