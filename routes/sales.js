// routes/sales.js

const express = require('express');
const pool = require('../db');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [sales, totalSum, totalSumToday] = await Promise.all([
      getSalesForCurrentDate(),
      getSalesFromDatabase(),
      getSumOfTotalSales(),
      getSumOfTotalSalesToday()
    ]);

    const responseData = {
      sales: sales,
      total_sum: totalSum,
      total_sum_today: totalSumToday
    };

    res.json(responseData);
  } catch (error) {
    console.error('Error fetching sales and total sum from database:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// async function getSalesForCurrentDate() {
//   const queryText = `
//     SELECT *
//     FROM sales
//     WHERE DATE(datetime) = CURRENT_DATE ORDER BY id DESC;
//   `
//   const { rows } = await pool.query(queryText);
//   console.log('Fetched sales for today aaa:', rows);
//   return rows;
// }

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
    console.log('Fetched sales for today:', rows);
    return rows;
  } catch (err) {
    console.error('Error executing query', err.stack);
  }
}

async function getSalesFromDatabase() {
  const queryText = 'SELECT * FROM sales ORDER BY id DESC';
  const { rows } = await pool.query(queryText);
  return rows;
}

async function getSumOfTotalSales() {
  const queryText = 'SELECT SUM(total) AS total_sum FROM sales';
  const { rows } = await pool.query(queryText);
  return rows[0].total_sum;
}

async function getSumOfTotalSalesToday() {
  const queryText = `
    SELECT SUM(total) AS total_sum_today
    FROM sales 
    WHERE DATE_TRUNC('day', datetime) = DATE_TRUNC('day', NOW());
  `;
  const { rows } = await pool.query(queryText);
  return rows[0].total_sum_today;
}

router.get('/today', async (req, res) => {
  try {
    const today = await getSalesForCurrentDate();
    res.json({ today: today });
  } catch(error) {
    console.error('Error fetching sales for current day:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
})

router.get('/total-sum', async (req, res) => {
  try {
    const totalSum = await getSumOfTotalSales();
    res.json({ total_sum: totalSum });
  } catch (error) {
    console.error('Error fetching total sum of sales:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/total-sum-today', async (req, res) => {
  try {
    const totalSumToday = await getSumOfTotalSalesToday();
    res.json({ total_sum_today: totalSumToday });
  } catch (error) {
    console.error('Error fetching total sum of sales:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
