const WebSocket = require('ws');
const productsHandler = require('./handlers/productsHandler');

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

module.exports = {
  broadcastProducts
};
