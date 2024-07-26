// websockethandlers.js
const pool = require('./db');

async function getSumOfExpensesForCurrentDate() {
  const setTimezoneQuery = "SET TIME ZONE 'Asia/Manila';";
  const queryText = `
    SELECT COALESCE(SUM(amount::numeric), 0) AS total_expenses
    FROM expenses
    WHERE DATE(date AT TIME ZONE 'Asia/Manila') = CURRENT_DATE;
  `;

  try {
    await pool.query(setTimezoneQuery);
    const { rows } = await pool.query(queryText);
    return rows[0].total_expenses;
  } catch (error) {
    console.error('Error executing getSumOfExpensesForCurrentDate query:', error);
    throw error;
  }
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

async function sendAccessToClient(client) {
  try {

    const normalizeIp = (ip) => {
      if (ip === '::1') {
          return '127.0.0.1'; // Normalize IPv6 loopback address to IPv4
      }
      if (ip.includes('::ffff:')) {
          return ip.split('::ffff:')[1];
      }
      return ip;
    };

    const clientIp = normalizeIp(req.ip); // Normalize the IP address
    const imei = req.headers['x-imei']; // Assume IMEI is sent in a custom header

    console.log('Client IP:', clientIp);
    console.log('Client IMEI:', imei);

    const queryText = 'SELECT * FROM whitelist WHERE (ip = $1 OR imei = $2) AND enabled = true';
    const { rows } = await pool.query(queryText, [clientIp, imei]);
    console.log('Whitelist query result:', rows);

    if (rows.length > 0) {
        console.log('You have access');
        res.json({ message: 'success', ip: {clientIp: clientIp, imei: imei, text: 'test'} }); // IP or IMEI is whitelisted and enabled
    } else {
        console.log('You shall not pass');
        res.status(403).json({ error: 'Access denied 111' }); // IP or IMEI is not whitelisted or not enabled
    }
  } catch (error) {
      console.error('Error checking whitelist:', error);
      res.status(500).json({ error: 'Internal server error' });
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
    if (error) {
      console.error('Error fetching inventory from database:', error);
      return;
    }
    const inventory = results.rows;
    const lowStockCount = inventory.filter(item => item.stocks < 50).length;

    const response = {
      data: inventory,
      low: lowStockCount
    };

    client.send(JSON.stringify(response));
  });
}

async function sendExpensesToClient(client) {
  try {
      const [expensesData, totalCreditAmount] = await Promise.all([
          getExpensesData(),
          getSumOfCredit()
      ]);

      const responseData = {
          action: 'initialize',
          expenses: expensesData,
          total_credit_amount: totalCreditAmount
      };

      client.send(JSON.stringify(responseData));
  } catch (error) {
      console.error('Error fetching expenses data:', error);
      client.send(JSON.stringify({ action: 'error', message: 'Error fetching expenses data' }));
  }
}

async function getSumOfCredit() {
  const queryText = `
    SELECT 
      SUM(amount::numeric) AS total_credit_amount,
      COUNT(*) AS credit_count
    FROM 
      expenses
    WHERE 
      credit = true;
  `;
  const { rows } = await pool.query(queryText);
  return {
    totalCreditAmount: rows[0].total_credit_amount,
    creditCount: rows[0].credit_count
  };
}

// Function to get expenses data
async function getExpensesData() {
  const queryText = 'SELECT * FROM expenses ORDER BY id DESC';
  const { rows } = await pool.query(queryText);
  // console.log('expenses', rows)
  return rows;
}

module.exports = {
  sendAccessToClient,
  sendSalesToClient,
  sendInventoryToClient,
  sendExpensesToClient,
  sendFoodsToClient,
  sendMembersToClient
};
