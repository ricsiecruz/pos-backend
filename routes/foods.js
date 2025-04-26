const express = require('express');
const pool = require('../db');
const router = express.Router();

// GET all foods
router.get('/', async (req, res) => {
  try {
    const foods = await getFoods();
    res.json(foods);
  } catch (error) {
    console.error('Error fetching foods:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST a new food
router.post('/', async (req, res) => {
  const { product, price, stocks } = req.body;
  
  try {
    const queryText = `
      INSERT INTO foods (product, price, stocks)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const { rows } = await pool.query(queryText, [product, price, stocks]);
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error adding food:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function getFoods() {
  const queryText = 'SELECT * FROM foods ORDER BY id DESC';
  const { rows } = await pool.query(queryText);
  return rows;
}

module.exports = router;
