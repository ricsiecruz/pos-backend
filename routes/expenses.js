const express = require('express');
const pool = require('../db');
const router = express.Router();

module.exports = function(wss) {

  router.get('/', (request, response) => {
      pool.query('SELECT * FROM expenses ORDER BY id DESC', (error, results) => {
        if (error) {
          throw error;
        }
        response.status(200).json(results.rows);
      });
  });

  router.get('/:id', (request, response) => {
    const id = parseInt(request.params.id);

    pool.query('SELECT * FROM expenses WHERE id = $1', [id], (error, results) => {
      if (error) {
        throw error;
      }
      response.status(200).json(results.rows);
    });
  });

  router.post('/', (request, response) => {
    try {
        const { expense, month, date, amount, channel } = request.body;
        const formattedDate = new Date(date);

        pool.query(
            'INSERT INTO expenses (expense, month, date, amount, channel) VALUES ($1, $2, $3, $4, $5) RETURNING id', 
            [expense, month, formattedDate, amount, channel], 
            (error, results) => {
                if (error) {
                    throw error;
                }
                const insertedId = results.rows[0].id;
                response.status(201).json({ id: insertedId });
            }
        );
      } catch (error) {
        console.error('Error executing query:', error);
        response.status(500).json({ error: 'Internal Server Error' });
      }
  });

  router.put('/:id', (request, response) => {
      const id = parseInt(request.params.id);
      const { price } = request.body;
    
      pool.query(
        'UPDATE expenses SET price = $1 WHERE id = $2',
        [price, id],
        (error, results) => {
          if (error) {
            throw error;
          }
          response.status(200).json(`Product modified with ID: ${id}`);
        }
      );
  });  

  router.put('/add-stocks/:id', (request, response) => {
    const id = parseInt(request.params.id);
    const { stocks } = request.body;

    pool.query(
      'SELECT stocks FROM expenses WHERE id = $1',
      [id],
      (error, results) => {
        if (error) {
          throw error;
        }

        const currentStocks = results.rows[0].stocks;
        const newStocks = parseInt(currentStocks) + parseInt(stocks);

        pool.query(
          'UPDATE expenses SET stocks = $1 WHERE id = $2',
          [newStocks, id],
          (updateError, updateResults) => {
            if (updateError) {
              throw updateError;
            }
            response.status(200).json({ message: `Stocks updated for product with ID: ${id}` });
          }
        );
      }
    );
  });

  router.delete('/:id', (request, response) => {
    const id = parseInt(request.params.id);

    pool.query('DELETE FROM expenses WHERE id = $1', [id], (error, results) => {
      if (error) {
        throw error;
      }
      response.status(200).send(`Product deleted with ID: ${id}`);
    });
  });

  async function getSumOfAllExpenses() {
    const queryText = 'SELECT SUM(amount) AS total_expenses FROM expenses';
    const { rows } = await pool.query(queryText);
    return rows[0].total_expenses;
  }

  return router;
};