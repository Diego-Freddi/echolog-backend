require('dotenv').config();
const { BigQuery } = require('@google-cloud/bigquery');

const bigquery = new BigQuery({
  keyFilename: process.env.GOOGLE_BILLING_CREDENTIALS,
});

const CREDIT_INITIAL = 286.00;
const END_DATE = new Date('2025-06-28');

exports.getProjectCosts = async (req, res) => {
  try {
    // Verifica autenticazione
    if (!req.user) {
      return res.status(401).json({ error: 'Non autorizzato' });
    }

    // Query per aggregare costi e crediti per servizio
    const query = `
      SELECT
        service.description,
        SUM(cost) AS cost_total,
        SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS credits_used
      FROM \`${process.env.GOOGLE_PROJECT_ID}.echolog_billing_export.gcp_billing_export_resource_v1_${process.env.GOOGLE_CLOUD_BILLING_ACCOUNT_ID.replace(/-/g, '_')}\`
      WHERE usage_start_time IS NOT NULL
      GROUP BY service.description
    `;
    // console.log('🟢 QUERY DEFINITIVA ESEGUITA:\n', query);

    const [job] = await bigquery.createQueryJob({ query });
    const [rows] = await job.getQueryResults();

    let cost_total = 0;
    let credits_used = 0;

    const serviceBreakdown = rows.map(row => {
      const serviceCost = parseFloat(row.cost_total) || 0;
      const serviceCredits = parseFloat(row.credits_used) || 0;
      cost_total += serviceCost;
      credits_used += serviceCredits;

      return {
        service: row.service || 'Servizio sconosciuto',
        cost: Number(serviceCost.toFixed(2)),
        credits: Number(serviceCredits.toFixed(2)),
        netCost: Number((serviceCost - serviceCredits).toFixed(2)),
      };
    });

    // Aggiungiamo le percentuali dopo aver calcolato il costo totale
    if (cost_total > 0) {
      serviceBreakdown.forEach(service => {
        service.percentage = Math.round((service.cost / cost_total) * 100) || 0;
      });
    }

    const net_cost = cost_total - credits_used;
    const today = new Date();
    const days_remaining = Math.max(0, Math.floor((END_DATE - today) / (1000 * 60 * 60 * 24)));
    const credit_remaining = Math.max(0, CREDIT_INITIAL - cost_total);

    res.json({
      projectId: process.env.GOOGLE_PROJECT_ID,
      billingAccountId: process.env.GOOGLE_CLOUD_BILLING_ACCOUNT_ID,
      totalCost: Number(cost_total.toFixed(2)),
      totalCredits: Number(Math.abs(credits_used).toFixed(2)), // I crediti sono spesso negativi, prendiamo il valore assoluto
      netCost: Number(net_cost.toFixed(2)),
      remainingDays: days_remaining,
      remainingCredits: Number(credit_remaining.toFixed(2)),
      serviceBreakdown,
    });
  } catch (error) {
    console.error("❌ Errore nel recupero dei dati di fatturazione:", error);
    
    // Dettagli maggiori dell'errore per il debugging
    const errorResponse = { 
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
    
    res.status(500).json(errorResponse);
  }
}; 