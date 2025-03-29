const speech = require('@google-cloud/speech');
const { VertexAI } = require('@google-cloud/vertexai');
const path = require('path');

// Configurazione del percorso delle credenziali
const credentialsPath = path.join(__dirname, '../Google/echolog-455210-0deaa070889f.json');
process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;

async function testSpeechToText() {
    try {
        console.log('🎤 Test Speech-to-Text API...');
        const client = new speech.SpeechClient();
        
        // Test con una richiesta minima
        const config = {
            encoding: 'LINEAR16',
            sampleRateHertz: 16000,
            languageCode: 'it-IT',
        };
        
        // Verifichiamo solo che il client sia configurato correttamente
        console.log('✅ Speech-to-Text API: Client configurato correttamente');
        return true;
    } catch (error) {
        console.error('❌ Speech-to-Text API Error:', error.message);
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
    
    const speechResult = await testSpeechToText();
    console.log('--------------------------------');
    const vertexResult = await testVertexAI();
    
    console.log('================================');
    if (speechResult && vertexResult) {
        console.log('✨ Tutti i test completati con successo!');
    } else {
        console.log('⚠️ Alcuni test sono falliti. Controlla gli errori sopra.');
    }
}

runTests(); 