const pool = require('../db');
const WebSocket = require('ws');

function sendProductsToClient(client) {
  pool.query('SELECT * FROM products ORDER BY id DESC', (error, results) => {
    if (error) {
      console.error('Error fetching products from database:', error);
      return;
    }
    const products = results.rows;
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ action: 'initialize', products }));
      console.log('Sending initial products to client:', products);
    } else {
      console.error('Client is not in open state, unable to send data.');
    }
  });
}

module.exports = {
    sendProductsToClient
};
  