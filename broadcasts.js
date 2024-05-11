const WebSocket = require('ws');
const websocketHandlers = require('./websocketHandlers');
const productsHandler = require('./handlers/productsHandler')

// Export the function to broadcast products
function broadcastProducts(wss) {
  if (!wss || !wss.clients) {
    console.error('WebSocket Server or clients are not defined.');
    return;
  }
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
        productsHandler.sendProductsToClient(client);
      console.log('Broadcasting updated products to client');
    }
  });
}

// Export the function
module.exports = {
    broadcastProducts
};
