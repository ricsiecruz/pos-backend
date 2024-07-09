const express = require('express');
const pool = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const inventory = await getInventoryFromDatabase();
    const lowStockCount = inventory.filter(item => item.stocks < 50).length;

    // Prepare the response object
    const response = {
      data: inventory,
      low: lowStockCount
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function getInventoryFromDatabase() {
  const queryText = 'SELECT * FROM inventory ORDER BY id DESC';
  const { rows } = await pool.query(queryText);
  return rows;
}

module.exports = router;
