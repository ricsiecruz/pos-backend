// websockethandlers.js
const pool = require('./db');

async function getSalesFromDatabase() {
  const queryText = `
  SELECT *
  FROM sales
  ORDER BY 
    CASE WHEN credit::float > 0 THEN 0 ELSE 1 END, 
    id DESC;`;
  const { rows } = await pool.query(queryText);
  // console.log('Fetched sales from database:', rows);
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
    // Set timezone for the session to 'Asia/Manila'
    await pool.query(setTimezoneQuery);

    // Query to get today's sales using local timezone
    const { rows } = await pool.query(selectSalesQuery);
    // console.log('Fetched sales for today:', rows);
    return rows;
  } catch (err) {
    console.error('Error executing query', err.stack);
  }
}

async function getSumOfTotalSales() {
  const queryText = 'SELECT SUM(total) AS total_sum FROM sales';
  const { rows } = await pool.query(queryText);
  // console.log('Total sum of sales:', rows);
  return rows[0].total_sum;
}

async function getSumOfTotalSalesToday() {
  const queryText = `
    SELECT COALESCE(SUM(total), 0) AS total_sum_today
    FROM sales
    WHERE DATE(datetime) = CURRENT_DATE;
  `;
  const { rows } = await pool.query(queryText);
  // console.log('Total sum of sales today:', rows);
  return rows[0].total_sum_today;
}

async function getSumOfFoodAndDrinksToday() {
  const query = `
    SELECT COALESCE(SUM(subtotal), 0) AS total_food_and_drinks_today
    FROM sales
    WHERE DATE(datetime) = CURRENT_DATE;
  `;
  const { rows } = await pool.query(queryText);
  return rows[0].total_food_and_drinks_today;
}

async function sendSalesToClient(client) {
  try {
    const salesCurrentDate = await getSalesForCurrentDate();
    const sales = await getSalesFromDatabase();
    const totalSum = await getSumOfTotalSales();
    const totalSumToday = await getSumOfTotalSalesToday();
    const totalFoodsAndDrinksToday = await getSumOfFoodAndDrinksToday();
    
    client.send(JSON.stringify({ 
      action: 'initialize',
      salesCurrentDate,
      sales,
      total_sum: totalSum,
      total_sum_today: totalSumToday,
      total_food_and_drinks_today: totalFoodsAndDrinksToday
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
    // console.log('Sending initial foods to client:', foods);
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
    // console.log('Sending initial inventory to client:', inventory);
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
    // console.log('Sending initial expenses to client:', expenses);
  });
}

module.exports = {
  sendSalesToClient,
  sendInventoryToClient,
  sendExpensesToClient,
  sendFoodsToClient
};
