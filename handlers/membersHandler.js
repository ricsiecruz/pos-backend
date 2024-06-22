const pool = require('../db');
const WebSocket = require('ws');

function sendMembersToClient(client) {
    pool.query('SELECT * FROM members ORDER BY id DESC', (error, results) => {
        if(error) {
            console.error('Error fetching members from database:', error);
            return;
        }
        const members = results.rows;
        if(client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ action: 'initialize', members }));
            console.log('Sending initial products to client:', members);
        } else {
            console.error('Client is not in open state, unable to send data.');
        }
    })
}

module.exports = {
    sendMembersToClient
};