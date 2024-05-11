const express = require('express');
const pool = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const inventory = await getInventoryFromDatabase();
    res.json(inventory);
  } catch (error) {
    console.error('Error fetching inventory from database:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function getInventoryFromDatabase() {
  const queryText = 'SELECT * FROM inventory ORDER BY id DESC';
  const { rows } = await pool.query(queryText);
  return rows;
}

module.exports = router;
