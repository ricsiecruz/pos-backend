const express = require('express');
const pool = require('../db');
const router = express.Router();

router.get('/', async(req, res) => {
    try {
        const beverage = await getBeverage();
        res.json(beverage);
    } catch(error) {
        console.error('Error fetching beverage:', error);
        res.status(500).json({ error: 'Internal server error' })
    }
})

async function getBeverage() {
    const queryText = 'SELECT * FROM beverage';
    const { rows } = await pool.query(queryText);
    return rows;
}

module.exports = router;
