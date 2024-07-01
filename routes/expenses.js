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

// Function to get the sum of credit expenses
async function getSumOfCredit() {
    const queryText = `
        SELECT SUM(amount::numeric) AS total_credit_amount
        FROM expenses
        WHERE credit = true;
    `;
    const { rows } = await pool.query(queryText);
    return rows[0].total_credit_amount;
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
// async function getExpensesData() {
//     const queryText = 'SELECT * FROM expenses ORDER BY id DESC';
//     const { rows } = await pool.query(queryText);
//     return rows;
// }

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

    async function getExpensesData() {
        const queryText = 'SELECT * FROM expenses ORDER BY id DESC';
        const { rows } = await pool.query(queryText);
        return rows;
    }

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

    router.post('/', async (req, res) => {
        try {
            const { expense, month, date, amount, mode_of_payment, image_path, credit, paid_by, settled_by } = req.body;
            const formattedDate = new Date(date);

            const result = await pool.query(
                'INSERT INTO expenses (expense, month, date, amount, mode_of_payment, image_path, credit, paid_by, settled_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
                [expense, month, formattedDate, amount, mode_of_payment, image_path, credit, paid_by, settled_by]
            );

            const insertedId = result.rows[0].id;
            const totalExpenses = await getSumOfExpensesForCurrentDate();

            // Deduct credit amount if the expense is marked as credit
            if (credit) {
                const deductedAmount = await deductCreditAmount(amount);
                const totalCreditAmount = await getSumOfCredit();

                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ action: 'addExpenses', expense: insertedId, totalExpenses, totalCreditAmount }));
                    }
                });
            } else {
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ action: 'addExpenses', expense: insertedId, totalExpenses }));
                    }
                });
            }

            res.status(201).json({ id: insertedId });
        } catch (error) {
            console.error('Error executing query:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    router.put('/:id/pay', async (req, res) => {
        try {
            const expenseId = req.params.id;
    
            // Update the expense to mark it as paid and set 'settled_by'
            const result = await pool.query(
                'UPDATE expenses SET credit = false, settled_by = $1 WHERE id = $2 RETURNING amount::numeric',
                ['Tech Hybe', expenseId]
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

    return router;
};
