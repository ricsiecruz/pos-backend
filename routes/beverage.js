const express = require('express');
const pool = require('../db');
const router = express.Router();

// GET all beverages
router.get('/', async (req, res) => {
    try {
        const beverage = await getBeverage();
        res.json(beverage);
    } catch (error) {
        console.error('Error fetching beverage:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST new beverage
router.post('/', async (req, res) => {
    const { product, price, available, stocks } = req.body;

    if (!product || price === undefined) {
        return res.status(400).json({ error: 'Product and price are required' });
    }

    try {
        const queryText = `
            INSERT INTO beverage (product, price, available, stocks)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        const values = [product, price, available, stocks ?? true];
        const { rows } = await pool.query(queryText, values);

        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('Error adding beverage:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Helper to get all beverages
async function getBeverage() {
    const queryText = 'SELECT * FROM beverage';
    const { rows } = await pool.query(queryText);
    return rows;
}

module.exports = router;
