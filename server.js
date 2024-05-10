// server.js

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pool = require('./db'); // Import your database pool

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Define WebSocket server connection handler
wss.on('connection', (ws) => {
  console.log('Client connected');

  // Send initial list of products to the client
  sendProductsToClient(ws);
  sendSalesToClient(ws);

  // Handle messages from the client
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    switch (data.action) {
      case 'addProduct':
        // Add the new product to the database
        addProductToDatabase(data.product)
          .then(() => {
            // Broadcast the updated list of products to all connected clients
            broadcastProducts();
          })
          .catch((error) => {
            console.error('Error adding product to database:', error);
          });
        break;
      // Add other cases for handling different actions
      case 'editProduct':
      // Update the product in the database
        editProductInDatabase(data.product)
          .then(() => {
            // Broadcast the updated list of products to all connected clients
            broadcastProducts();
          })
          .catch((error) => {
            console.error('Error editing product in database:', error);
          });
        break;
        case 'addSales':
  addTransactionSalesToDatabase(data.sale)
    .then((newSale) => {
      broadcastSales(newSale);
    })
    .catch((error) => {
      console.log('Error adding sale to database:', error);
    });
  break;

      
      default:
        break;
    }
  });

  // Handle client disconnection
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Function to send the current list of products to a client
function sendProductsToClient(client) {
  pool.query('SELECT * FROM products ORDER BY id DESC', (error, results) => {
    if (error) {
      console.error('Error fetching products from database:', error);
      return;
    }
    const products = results.rows;
    client.send(JSON.stringify({ action: 'initialize', products }));
    console.log('Sending initial products to client:', products); // Add this line for debugging
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

// Function to add a product to the database
function addProductToDatabase(newProduct) {
  return new Promise((resolve, reject) => {
    const { product, price } = newProduct;
    pool.query(
      'INSERT INTO products (product, price) VALUES ($1, $2) RETURNING id, product, price',
      [product, price],
      (error, results) => {
        if (error) {
          reject(error);
          return;
        }
        const { id, product, price } = results.rows[0];
        // Fetch the updated list of products
        pool.query('SELECT * FROM products ORDER BY id DESC', (error, results) => {
          if (error) {
            reject(error);
            return;
          }
          const updatedProducts = results.rows;
          // Broadcast the updated list of products to all connected clients
          broadcastProducts(updatedProducts);
          // Resolve with the newly added product
          resolve({ id, product: product, price });
        });
      }
    );
  });
}

// Function to add transaction sales to the database
function addTransactionSalesToDatabase(sale) {
  return new Promise((resolve, reject) => {
    const { transactionId, orders, qty, total, dateTime } = sale;

    pool.query(
      'INSERT INTO sales (transactionId, orders, qty, total, datetime) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [transactionId, JSON.stringify(orders), qty, total, dateTime],
      (error, results) => {
        if (error) {
          reject(error);
          return;
        }
        const newSale = results.rows[0];
        resolve(newSale);
      }
    );
  });
}


// Function to edit a product in the database
function editProductInDatabase(updatedProduct) {
  return new Promise((resolve, reject) => {
    const { id, product, price } = updatedProduct;
    pool.query(
      'UPDATE products SET product = $1, price = $2 WHERE id = $3',
      [product, price, id],
      (error, results) => {
        if (error) {
          reject(error);
          return;
        }
        // Resolve after successfully updating the product
        resolve();
      }
    );
  });
}

// Function to broadcast the updated list of products to all connected clients
function broadcastProducts(updatedProducts) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      sendProductsToClient(client); // Broadcast the updated products
      console.log('Broadcasting updated products to client:', updatedProducts); // Add this line for debugging
    }
  });
}

function broadcastSales(addSales) {
  wss.clients.forEach((client) => {
    if(client.readyState === WebSocket.OPEN) {
      sendSalesToClient(client);
      console.log('Broadcasting sales to client:', addSales)
    }
  })
}

// function broadcastSales(addSales) {
//   wss.clients.forEach((client) => {
//     if(client.readyState === WebSocket.OPEN) {
//       sendSalesToClient(client);
//       console.log('Broadcasting sales to client:', addSales)
//     }
//   })
// }

// Start the server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
