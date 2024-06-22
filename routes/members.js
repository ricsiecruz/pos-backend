const express = require('express');
const pool = require('../db');
const router = express.Router();

router.get('/', (request, response) => {
  pool.query('SELECT * FROM members ORDER BY id DESC', (error, results) => {
    if (error) {
      console.error('Error fetching members from database:', error);
      return response.status(500).json({ error: 'Internal server error' });
    }
    const members = results.rows;
    response.status(200).json(members);
  });
});

router.get('/:id', (request, response) => {
  const id = parseInt(request.params.id);

  pool.query('SELECT * FROM members WHERE id = $1', [id], (error, results) => {
    if (error) {
      console.error('Error fetching product from database:', error);
      return response.status(500).json({ error: 'Internal server error' });
    }
    const product = results.rows[0];
    if (!product) {
      return response.status(404).json({ error: 'Product not found' });
    }
    response.status(200).json(product);
  });
});

router.put('/:id', (request, response) => {
  const id = parseInt(request.params.id);
  const { price } = request.body;

  pool.query(
    'UPDATE members SET price = $1 WHERE id = $2',
    [price, id],
    (error, results) => {
      if (error) {
        console.error('Error updating product in database:', error);
        return response.status(500).json({ error: 'Internal server error' });
      }
      response.status(200).json({ message: `Product modified with ID: ${id}` });
    }
  );
});

router.put('/add-stocks/:id', (request, response) => {
  const id = parseInt(request.params.id);
  const { stocks } = request.body;

  pool.query(
    'UPDATE members SET stocks = stocks + $1 WHERE id = $2',
    [stocks, id],
    (error, results) => {
      if (error) {
        console.error('Error updating stocks for product in database:', error);
        return response.status(500).json({ error: 'Internal server error' });
      }
      response.status(200).json({ message: `Stocks updated for product with ID: ${id}` });
    }
  );
});

router.delete('/:id', (request, response) => {
  const id = parseInt(request.params.id);

  pool.query('DELETE FROM members WHERE id = $1', [id], (error, results) => {
    if (error) {
      console.error('Error deleting product from database:', error);
      return response.status(500).json({ error: 'Internal server error' });
    }
    response.status(200).json({ message: `Product deleted with ID: ${id}` });
  });
});

module.exports = router;
