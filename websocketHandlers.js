// websockethandlers.js
const pool = require('./db');

async function getSalesFromDatabase() {
  const queryText = 'SELECT * FROM sales ORDER BY id DESC';
  const { rows } = await pool.query(queryText);
  console.log('Fetched sales from database:', rows);
  return rows;
}

async function getSumOfTotalSales() {
  const queryText = 'SELECT SUM(total) AS total_sum FROM sales';
  const { rows } = await pool.query(queryText);
  console.log('Total sum of sales:', rows);
  return rows[0].total_sum; // Extract the total sum from the first row
}

async function getSumOfTotalSalesToday() {
  const queryText = 'SELECT SUM(total) AS total_sum_today FROM sales WHERE DATE(datetime) = DATE(NOW())';
  const { rows } = await pool.query(queryText);
  console.log('Total sum of sales today:', rows);
  return rows[0].total_sum_today; // Extract the total sum from the first row
}

async function sendSalesToClient(client) {
  try {
    const sales = await getSalesFromDatabase();
    const totalSum = await getSumOfTotalSales();
    const totalSumToday = await getSumOfTotalSalesToday();
    
    // Send both sales data and total sum to the client
    client.send(JSON.stringify({ action: 'initialize', sales, total_sum: totalSum, total_sum_today: totalSumToday }));
    
    console.log('Sending initial sales to client:', sales);
    console.log('Sending total sum to client:', totalSum);
    console.log('Sending total sum today to client:', totalSumToday);
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
    console.log('Sending initial foods to client:', foods);
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
    console.log('Sending initial inventory to client:', inventory);
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
    console.log('Sending initial expenses to client:', expenses);
  });
}

module.exports = {
  sendSalesToClient,
  sendInventoryToClient,
  sendExpensesToClient,
  sendFoodsToClient
};
