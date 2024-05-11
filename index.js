const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
const userRoutes = require('./routes/queries');
const inventoryRoutes = require('./routes/inventory');
const productsRoutes = require('./routes/products');
const expensesRoutes = require('./routes/expenses');
const salesRoutes = require('./routes/sales');
const port = 3000;

// Initialize WebSocket server
const WebSocket = require('ws');

const server = app.listen(port, () => {
  console.log(`App running on port ${port}.`);
});

const wss = new WebSocket.Server({ server });
const http = require('http');
const pool = require('./db');

app.use(cors());
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

app.get('/', (request, response) => {
  response.json({ info: 'Node.js, Express, and Postgres API' });
});

wss.on('connection', (ws) => {
  console.log('Client connected');
  // Send other initial data to client...
  sendProductsToClient(ws);
});

// Initialize routes
app.use('/users', userRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/products', productsRoutes);
app.use('/expenses', expensesRoutes(wss));
app.use('/sales', salesRoutes)

function sendProductsToClient(client) {
  pool.query('SELECT * FROM products ORDER BY id DESC', (error, results) => {
    if (error) {
      console.error('Error fetching products from database:', error);
      return;
    }
    const products = results.rows;
    client.send(JSON.stringify({ action: 'initialize', products }));
    console.log('Sending initial products to client:', products);
  });
}