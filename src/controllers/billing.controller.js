const { CloudBillingClient } = require('@google-cloud/billing');
const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');

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
    
    // console.log('Richiesta dati di fatturazione per il progetto:', projectId);
    // console.log('Account di fatturazione:', billingAccountId);
    
    // Crea un client per Cloud Billing con le credenziali specifiche
    const billingClient = new CloudBillingClient({
      keyFilename: billingCredentialsPath
    });
    
    // console.log('Client Cloud Billing creato con credenziali da:', billingCredentialsPath);
    
    // Ottieni informazioni sull'account di fatturazione
    const billingName = `billingAccounts/${billingAccountId}`;
    // console.log('Recupero informazioni per:', billingName);
    
    let billingInfo;
    try {
      [billingInfo] = await billingClient.getBillingAccount({
        name: billingName
      });
    //   console.log('Informazioni fatturazione recuperate:', billingInfo.name);
    } catch (err) {
    //   console.error('Errore nel recupero delle informazioni di fatturazione:', err);
      return res.status(500).json({
        error: 'Errore nel recupero delle informazioni di fatturazione',
        details: err.message
      });
    }
    
    // Calcola le informazioni di utilizzo basate sui dati disponibili
    const remainingCredits = 286.00; // In un'implementazione completa, questo valore dovrebbe essere ottenuto dall'API
    const remainingDays = 86; // In un'implementazione completa, questo valore dovrebbe essere ottenuto dall'API
    
    // Simula i dati di utilizzo per servizio (in una versione completa, questi dati verrebbero da BigQuery)
    const serviceBreakdown = [
      {
        service: 'Cloud Speech-to-Text',
        cost: 0.012,
        credits: -0.012,
        percentage: 60
      },
      {
        service: 'Vertex AI (Gemini)',
        cost: 0.006,
        credits: -0.006,
        percentage: 30
      },
      {
        service: 'Cloud Storage',
        cost: 0.002,
        credits: -0.002,
        percentage: 10
      }
    ];
    
    // Calcola i totali
    const totalCost = serviceBreakdown.reduce((sum, row) => sum + row.cost, 0);
    const totalCredits = serviceBreakdown.reduce((sum, row) => sum + row.credits, 0);
    const netCost = totalCost + totalCredits; // I crediti sono negativi
    
    // Restituisci i dati al frontend
    res.json({
      totalCost,
      totalCredits,
      netCost,
      remainingCredits,
      remainingDays,
      serviceBreakdown,
      projectId,
      billingAccountId: billingInfo.name.replace('billingAccounts/', '')
    });
    
  } catch (error) {
    // console.error('Errore nel recupero dei dati di fatturazione:', error);
    res.status(500).json({ 
      error: 'Errore nel recupero dei dati di fatturazione',
      details: error.message
    });
  }
}; 