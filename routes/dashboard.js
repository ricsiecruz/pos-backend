const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const moment = require('moment-timezone');
const router = express.Router();

const TIMEZONE = 'Asia/Manila';

router.get('/', async (req, res) => {
    try {
        const [mostOrderedToday, mostOrdered, salesAndExpensesSummary, topSpenders, updatedMembers, startDate] = await Promise.all([
            getMostOrdered(true),
            getMostOrdered(),
            getSalesAndExpensesSummary(),
            getTopSpenders(),
            updateMemberData(),
            getStartDate()
        ]);

        res.json({
            mostOrderedToday,
            mostOrdered,
            salesAndExpensesSummary,
            topSpenders,
            updatedMembers,
            startDate
        });
    } catch (error) {
        handleError(res, 'Error fetching dashboard from database:', error, 'Internal server error - dashboard');
    }
});

async function getMostOrdered(isToday = false) {
    let queryText = `
        WITH expanded_orders AS (
            SELECT 
                o.order_detail
            FROM 
                sales,
                LATERAL (
                    SELECT 
                        jsonb_array_elements(orders::jsonb) AS order_detail
                    WHERE 
                        jsonb_typeof(orders::jsonb) = 'array'
                ) o
    `;
    
    if (isToday) {
        queryText += ` WHERE DATE(datetime AT TIME ZONE '${TIMEZONE}') = CURRENT_DATE `;
    }

    queryText += `
        )
        SELECT 
            order_detail ->> 'product' AS product,
            SUM((order_detail ->> 'quantity')::integer) AS total_quantity
        FROM expanded_orders
        GROUP BY order_detail ->> 'product'
        ORDER BY total_quantity DESC
        LIMIT 10;
    `;

    const { rows } = await pool.query(queryText);
    return rows;
}

async function getSalesAndExpensesSummary() {
    const salesJsonPath = path.join(__dirname, '../sales.json');
    const salesJsonData = JSON.parse(fs.readFileSync(salesJsonPath, 'utf-8'));
  
    const salesQueryText = `
        SELECT 
            DATE(datetime AT TIME ZONE '${TIMEZONE}') AS date,
            SUM(total::numeric) AS total_sales
        FROM 
            sales
        GROUP BY 
            DATE(datetime AT TIME ZONE '${TIMEZONE}')
    `;
  
    const expensesQueryText = `
        SELECT 
            DATE(date AT TIME ZONE '${TIMEZONE}') AS date,
            SUM(amount::numeric) AS total_expenses
        FROM 
            expenses
        GROUP BY 
            DATE(date AT TIME ZONE '${TIMEZONE}')
    `;
  
    // Execute database queries
    const salesResults = await pool.query(salesQueryText);
    const expensesResults = await pool.query(expensesQueryText);
  
    // Process sales data from the database
    const dbSalesData = salesResults.rows.reduce((acc, row) => {
        acc[row.date] = {
            date: row.date,
            total_sales: parseFloat(row.total_sales) || 0,
        };
        return acc;
    }, {});
  
    // Process sales data from the sales.json file
    const jsonSalesData = salesJsonData.reduce((acc, sale) => {
        const date = moment(sale.datetime).tz(TIMEZONE).format('YYYY-MM-DD');
        if (!acc[date]) {
            acc[date] = { date: date, total_sales: 0 };
        }
        acc[date].total_sales += parseFloat(sale.total) || 0;
        return acc;
    }, {});
  
    // Combine sales data from both the database and sales.json
    const combinedSalesData = { ...jsonSalesData, ...dbSalesData };
  
    // Process expenses data from the database
    const expensesData = expensesResults.rows.reduce((acc, row) => {
        acc[row.date] = {
            date: row.date,
            total_expenses: parseFloat(row.total_expenses) || 0,
        };
        return acc;
    }, {});
  
    // Combine sales and expenses data
    const combinedData = [];
    const allDates = new Set([...Object.keys(combinedSalesData), ...Object.keys(expensesData)]);
  
    allDates.forEach(date => {
        const total_sales = combinedSalesData[date]?.total_sales || 0;
        const total_expenses = expensesData[date]?.total_expenses || 0;
        const net = total_sales - total_expenses;
  
        combinedData.push({
            date,
            total_sales,
            total_expenses,
            net,
        });
    });
  
    // Sort combined data by total sales in descending order
    combinedData.sort((a, b) => b.total_sales - a.total_sales);
  
    // Filter out entries with total_sales = 0 for all-time low calculation
    const filteredData = combinedData.filter(item => item.total_sales > 0);
  
    return {
        data: combinedData,
        all_time_low: filteredData[filteredData.length - 1],
        all_time_high: filteredData[0],
    };
}


async function getTopSpenders(today = false) {
    let queryText = `
        SELECT 
            customer,
            SUM(total::numeric) AS total_spent,
            SUM(subtotal::numeric) AS total_subtotal,
            SUM(computer::numeric) AS total_computer
        FROM 
            sales
    `;

    if (today) {
        queryText += ` WHERE DATE(datetime AT TIME ZONE '${TIMEZONE}') = CURRENT_DATE `;
    }

    queryText += `
        GROUP BY 
            customer
        ORDER BY 
            total_spent DESC
        LIMIT 10;
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
                MAX(datetime AT TIME ZONE '${TIMEZONE}') AS last_spent,
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
            members.name = ms.customer
        RETURNING id, name, total_load, coffee, total_spent, members.last_spent AT TIME ZONE '${TIMEZONE}' AS last_spent;
    `;
    const { rows } = await pool.query(updateQueryText);

    const formatter = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    rows.forEach(row => {
        row.total_load = formatter.format(row.total_load);
        row.coffee = formatter.format(row.coffee);
        row.total_spent = formatter.format(row.total_spent);
        row.last_spent = moment(row.last_spent).tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
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

router.get('/top-spenders-today', async (req, res) => {
    try {
        const topSpendersToday = await getTopSpenders(true);
        res.json({ top_spenders_today: topSpendersToday });
    } catch (error) {
        console.error('Error fetching top spenders for today:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

async function getStartDate() {
    const salesJsonPath = path.join(__dirname, '../sales.json');
    const salesJsonData = JSON.parse(fs.readFileSync(salesJsonPath, 'utf-8'));

    // Query to get the earliest datetime from the database
    const queryText = `
        SELECT 
            MIN(datetime AT TIME ZONE '${TIMEZONE}') AS start_date
        FROM 
            sales;
    `;
    const { rows } = await pool.query(queryText);
    const dbStartDate = rows[0].start_date;

    // Find the earliest datetime in the sales.json file
    const jsonStartDate = salesJsonData.reduce((earliest, sale) => {
        const saleDate = moment(sale.datetime).tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
        return earliest ? (moment(saleDate).isBefore(earliest) ? saleDate : earliest) : saleDate;
    }, null);

    // Determine the overall earliest date between database and JSON file
    const overallStartDate = dbStartDate && jsonStartDate 
        ? (moment(jsonStartDate).isBefore(dbStartDate) ? jsonStartDate : dbStartDate)
        : (dbStartDate || jsonStartDate);

    return overallStartDate;
}

function handleError(res, logMessage, error, clientMessage) {
    console.error(logMessage, error);
    res.status(500).json({ message: clientMessage });
}

module.exports = router;
