// In your Express server file (e.g., server.js or routes/sales.js)
const express = require('express');
const pool = require('../db'); // Import your database pool

const router = express.Router();

// Define the endpoint for fetching sales data
router.get('/', async (req, res) => {
  try {
    const sales = await getSalesFromDatabase();
    res.json(sales);
  } catch (error) {
    console.error('Error fetching sales from database:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Function to fetch sales data from the database
async function getSalesFromDatabase() {
  const queryText = 'SELECT * FROM sales ORDER BY id DESC';
  const { rows } = await pool.query(queryText);
  return rows;
}

module.exports = router;
