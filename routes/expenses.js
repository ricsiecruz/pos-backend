const express = require('express');
const pool = require('../db');
const router = express.Router();
const WebSocket = require('ws');

const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
      cb(null, 'uploads/'); // Folder where images will be saved
  },
  filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname)); // Appending extension
  }
});

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

module.exports = function(wss) {
  router.get('/', (request, response) => {
    pool.query('SELECT * FROM expenses ORDER BY id DESC', (error, results) => {
      if (error) {
        throw error;
      }
      response.status(200).json(results.rows);
    });
  });

  router.post('/', async (request, response) => {
    try {
      const { expense, month, date, amount, channel } = request.body;
      const formattedDate = new Date(date);

      const result = await pool.query(
        'INSERT INTO expenses (expense, month, date, amount, channel) VALUES ($1, $2, $3, $4, $5) RETURNING id', 
        [expense, month, formattedDate, amount, channel]
      );

      const insertedId = result.rows[0].id;
      const totalExpenses = await getSumOfExpensesForCurrentDate();

      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ action: 'addExpenses', expense: insertedId, totalExpenses }));
        }
      });

      response.status(201).json({ id: insertedId });
    } catch (error) {
      console.error('Error executing query:', error);
      response.status(500).json({ error: 'Internal Server Error' });
    }
  });

  router.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    res.json({ imagePath: req.file.path });
  });

  return router;
};
