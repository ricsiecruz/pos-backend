// routes/sales.js

const express = require('express');
const pool = require('../db'); // Import your database pool

const router = express.Router();

// Define the endpoint for fetching all sales data with total sum
router.get('/', async (req, res) => {
  try {
    // Concurrently fetch sales data and total sum of 'total' column
    const [sales, totalSum] = await Promise.all([
      getSalesFromDatabase(),
      getSumOfTotalSales()
    ]);

    // Construct the response object
    const responseData = {
      sales: sales,
      total_sum: totalSum
    };

    console.log('sales', responseData)

    // Send JSON response
    res.json(responseData);
  } catch (error) {
    console.error('Error fetching sales and total sum from database:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Function to fetch sales data from the database
async function getSalesFromDatabase() {
  const queryText = 'SELECT * FROM sales ORDER BY id DESC';
  const { rows } = await pool.query(queryText);
  console.log('aaa', rows)
  return rows;
}

// Function to fetch total sum of 'total' column from 'sales' table
async function getSumOfTotalSales() {
  const queryText = 'SELECT SUM(total) AS total_sum FROM sales';
  const { rows } = await pool.query(queryText);
  console.log('bbb', rows)
  return rows[0].total_sum; // Extract the total sum from the first row
}

// Define the endpoint for fetching total sum of sales
router.get('/total-sum', async (req, res) => {
  try {
    const totalSum = await getSumOfTotalSales();
    res.json({ total_sum: totalSum });
  } catch (error) {
    console.error('Error fetching total sum of sales:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
