const { CloudBillingClient } = require('@google-cloud/billing');
const path = require('path');
const fs = require('fs');

// Ottieni l'ID del progetto Google Cloud e l'ID dell'account di fatturazione dalle variabili d'ambiente
const projectId = process.env.GOOGLE_PROJECT_ID;
const billingAccountId = process.env.GOOGLE_CLOUD_BILLING_ACCOUNT_ID;

// Configura il client per l'API Cloud Billing con le credenziali specifiche
const billingCredentialsPath = path.join(__dirname, '../../', process.env.GOOGLE_BILLING_CREDENTIALS);

// Recupera i costi attuali del progetto
exports.getProjectCosts = async (req, res) => {
  try {
    // Verifica autenticazione
    if (!req.user) {
      return res.status(401).json({ error: 'Non autorizzato' });
    }
    
    console.log('=== INIZIO DIAGNOSTICA COMPLETA CLOUD BILLING API ===');
    console.log('ID progetto:', projectId);
    console.log('ID account di fatturazione:', billingAccountId);
    console.log('Percorso credenziali:', billingCredentialsPath);
    
    // Verifica esistenza file credenziali
    try {
      const credentialsExist = fs.existsSync(billingCredentialsPath);
      console.log('File credenziali esiste:', credentialsExist);
      
      if (credentialsExist) {
        const stats = fs.statSync(billingCredentialsPath);
        console.log('Dimensione file credenziali:', stats.size, 'bytes');
        
        // Leggi il contenuto del file per verificare che sia un JSON valido (solo i primi 100 caratteri per sicurezza)
        const fileContent = fs.readFileSync(billingCredentialsPath, 'utf8');
        const isValidJSON = (() => {
          try {
            JSON.parse(fileContent);
            return true;
          } catch (e) {
            return false;
          }
        })();
        console.log('File credenziali è JSON valido:', isValidJSON);
        console.log('Preview contenuto (primi 100 caratteri):', fileContent.substring(0, 100) + '...');
      }
    } catch (fsError) {
      console.error('Errore nell\'accesso al file delle credenziali:', fsError.message);
    }
    
    // Crea un client per Cloud Billing con le credenziali specifiche
    console.log('Creazione client Cloud Billing...');
    const billingClient = new CloudBillingClient({
      keyFilename: billingCredentialsPath
    });
    console.log('Client Cloud Billing creato con successo');
    
    // Tenta di ottenere informazioni sull'account di fatturazione con diverse varianti del formato
    // per vedere quale funziona
    let billingInfo = null;
    let successFormat = '';
    
    const formats = [
      `billingAccounts/${billingAccountId}`,
      billingAccountId,
      `projects/${projectId}/billingInfo`
    ];
    
    console.log('Tentativo con diversi formati dell\'ID account di fatturazione...');
    
    // Prova ciascun formato
    for (const format of formats) {
      try {
        console.log(`Prova formato: ${format}`);
        const [info] = await billingClient.getBillingAccount({
          name: format
        });
        
        billingInfo = info;
        successFormat = format;
        console.log(`Successo con formato: ${format}`);
        console.log('Info ricevute:', JSON.stringify(info, null, 2));
        break;
      } catch (formatError) {
        console.error(`Errore con formato ${format}:`, formatError.message);
      }
    }
    
    // Se nessun formato ha funzionato, prova a usare getProjectBillingInfo invece
    if (!billingInfo) {
      try {
        console.log('Tentativo con getProjectBillingInfo...');
        const [projectBillingInfo] = await billingClient.getProjectBillingInfo({
          name: `projects/${projectId}`
        });
        
        console.log('getProjectBillingInfo ha funzionato:', JSON.stringify(projectBillingInfo, null, 2));
        
        // Prova a recuperare il billing account usando l'ID ottenuto dal projectBillingInfo
        if (projectBillingInfo && projectBillingInfo.billingAccountName) {
          try {
            const [info] = await billingClient.getBillingAccount({
              name: projectBillingInfo.billingAccountName
            });
            
            billingInfo = info;
            successFormat = projectBillingInfo.billingAccountName;
            console.log(`Successo con formato: ${projectBillingInfo.billingAccountName}`);
          } catch (secondaryError) {
            console.error('Errore getBillingAccount con ID da projectBillingInfo:', secondaryError.message);
          }
        }
      } catch (projectError) {
        console.error('Errore getProjectBillingInfo:', projectError.message);
      }
    }
    
    // Prepara i dati di risposta
    if (billingInfo) {
      console.log('Generazione risposta con dati dell\'account recuperati');
      
      // Prova a leggere i crediti dall'account, se disponibili
      let remainingCredits = null;
      let remainingDays = null;
      
      if (billingInfo.trialInfo) {
        console.log('Informazioni di prova trovate:', billingInfo.trialInfo);
        if (billingInfo.trialInfo.creditsRemaining) {
          remainingCredits = parseFloat(billingInfo.trialInfo.creditsRemaining);
        }
        
        if (billingInfo.trialInfo.endTime) {
          const endTime = new Date(billingInfo.trialInfo.endTime);
          const now = new Date();
          const diffTime = Math.abs(endTime - now);
          remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }
      }
      
      // Nota: questi dati dovrebbero essere richiesti all'API reale di Google Cloud Billing
      // Al momento non possiamo utilizzare valori hardcoded
      const serviceBreakdown = [];
      
      // Calcoli basati sui dati reali
      const totalCost = null;
      const totalCredits = null;
      const netCost = null;
      
      const responseData = {
        totalCost,
        totalCredits,
        netCost,
        remainingCredits,
        remainingDays,
        serviceBreakdown,
        projectId,
        billingAccountId: billingInfo.name.replace('billingAccounts/', ''),
        debug: {
          successFormat,
          billingInfoName: billingInfo.name,
          displayName: billingInfo.displayName
        }
      };
      
      console.log('Risposta preparata con successo');
      console.log('=== FINE DIAGNOSTICA (SUCCESSO) ===');
      
      res.json(responseData);
    } else {
      throw new Error('Impossibile recuperare le informazioni dell\'account di fatturazione con nessun formato');
    }
    
  } catch (error) {
    console.error('=== ERRORE FATALE ===');
    console.error('Messaggio:', error.message);
    console.error('Stack:', error.stack);
    
    const errorResponse = { 
      error: 'Errore nel recupero dei dati di fatturazione',
      details: error.message,
      stack: error.stack,
      suggestions: [
        "Verifica che l'ID dell'account di fatturazione sia corretto",
        "Controlla che le credenziali abbiano i ruoli 'Billing Account Viewer' e 'Billing Account Administrator'",
        "Assicurati che l'API Cloud Billing sia abilitata nel progetto",
        "Verifica che il file delle credenziali sia accessibile e contenga dati validi"
      ]
    };
    
    console.log('Risposta di errore:', JSON.stringify(errorResponse, null, 2));
    console.log('=== FINE DIAGNOSTICA (ERRORE) ===');
    
    res.status(500).json(errorResponse);
  }
}; 