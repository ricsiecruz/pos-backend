const pool = require('../db');
const WebSocket = require('ws');
const broadcasts = require('../broadcasts')

function sendProductsToClient(client) {
  pool.query('SELECT * FROM products ORDER BY id DESC', (error, results) => {
    if (error) {
      console.error('Error fetching products from database:', error);
      return;
    }
    const products = results.rows;
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ action: 'initialize', products }));
      // console.log('Sending initial products to client:', products);
    } else {
      console.error('Client is not in open state, unable to send data.');
    }
  });
}

function addProductToDatabase(newProduct) {
  return new Promise((resolve, reject) => {
    const { product, price, barista } = newProduct;
    pool.query(
      'INSERT INTO products (product, price, barista) VALUES ($1, $2, $3) RETURNING id, product, price, barista',
      [product, price, barista],
      (error, results) => {
        if (error) {
          reject(error);
          return;
        }
        const { id, product, price, barista } = results.rows[0];
        pool.query('SELECT * FROM products ORDER BY id DESC', (error, results) => {
          if (error) {
            reject(error);
            return;
          }
          const updatedProducts = results.rows;
          broadcasts.broadcastProducts(updatedProducts);
          resolve({ id, product: product, price, barista });
        });
      }
    );
  });
}

function editProductInDatabase(updatedProduct) {
  return new Promise((resolve, reject) => {
    console.log('updated products', updatedProduct);
    const { id, product, price, barista } = updatedProduct;
    pool.query(
      'UPDATE products SET product = $1, price = $2, barista = $3 WHERE id = $4',
      [product, price, barista, id],
      (error, results) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      }
    );
  });
}

module.exports = {
    sendProductsToClient,
    addProductToDatabase,
    editProductInDatabase
};
  