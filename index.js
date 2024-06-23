const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
const userRoutes = require('./routes/queries');
const inventoryRoutes = require('./routes/inventory');
const productsRoutes = require('./routes/products');
const expensesRoutes = require('./routes/expenses');
const salesRoutes = require('./routes/sales');
const membersRoutes = require('./routes/members')
const foodsRoutes = require('./routes/foods');
const port = 3000;

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

app.use('/users', userRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/products', productsRoutes);
app.use('/expenses', expensesRoutes(wss));
app.use('/sales', salesRoutes);
app.use('/members', membersRoutes);
app.use('/foods', foodsRoutes);