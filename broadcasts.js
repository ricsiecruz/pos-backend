const WebSocket = require('ws');
const productsHandler = require('./handlers/productsHandler');
const membersHandler = require('./handlers/membersHandler');

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

// function broadcastMembers(wss) {
//   if (!wss || !wss.clients) {
//     console.error('WebSocket Server or clients of member are not defined.');
//     return;
//   }

//   wss.clients.forEach((client) => {
//     if (client.readyState === WebSocket.OPEN) {
//       membersHandler.sendMembersToClient(client);
//       console.log('Broadcasting updated members to client');
//     }
//   })
// }

// function broadcastMembers(updatedMembers) {
//   wss.clients.forEach((client) => {
//     if(client.readyState === WebSocket.OPEN) {
//       membersHandler.sendMembersToClient(client);
//       console.log('Broadcasting updated members to client:', updatedMembers);
//     }
//   })
// }

module.exports = {
  broadcastProducts,
  // broadcastMembers
};
