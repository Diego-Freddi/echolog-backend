require('dotenv').config();
const { BigQuery } = require('@google-cloud/bigquery');

// Configurazione BigQuery
const bigquery = new BigQuery({
  keyFilename: process.env.GOOGLE_BILLING_CREDENTIALS,
});

// Costanti
const CREDIT_INITIAL = 286.10;
const END_DATE = new Date('2025-06-28');

// Query SQL
const TOTAL_COST_QUERY = `
  SELECT
    SUM(cost) AS total_cost_all_time,
    SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS total_credits_all_time
  FROM \`{projectId}.echolog_billing_export.gcp_billing_export_resource_v1_{billingAccountId}\`
`;

const MONTHLY_COST_QUERY = `
  SELECT
    service.description AS service_description,
    sku.description AS sku_description,
    SUM(cost) AS cost_total,
    SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS credits_used
  FROM \`{projectId}.echolog_billing_export.gcp_billing_export_resource_v1_{billingAccountId}\`
  WHERE usage_start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
  GROUP BY service.description, sku.description
  ORDER BY cost_total DESC
`;

// Mappatura dei servizi Google Cloud comuni
const serviceMapping = {
  'Compute Engine': 'Compute Engine',
  'Cloud Storage': 'Cloud Storage',
  'BigQuery': 'BigQuery',
  'Vertex AI': 'Vertex AI API',
  'Cloud Speech-to-Text': 'Speech-to-Text',
  'Cloud Natural Language': 'Natural Language API',
  'Cloud Translation': 'Cloud Translation API',
  'App Engine': 'App Engine',
  'Cloud Run': 'Cloud Run',
  'Cloud Functions': 'Cloud Functions',
  'Cloud Logging': 'Cloud Logging',
  'Cloud Monitoring': 'Cloud Monitoring',
  'Virtual Private Cloud': 'Virtual Private Cloud',
  'Cloud SQL': 'Cloud SQL',
  'Cloud Firestore': 'Firestore',
  'Cloud Pub/Sub': 'Pub/Sub',
  'Secret Manager': 'Secret Manager',
  'Cloud Vision': 'Vision API'
};

/**
 * Formatta un numero come valuta con precisione specifica
 * @param {number} value - Valore da formattare
 * @param {number} [precision=2] - Precisione decimale
 * @returns {number} Valore formattato
 */
const formatCurrency = (value, precision = 2) => {
  const numValue = parseFloat(value) || 0;
  return Number(numValue.toFixed(precision));
};

/**
 * Ottiene un nome di servizio migliore basato sulle descrizioni
 * @param {string} serviceDescription - Descrizione del servizio
 * @param {string} skuDescription - Descrizione dello SKU
 * @returns {string} Nome servizio formattato
 */
const getServiceName = (serviceDescription, skuDescription) => {
  if (!serviceDescription && !skuDescription) {
    return 'Servizio sconosciuto';
  }
  
  // Prova a trovare il servizio nella mappatura
  for (const [key, value] of Object.entries(serviceMapping)) {
    if (
      (serviceDescription && serviceDescription.includes(key)) ||
      (skuDescription && skuDescription.includes(key))
    ) {
      return value;
    }
  }
  
  // Se non troviamo nella mappatura, usiamo la descrizione disponibile
  return serviceDescription || skuDescription;
};

/**
 * Elabora i dati dei servizi e calcola i totali
 * @param {Array} rows - Righe risultato dalla query
 * @returns {Object} Dati elaborati e totali
 */
const processServiceData = (rows) => {
  let costTotal = 0;
  let creditsUsed = 0;
  
  const serviceData = rows.map(row => {
    const serviceCost = parseFloat(row.cost_total) || 0;
    const serviceCredits = parseFloat(row.credits_used) || 0;
    
    costTotal += serviceCost;
    creditsUsed += serviceCredits;
    
    return {
      service: getServiceName(row.service_description, row.sku_description),
      cost: formatCurrency(serviceCost),
      credits: formatCurrency(serviceCredits),
      netCost: formatCurrency(serviceCost + serviceCredits),
    };
  });
  
  return { 
    serviceData, 
    totals: { 
      costTotal: formatCurrency(costTotal), 
      creditsUsed: formatCurrency(creditsUsed),
      netCost: formatCurrency(costTotal + creditsUsed)
    }
  };
};

/**
 * Combina servizi con lo stesso nome
 * @param {Array} services - Array di servizi
 * @returns {Array} Servizi combinati
 */
const combineServices = (services) => {
  const combined = {};
  
  services.forEach(item => {
    if (combined[item.service]) {
      combined[item.service].cost += item.cost;
      combined[item.service].credits += item.credits;
      combined[item.service].netCost += item.netCost;
    } else {
      combined[item.service] = { ...item };
    }
  });
  
  return Object.values(combined);
};

/**
 * Calcola percentuali per i servizi in modo semplice
 * @param {Array} services - Array di servizi
 * @param {number} totalCost - Costo totale
 * @returns {Array} Servizi con percentuali
 */
const calculatePercentages = (services, totalCost) => {
  if (!totalCost || totalCost <= 0 || services.length === 0) return services;
  
  // Copia i servizi
  const result = [...services];
  
  // Se c'è un solo servizio, la percentuale è 100%
  if (result.length === 1) {
    result[0].percentage = 100;
    return result;
  }
  
  // Calcola le percentuali in modo semplice
  let sumPercentages = 0;
  
  result.forEach(service => {
    // Calcolo semplice della percentuale
    let percentage = Math.floor((service.cost / totalCost) * 100);
    
    // Assicurati che ogni servizio abbia almeno 1% se ha un costo
    if (service.cost > 0 && percentage === 0) {
      percentage = 1;
    }
    
    service.percentage = percentage;
    sumPercentages += percentage;
  });
  
  // Gestisci il caso in cui la somma non è 100%
  if (sumPercentages !== 100) {
    // Se la somma è maggiore di 100, riduci le percentuali più grandi
    if (sumPercentages > 100) {
      // Ordina per percentuale decrescente
      result.sort((a, b) => b.percentage - a.percentage);
      
      // Riduci percentuali partendo dai servizi con percentuale più alta
      let excess = sumPercentages - 100;
      let i = 0;
      
      while (excess > 0 && i < result.length) {
        if (result[i].percentage > 1) {
          result[i].percentage -= 1;
          excess -= 1;
        }
        i = (i + 1) % result.length; // Riparti dall'inizio se necessario
      }
    } 
    // Se la somma è minore di 100, aumenta le percentuali più piccole
    else if (sumPercentages < 100) {
      // Ordina per percentuale crescente
      result.sort((a, b) => a.percentage - b.percentage);
      
      // Aumenta percentuali partendo dai servizi con percentuale più bassa
      let deficit = 100 - sumPercentages;
      let i = 0;
      
      while (deficit > 0 && i < result.length) {
        result[i].percentage += 1;
        deficit -= 1;
        i = (i + 1) % result.length; // Riparti dall'inizio se necessario
      }
    }
    
    // Ripristina l'ordinamento per costo
    result.sort((a, b) => b.cost - a.cost);
  }
  
  // Verifica finale
  let final = result.reduce((sum, service) => sum + service.percentage, 0);
  console.log(`Somma percentuali: ${final}%`); // Log di debug
  
  return result;
};

/**
 * Crea un oggetto di risposta per errori
 * @param {Error} error - Oggetto errore
 * @returns {Object} Risposta formattata dell'errore
 */
const createErrorResponse = (error) => {
  console.error("❌ Errore nel recupero dei dati di fatturazione:", error);
  
  return { 
    error: 'Errore nel recupero dei dati di fatturazione',
    details: error.message,
    stack: error.stack,
    suggestions: [
      "Verifica che l'ID del progetto e dell'account di fatturazione siano corretti",
      "Controlla che le credenziali abbiano i ruoli per accedere a BigQuery",
      "Verifica che il dataset e la tabella di billing export esistano",
      "Assicurati che il file delle credenziali sia accessibile"
    ]
  };
};

/**
 * Controller per ottenere i costi di progetto
 */
exports.getProjectCosts = async (req, res) => {
  try {
    // Verifica autenticazione
    if (!req.user) {
      return res.status(401).json({ error: 'Non autorizzato' });
    }
    
    // Preparazione parametri comuni
    const projectId = process.env.GOOGLE_PROJECT_ID;
    const billingAccountId = process.env.GOOGLE_CLOUD_BILLING_ACCOUNT_ID.replace(/-/g, '_');
    
    // Sostituisce i parametri nelle query
    const prepareQuery = (queryTemplate) => {
      return queryTemplate
        .replace('{projectId}', projectId)
        .replace('{billingAccountId}', billingAccountId);
    };

    // 1. Query per i costi totali dall'inizio
    const [totalCostJob] = await bigquery.createQueryJob({ 
      query: prepareQuery(TOTAL_COST_QUERY)
    });
    const [totalCostRows] = await totalCostJob.getQueryResults();
    
    const totalCostAllTime = parseFloat(totalCostRows[0].total_cost_all_time) || 0;
    const totalCreditsAllTime = parseFloat(totalCostRows[0].total_credits_all_time) || 0;
    
    // 2. Query per costi e crediti per servizio negli ultimi 30 giorni
    const [monthlyJob] = await bigquery.createQueryJob({ 
      query: prepareQuery(MONTHLY_COST_QUERY)
    });
    const [monthlyRows] = await monthlyJob.getQueryResults();

    // Elabora dati dei servizi e calcola totali
    const { serviceData, totals } = processServiceData(monthlyRows);
    
    // Combina servizi con lo stesso nome
    let combinedServices = combineServices(serviceData);
    
    // Calcola percentuali garantendo che somma sia 100%
    combinedServices = calculatePercentages(combinedServices, totalCostAllTime);
    
    // Calcola i valori finali
    const netCostAllTime = totalCostAllTime + totalCreditsAllTime;
    const today = new Date();
    const daysRemaining = Math.max(0, Math.floor((END_DATE - today) / (1000 * 60 * 60 * 24)));
    const creditRemaining = Math.max(0, CREDIT_INITIAL - totalCostAllTime);

    // Costruisci e invia la risposta
    res.json({
      projectId,
      billingAccountId: process.env.GOOGLE_CLOUD_BILLING_ACCOUNT_ID,
      totalCost: totals.costTotal,
      totalCredits: Math.abs(totals.creditsUsed),
      netCost: totals.netCost,
      totalCostAllTime: formatCurrency(totalCostAllTime),
      totalCreditsAllTime: formatCurrency(Math.abs(totalCreditsAllTime)),
      netCostAllTime: formatCurrency(netCostAllTime),
      remainingDays: daysRemaining,
      remainingCredits: formatCurrency(creditRemaining),
      serviceBreakdown: combinedServices,
    });
  } catch (error) {
    res.status(500).json(createErrorResponse(error));
  }
}; 