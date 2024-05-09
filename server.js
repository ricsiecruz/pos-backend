// server.js

const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Define an array to store products
let products = [];

// WebSocket server connection handler
wss.on('connection', (ws) => {
  console.log('Client connected');

  // Send initial list of products to the client
  ws.send(JSON.stringify({ action: 'initialize', products }));

  // Handle messages from the client
  // Handle messages from the client
ws.on('message', (message) => {
  const data = JSON.parse(message);
  switch (data.action) {
    case 'addProduct':
      // Add the new product to the array
      products.push(data.product);
      // Broadcast the updated list of products to all connected clients
      broadcastProducts();
      break;
    case 'editProduct':
      // Find and update the product in the array
      const index = products.findIndex(product => product.id === data.productId);
      if (index !== -1) {
        products[index] = { ...data.product, id: data.productId };
        // Broadcast the updated list of products to all connected clients
        broadcastProducts();
      }
      break;
    default:
      break;
  }
});

// Function to broadcast updated products to all clients
function broadcastProducts() {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ action: 'updateProducts', products }));
    }
  });
}


  // Handle client disconnection
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Start the server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
