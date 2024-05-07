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
