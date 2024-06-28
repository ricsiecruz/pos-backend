const express = require('express');
const pool = require('../db');
const moment = require('moment-timezone');
const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const [mostOrdered, salesAndExpensesSummary, topSpenders, updatedMembers] = await Promise.all([
            getMostOrdered(),
            getSalesAndExpensesSummary(),
            getTopSpenders(),
            updateMemberData()
        ]);

        const responseData = {
            mostOrdered: mostOrdered,
            salesAndExpensesSummary: salesAndExpensesSummary,
            topSpenders: topSpenders,
            updatedMembers: updatedMembers
        };

        res.json(responseData);
    } catch (error) {
        console.error('Error fetching dashboard from database:', error);
        res.status(500).json({ error: 'Internal server error - dashboard' });
    }
});

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

async function getSalesAndExpensesSummary() {
    const queryText = `
        WITH sales_summary AS (
            SELECT 
                DATE(datetime) AS date,
                SUM(total::numeric) AS total_sales
            FROM 
                sales
            GROUP BY 
                DATE(datetime)
        ),
        expenses_summary AS (
            SELECT 
                DATE(date) AS date,
                SUM(amount::numeric) AS total_expenses
            FROM 
                expenses
            GROUP BY 
                DATE(date)
        )
        SELECT 
            COALESCE(sales_summary.date, expenses_summary.date) AS date,
            sales_summary.total_sales,
            expenses_summary.total_expenses,
            COALESCE(sales_summary.total_sales, 0) - COALESCE(expenses_summary.total_expenses, 0) AS net
        FROM 
            sales_summary
        FULL OUTER JOIN 
            expenses_summary 
        ON 
            sales_summary.date = expenses_summary.date
        ORDER BY 
            date DESC;
    `;
    const { rows } = await pool.query(queryText);
    return rows;
}

async function getTopSpenders() {
    const queryText = `
        SELECT 
            customer,
            SUM(total::numeric) AS total_spent,
            SUM(subtotal::numeric) AS total_subtotal,
            SUM(computer::numeric) AS total_computer
        FROM 
            sales
        GROUP BY 
            customer
        ORDER BY 
            total_spent DESC;
    `;
    const { rows } = await pool.query(queryText);
    
    const formatter = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    
    rows.forEach(row => {
        row.total_spent = formatter.format(row.total_spent);
        row.total_subtotal = formatter.format(row.total_subtotal);
        row.total_computer = formatter.format(row.total_computer);
    });

    return rows;
}

async function updateMemberData() {
    const updateQueryText = `
        WITH member_sales AS (
            SELECT 
                customer,
                MAX(datetime AT TIME ZONE 'Asia/Manila') AS last_spent,
                SUM(computer::numeric) AS total_computer,
                SUM(subtotal::numeric) AS total_subtotal
            FROM 
                sales
            GROUP BY 
                customer
        )
        UPDATE members
        SET 
            total_load = ms.total_computer,
            coffee = ms.total_subtotal,
            total_spent = ms.total_computer + ms.total_subtotal,
            last_spent = ms.last_spent
        FROM 
            member_sales ms
        WHERE 
            members.name = ms.customer;
    `;
    await pool.query(updateQueryText);

    // Fetch the updated member data
    const fetchUpdatedMembersQueryText = `
        SELECT 
            id, 
            name, 
            total_load, 
            coffee, 
            total_spent,
            last_spent AT TIME ZONE 'Asia/Manila' AS last_spent
        FROM 
            members
        ORDER BY 
            total_spent DESC;
    `;
    const { rows } = await pool.query(fetchUpdatedMembersQueryText);
    
    const formatter = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    
    rows.forEach(row => {
        row.total_load = formatter.format(row.total_load);
        row.coffee = formatter.format(row.coffee);
        row.total_spent = formatter.format(row.total_spent);
        row.last_spent = moment(row.last_spent).tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss');
    });

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
});

router.get('/sales-expenses-summary', async (req, res) => {
    try {
        const summary = await getSalesAndExpensesSummary();
        res.json({ sales_expenses_summary: summary });
    } catch (error) {
        console.error('Error fetching sales and expenses summary:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/top-spenders', async (req, res) => {
    try {
        const topSpenders = await getTopSpenders();
        res.json({ top_spenders: topSpenders });
    } catch (error) {
        console.error('Error fetching top spenders:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
