const mongoose = require('mongoose');
const connectDB = require('../src/config/database');
const User = require('../src/models/user.model');
const Recording = require('../src/models/recording.model');
const Transcription = require('../src/models/transcription.model');

const testConnection = async () => {
    try {
        // Connessione al database
        await connectDB();
        console.log('✅ Test di connessione completato con successo');

        // Test dei modelli
        console.log('\nVerifica dei modelli:');
        console.log('User:', User.modelName);
        console.log('Recording:', Recording.modelName);
        console.log('Transcription:', Transcription.modelName);

        // Chiudi la connessione
        await mongoose.connection.close();
        console.log('\nConnessione chiusa correttamente');
        process.exit(0);
    } catch (error) {
        console.error('❌ Errore durante il test:', error);
        process.exit(1);
    }
};

testConnection(); 