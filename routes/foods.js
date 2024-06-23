const express = require('express');
const pool = require('../db');
const router = express.Router();

router.get('/', async(req, res) => {
    try {
        const foods = await getFoods();
        res.json(foods);
    } catch(error) {
        console.error('Error fetching foods:', error);
        res.status(500).json({ error: 'Internal server error' })
    }
})

async function getFoods() {
    const queryText = 'SELECT * FROM foods ORDER BY id DESC';
    const { rows } = await pool.query(queryText);
    return rows;
}

module.exports = router;