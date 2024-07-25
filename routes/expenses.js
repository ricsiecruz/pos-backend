const express = require('express');
const pool = require('../db');
const router = express.Router();
const WebSocket = require('ws');

const multer = require('multer');
const path = require('path');

const { put } = require('@vercel/blob'); // Ensure you have the @vercel/blob package installed

require('dotenv').config();

const storage = multer.memoryStorage();

const upload = multer({ storage: storage });

// Function to get the sum of expenses for the current date
async function getSumOfExpensesForCurrentDate() {
    const setTimezoneQuery = "SET TIME ZONE 'Asia/Manila';";
    const queryText = `
        SELECT COALESCE(SUM(amount::numeric), 0) AS total_expenses
        FROM expenses
        WHERE DATE(date AT TIME ZONE 'Asia/Manila') = CURRENT_DATE;
    `;

    await pool.query(setTimezoneQuery);
    const { rows } = await pool.query(queryText);
    return rows[0].total_expenses;
}

async function getSumOfCredit(paid_by = null) {
    let queryText = `
      SELECT 
        COALESCE(SUM(amount::numeric), 0) AS total_credit_amount,
        COUNT(*) AS credit_count
      FROM 
        expenses
      WHERE 
        credit = true
    `;
    
    const queryParams = [];

    if (paid_by) {
        queryText += ' AND paid_by = $1';
        queryParams.push(paid_by);
    }

    try {
        const { rows } = await pool.query(queryText, queryParams);
        console.log('credit query text:', queryText);
        console.log('credit query params:', queryParams);
        console.log('credit rows:', rows);
        return {
          totalCreditAmount: rows[0]?.total_credit_amount || '0',
          creditCount: rows[0]?.credit_count || '0'
        };
    } catch (error) {
        console.error('Error executing getSumOfCredit query:', error);
        return {
            totalCreditAmount: '0',
            creditCount: '0'
        };
    }
}


async function getPaidBy() {
    const queryText = 'SELECT * FROM paid_by';
    const { rows } = await pool.query(queryText);
    return rows;
}

async function getModeOfPayment() {
    const queryText = 'SELECT * FROM mode_of_payment';
    const { rows } = await pool.query(queryText);
    return rows;
}

// Function to get expenses data
async function getExpensesData() {
    const queryText = `
        SELECT *
        FROM expenses
        ORDER BY credit DESC, id DESC;
    `;
    const { rows } = await pool.query(queryText);
    return rows;
}

// Function to deduct credit amount
async function deductCreditAmount(amount) {
    const queryText = `
        UPDATE expenses
        SET credit = false
        WHERE id = (
            SELECT id
            FROM expenses
            WHERE credit = true
            ORDER BY id
            LIMIT 1
        )
        RETURNING amount::numeric;
    `;
    const { rows } = await pool.query(queryText);
    return rows[0].amount;
}

module.exports = function (wss) {
    router.get('/', async (req, res) => {
        try {
            const [expensesData, totalCreditAmount] = await Promise.all([
                getExpensesData(),
                getSumOfCredit()
            ]);

            const responseData = {
                data: expensesData,
                total_credit_amount: totalCreditAmount
            };
            // console.log('expenses', responseData.total_credit_amount);
            res.status(200).json(responseData);
        } catch (error) {
            console.error('Error fetching expenses data:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    router.post('/upload', upload.single('image'), async (req, res) => {
        if (!req.file) {
            return res.status(400).send('No file uploaded.');
        }
    
        try {
            const { buffer, originalname } = req.file;
            const extension = path.extname(originalname);
            const key = `uploads/${Date.now()}${extension}`;
            
            // Upload the file to Vercel Blob
            const { url } = await put(key, buffer, {
                access: 'public',
                token: process.env.BLOB_READ_WRITE_TOKEN
            });
    
            res.json({ imagePath: url });
        } catch (error) {
            console.error('Error uploading file:', error);
            res.status(500).send('Error uploading file.');
        }
    });

    router.put('/:id/pay', async (req, res) => {
        try {
            const expenseId = req.params.id;
            
            // Get the current timestamp
            const currentDate = new Date().toISOString();
    
            // Update the expense to mark it as paid, set 'settled_by' and 'date_settled'
            const result = await pool.query(
                `UPDATE expenses
                SET credit = false, settled_by = $1, date_settled = $2
                WHERE id = $3
                RETURNING amount::numeric`,
                ['Tech Hybe', currentDate, expenseId]
            );
    
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Expense not found' });
            }
    
            const deductedAmount = result.rows[0].amount;
            const totalCreditAmount = await getSumOfCredit();
    
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ action: 'deductCredit', expense: expenseId, totalCreditAmount }));
                }
            });
    
            res.status(200).json({ deductedAmount, totalCreditAmount });
        } catch (error) {
            console.error('Error executing query:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });    

    router.get('/paid-by', async(req, res) => {
        try {
            const paidBy = await getPaidBy();
            res.json({ paid_by: paidBy });
        } catch(error) {
            console.log('Error fetching paid by from database:', error);
            res.status(500).json({ error: 'Internal server error - paid by' })
        }
    })

    router.get('/mode-of-payment', async(req, res) => {
        try {
            const modeOfPayment = await getModeOfPayment();
            res.json({ mode_of_payment: modeOfPayment });
        } catch(error) {
            console.log('Error fetching mode of payment from database:', error);
            res.status(500).json({ error: 'Internal server error - mode of payment' })
        }
    })

    router.post('/filter-by-paid-by', async (req, res) => {
        const { paid_by } = req.body;
    
        if (!paid_by) {
            return res.status(400).json({ error: 'paid_by parameter is required' });
        }
    
        try {
            const [expensesData, totalCreditAmount] = await Promise.all([
                (async () => {
                    const queryText = `
                        SELECT *
                        FROM expenses
                        WHERE paid_by = $1
                          AND credit = true
                        ORDER BY id DESC;
                    `;
                    const { rows } = await pool.query(queryText, [paid_by]);
                    return rows;
                })(),
                getSumOfCredit(paid_by)
            ]);
    
            console.log('expenses filter by paid by', expensesData);
    
            const responseData = {
                data: expensesData,
                total_credit_amount: totalCreditAmount
            };
    
            res.status(200).json(responseData);
        } catch (error) {
            console.error('Error fetching filtered expenses data:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });    

    return router;
};