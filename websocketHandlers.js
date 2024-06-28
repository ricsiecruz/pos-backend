// websockethandlers.js
const pool = require('./db');

async function getSumOfExpensesForCurrentDate() {
  const setTimezoneQuery = "SET TIME ZONE 'Asia/Manila';";
  const queryText = `
    SELECT COALESCE(SUM(amount::numeric), 0) AS total_expenses
    FROM expenses
    WHERE DATE(date AT TIME ZONE 'Asia/Manila') = CURRENT_DATE;
  `;

  await pool.query(setTimezoneQuery);
  const { rows } = await pool.query(queryText);
  return rows[0].total_expenses;
}

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
    const expensesCurrentDate = await getSumOfExpensesForCurrentDate();
    
    client.send(JSON.stringify({ 
      action: 'initialize',
      salesCurrentDate,
      sales,
      total_sum: totalSum,
      total_sum_today: totalSumToday,
      expenses_current_date: expensesCurrentDate
    }));
  } catch (error) {
    console.error('Error sending sales to client:', error);
  }
}

async function sendMembersToClient(ws) {
  try {
    const membersQuery = `
      SELECT 
        id, 
        name, 
        total_load, 
        coffee, 
        total_spent, 
        last_spent 
      FROM 
        members 
      ORDER BY 
        total_spent DESC
    `;
    const { rows: members } = await pool.query(membersQuery);
    
    const formatter = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    members.forEach(member => {
        member.total_load = formatter.format(member.total_load);
        member.coffee = formatter.format(member.coffee);
        member.total_spent = formatter.format(member.total_spent);
        member.last_spent = moment(member.last_spent).tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss');
    });

    ws.send(JSON.stringify({ action: 'updateMembers', members }));
  } catch (error) {
    console.error('Error sending members data to client:', error);
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
  sendFoodsToClient,
  sendMembersToClient
};
