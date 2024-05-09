const express = require('express');
const pool = require('../db');
const WebSocket = require('ws'); // Import WebSocket module
const router = express.Router();

// Define WebSocket server connection handler
module.exports = function(wss) {
  router.get('/', (request, response) => {
    pool.query('SELECT * FROM products ORDER BY id DESC', (error, results) => {
      if (error) {
        throw error;
      }
      response.status(200).json(results.rows);
    });
  });

  router.get('/:id', (request, response) => {
    const id = parseInt(request.params.id);

    pool.query('SELECT * FROM products WHERE id = $1', [id], (error, results) => {
      if (error) {
        throw error;
      }
      response.status(200).json(results.rows);
    });
  });

  router.post('/', (request, response) => {
    const { product, price } = request.body;

    pool.query(
      'INSERT INTO products (product, price) VALUES ($1, $2) RETURNING id', 
      [product, price], 
      (error, results) => {
        if (error) {
          throw error;
        }
        const insertedId = results.rows[0].id;
        response.status(201).json({ id: insertedId });

        // Emit a WebSocket message to notify clients of the new product
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ action: 'addProduct', product: { id: insertedId, product, price } }));
          }
        });
      }
    );
  });

  router.put('/:id', (request, response) => {
    const id = parseInt(request.params.id);
    const { price } = request.body;

    pool.query(
      'UPDATE products SET price = $1 WHERE id = $2',
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

    // Fetch current stocks from the database
    pool.query(
      'SELECT stocks FROM products WHERE id = $1',
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
          'UPDATE products SET stocks = $1 WHERE id = $2',
          [newStocks, id],
          (updateError, updateResults) => {
            if (updateError) {
              throw updateError;
            }
            // Respond with a JSON object containing the message
            response.status(200).json({ message: `Stocks updated for product with ID: ${id}` });
          }
        );
      }
    );
  });

  router.delete('/:id', (request, response) => {
    const id = parseInt(request.params.id);

    pool.query('DELETE FROM products WHERE id = $1', [id], (error, results) => {
      if (error) {
        throw error;
      }
      response.status(200).send(`Product deleted with ID: ${id}`);
    });
  });

  return router;
};
