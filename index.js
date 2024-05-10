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

const server = app.listen(port, () => {
  console.log(`App running on port ${port}.`);
});

// Initialize WebSocket server
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server });

// Initialize routes
app.use('/users', userRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/products', productsRoutes(wss)); // Pass wss to productsRoutes
app.use('/expenses', expensesRoutes);
app.use('/sales', salesRoutes)
