const pool = require('./db');
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

function sendSalesToClient(client) {
  pool.query('SELECT * FROM sales ORDER BY id DESC', (error, results) => {
    if(error) {
      console.log('Error fetching sales from database:', error);
      return;
    }
    const sales = results.rows;
    client.send(JSON.stringify({ action: 'initialize', sales }));
    console.log('Sending initial sales to client:', sales);
  })
}

module.exports = {
  sendProductsToClient,
  sendSalesToClient
};
