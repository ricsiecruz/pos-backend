const express = require('express');
const pool = require('../db');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const [mostOrdered] = await Promise.all([
            getMostOrdered()
        ]);

        const responseData = {
            mostOrdered: mostOrdered
        };

        res.json(responseData)
    } catch(error) {
        console.error('Error fetching dashboard from database:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
})

async function getMostOrdered() {
    const queryText = `
        WITH expanded_orders AS (
            SELECT 
            jsonb_array_elements(orders::jsonb) AS order_detail
            FROM sales
        )
        SELECT 
            order_detail ->> 'product' AS product,
            SUM((order_detail ->> 'quantity')::integer) AS total_quantity
        FROM expanded_orders
        GROUP BY order_detail ->> 'product'
        ORDER BY total_quantity DESC;
    `;
    const { rows } = await pool.query(queryText);
    return rows;
}

router.get('/most-ordered', async (req, res) => {
    try {
        const mostOrdered = await getMostOrdered();
        res.json({ most_ordered: mostOrdered });
    } catch (error) {
        console.error('Error fetching most ordered:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
})

module.exports = router;