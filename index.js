// index.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
const dashboardRoutes = require('./routes/dashboard');
const userRoutes = require('./routes/queries');
const inventoryRoutes = require('./routes/inventory');
const productsRoutes = require('./routes/products');
const expensesRoutes = require('./routes/expenses');
const salesRoutes = require('./routes/sales');
const membersRoutes = require('./routes/members')
const foodsRoutes = require('./routes/foods');
const port = 3000;
const path = require('path');
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

// Serve the uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (request, response) => {
  response.json({ info: 'Node.js, Express, and Postgres API' });
});

app.use('/users', userRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/products', productsRoutes);
app.use('/expenses', expensesRoutes(wss));
// app.use('/expenses', expensesRoutes);
app.use('/sales', salesRoutes);
app.use('/members', membersRoutes);
app.use('/foods', foodsRoutes);