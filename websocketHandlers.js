// websockethandlers.js
const pool = require('./db');
const { getSalesForCurrentDate, getSalesFromDatabase, getSumOfTotalSales, getSumOfTotalSalesToday } = require('./routes/sales');

async function getSalesFromDatabase() {
  const queryText = `
  SELECT *
  FROM sales
  ORDER BY 
    CASE WHEN credit::float > 0 THEN 0 ELSE 1 END, 
    id DESC;`;
  const { rows } = await pool.query(queryText);
  return rows;
}

async function getSalesForCurrentDate() {
  const setTimezoneQuery = "SET TIME ZONE 'Asia/Manila';";
  const selectSalesQuery = `
    SELECT *
    FROM sales
    WHERE DATE(datetime AT TIME ZONE 'Asia/Manila') = CURRENT_DATE
    ORDER BY id DESC;
  `;

  try {
    await pool.query(setTimezoneQuery);

    const { rows } = await pool.query(selectSalesQuery);
    return rows;
  } catch (err) {
    console.error('Error executing query', err.stack);
  }
}

async function getSumOfTotalSales() {
  const queryText = 'SELECT SUM(total) AS total_sum FROM sales';
  const { rows } = await pool.query(queryText);
  return rows[0].total_sum;
}

async function getSumOfTotalSalesToday() {
  const queryText = `
    SELECT COALESCE(SUM(total), 0) AS total_sum_today
    FROM sales
    WHERE DATE(datetime) = CURRENT_DATE;
  `;
  const { rows } = await pool.query(queryText);
  return rows[0].total_sum_today;
}

async function sendSalesToClient(client) {
  try {
    const salesCurrentDate = await getSalesForCurrentDate();
    const sales = await getSalesFromDatabase();
    const totalSum = await getSumOfTotalSales();
    const totalSumToday = await getSumOfTotalSalesToday();
    
    client.send(JSON.stringify({ 
      action: 'initialize',
      salesCurrentDate,
      sales,
      total_sum: totalSum,
      total_sum_today: totalSumToday
    }));
  } catch (error) {
    console.error('Error sending sales to client:', error);
  }
}

function sendFoodsToClient(client) {
  pool.query('SELECT * FROM foods ORDER BY id DESC', (error, results) => {
    if(error) {
      console.error('Error fetching foods from database:', error);
      return;
    }
    const foods = results.rows;
    client.send(JSON.stringify({ action: 'initialize', foods }));
  });
}

function sendInventoryToClient(client) {
  pool.query('SELECT * FROM inventory ORDER BY id DESC', (error, results) => {
    if(error) {
      console.error('Error fetching inventory from database:', error);
      return;
    }
    const inventory = results.rows;
    client.send(JSON.stringify({ action: 'initialize', inventory }));
  });
}

function sendExpensesToClient(client) {
  pool.query('SELECT * FROM expenses ORDER BY id DESC', (error, results) => {
    if(error) {
      console.error('Error fetching expenses from database:', error);
      return;
    }
    const expenses = results.rows;
    client.send(JSON.stringify({ action: 'initialize', expenses }));
  });
}

module.exports = {
  sendSalesToClient,
  sendInventoryToClient,
  sendExpensesToClient,
  sendFoodsToClient
};
