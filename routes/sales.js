// routes/sales.js

const express = require('express');
const pool = require('../db');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [sales, totalSum, totalSumToday] = await Promise.all([
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
