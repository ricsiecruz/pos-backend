const express = require('express');
const pool = require('../db');
const router = express.Router();

router.get('/', (request, response) => {
    pool.query('SELECT * FROM inventory ORDER BY id ASC', (error, results) => {
      if (error) {
        throw error;
      }
      response.status(200).json(results.rows);
    });
});

router.get('/:id', (request, response) => {
  const id = parseInt(request.params.id);

  pool.query('SELECT * FROM inventory WHERE id = $1', [id], (error, results) => {
    if (error) {
      throw error;
    }
    response.status(200).json(results.rows);
  });
});

router.post('/', (request, response) => {
  const { product, stocks } = request.body;

  pool.query('INSERT INTO inventory (product, stocks) VALUES ($1, $2)', [product, stocks], (error, results) => {
    if (error) {
      throw error;
    }
    response.status(201).send(`User added with ID: ${results.insertId}`);
  });
});

router.put('/:id', (request, response) => {
  const id = parseInt(request.params.id);
  const { product, stocks } = request.body;

  pool.query(
    'UPDATE inventory SET product =stocksemail = $2 WHERE id = $3',
    [product, stocks, id],
    (error, results) => {
      if (error) {
        throw error;
      }
      response.status(200).send(`User modified with ID: ${id}`);
    }
  );
});

router.put('/add-stocks/:id', (request, response) => {
  const id = parseInt(request.params.id);
  const { stocks } = request.body;

  // Fetch current stocks from the database
  pool.query(
    'SELECT stocks FROM inventory WHERE id = $1',
    [id],
    (error, results) => {
      if (error) {
        throw error;
      }

      // Calculate new stocks value by adding the requested value to the current value
      const currentStocks = results.rows[0].stocks;
      const newStocks = parseInt(currentStocks) + parseInt(stocks);

      // Update database with the new stocks value
      pool.query(
        'UPDATE inventory SET stocks = $1 WHERE id = $2',
        [newStocks, id],
        (updateError, updateResults) => {
          if (updateError) {
            throw updateError;
          }
          response.status(200).send(`Stocks updated for product with ID: ${id}`);
        }
      );
    }
  );
});

router.delete('/:id', (request, response) => {
  const id = parseInt(request.params.id);

  pool.query('DELETE FROM inventory WHERE id = $1', [id], (error, results) => {
    if (error) {
      throw error;
    }
    response.status(200).send(`User deleted with ID: ${id}`);
  });
});

module.exports = router;
