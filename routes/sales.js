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
      getSumOfTotalSalesToday(),
      getSumOfFoodAndDrinksToday
    ]);

    const responseData = {
      sales: sales,
      total_sum: totalSum,
      total_sum_today: totalSumToday,
      total_sum_of_foods_and_drinks_today: totalSumOfFoodsAndDrinksToday
    };

    res.json(responseData);
  } catch (error) {
    console.error('Error fetching sales and total sum from database:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function getSalesForCurrentDate() {
  const setTimezoneQuery = "SET TIME ZONE 'Asia/Manila';";
  const selectSalesQuery = `
    SELECT *
    FROM sales
    WHERE DATE(datetime AT TIME ZONE 'Asia/Manila') = CURRENT_DATE
    ORDER BY id DESC;
  `;

    await pool.query(setTimezoneQuery);
    const { rows } = await pool.query(selectSalesQuery);
    return rows;
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
    SELECT COALESCE(SUM(total), 0) AS total_sum_today
    FROM sales
    WHERE DATE(datetime) = CURRENT_DATE;
  `;
  const { rows } = await pool.query(queryText);
  console.log('Query result:', rows);
  return rows[0].total_sum_today;
}

async function getSumOfFoodAndDrinksToday() {
  const queryText = `
    SELECT COALESCE(SUM(subtotal), 0) AS total_food_and_drinks_today
    FROM sales
    WHERE DATE(datetime) = CURRENT_DATE;
  `;
  const { rows } = await pool.query(queryText);
  return rows[0].total_food_and_drinks_today;
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

router.get('/total-sum-of-foods-and-drinks-today', async(req, res) => {
  try {
    const totalSumOfFoodsAndDrinksToday = await getSumOfFoodAndDrinksToday();
    res.json({ total_sum_of_foods_and_drinks_today: totalSumOfFoodsAndDrinksToday });
  } catch(error) {
    console.error('Error fetching total sum of foods and drinks for current date:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
})

module.exports = router;
