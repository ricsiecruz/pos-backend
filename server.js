const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pool = require('./db');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const productsRoutes = require('./routes/products');
const broadcasts = require('./broadcasts');

wss.on('connection', (ws) => {
  console.log('Client connected');
  broadcasts.sendProductsToClient(ws);
  sendSalesToClient(ws);
  sendInventoryToClient(ws);
  sendExpensesToClient(ws);
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    switch (data.action) {
      case 'addProduct':
        addProductToDatabase(data.product)
          .then(() => {
            broadcastProducts();
          })
          .catch((error) => {
            console.error('Error adding product to database:', error);
          });
        break;
      case 'editProduct':
        editProductInDatabase(data.product)
          .then(() => {
            broadcastProducts();
            // broadcasts.sendProductsToClient(ws);
          })
          .catch((error) => {
            console.error('Error editing product in database:', error);
          });
        break;
      case 'addInventory':
        addInventory(data.inventory)
          .then(() => {
            broadcastInventory();
          })
          .catch((error) => {
            console.error('Error adding invetory to database:', error);
          });
        break;
      case 'addStock':
        addStock(data.inventory)
          .then(() => {
            broadcastInventory();
          })
          .catch((error) => {
            console.error('Error adding stock:', error);
          })
        break;
        case 'addExpenses':
          addExpenses(data.expense)
            .then(() => {
              broadcastExpenses();
            })
            .catch((error) => {
              console.error('Error adding expenses in database:', error);
            });
          break;        
      case 'addExpensesResponse':
        handleAddExpensesResponse(data);
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

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

function sendExpensesToClient(client) {
  pool.query('SELECT * FROM expenses ORDER BY id DESC', (error, results) => {
    if(error) {
      console.error('Error fetching expenses from database:', error);
      return;
    }
    const expenses = results.rows;
    client.send(JSON.stringify({ action: 'initialize', expenses }));
    console.log('Sending initial expenses to client:', expenses)
  })
}

function sendInventoryToClient(client) {
  pool.query('SELECT * FROM inventory ORDER BY id DESC', (error, results) => {
    if(error) {
      console.error('Error fetching inventory from database:', error);
      return;
    }
    const inventory = results.rows;
    client.send(JSON.stringify({ action: 'initialize', inventory }));
    console.log('Sending initial inventory to client:', inventory);
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
        pool.query('SELECT * FROM products ORDER BY id DESC', (error, results) => {
          if (error) {
            reject(error);
            return;
          }
          const updatedProducts = results.rows;
          broadcastProducts(updatedProducts);
          resolve({ id, product: product, price });
        });
      }
    );
  });
}

function addExpenses(newExpenses) {
  return new Promise((resolve, reject) => {
    console.log('newExpenses', newExpenses)
    const { expense, month, date, amount, channel } = newExpenses;
    pool.query(
      'INSERT INTO expenses (expense, month, date, amount, channel) VALUES ($1, $2, $3, $4, $5) RETURNING id , expense, month, date, amount, channel',
      [expense, month, date, amount, channel],
      (error, results) => {
        if(error) {
          reject(error);
          return;
        }
        const { id, expense, month, date, amount, channel } = results.rows[0];
        pool.query('SELECT * FROM expenses ORDER BY id DESC', (error, results) => {
          if(error) {
            reject(error);
            return;
          }
          const updatedExpenses = results.rows;
          broadcastExpenses(updatedExpenses);
        });
      }
    )
  })
}

function handleAddExpensesResponse(data) {
  const { expense, totalSum } = data;
  console.log('Newly added expense:', expense);
  console.log('Total sum of expenses:', totalSum);
}

function addInventory(newInventory) {
  return new Promise((resolve, reject) => {
    const { product, category, brand, stocks } = newInventory;
    pool.query(
      'INSERT INTO inventory (product, category, brand, stocks) VALUES ($1, $2, $3, $4) RETURNING id, product, category, brand, stocks',
      [product, category, brand, stocks],
      (error, results) => {
        if (error) {
          reject(error);
          return;
        }
        const { id, product, category, brand, stocks } = results.rows[0];
        pool.query('SELECT * FROM inventory ORDER BY id DESC', (error, results) => {
          if (error) {
            reject(error);
            return;
          }
          const updatedInventory = results.rows;
          broadcastInventory(updatedInventory);
          resolve({ id, product, category, brand, stocks });
        });
    });
  });
}

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

function editProductInDatabase(updatedProduct) {
  return new Promise((resolve, reject) => {
    console.log('updated products', updatedProduct);
    const { id, product, price } = updatedProduct;
    pool.query(
      'UPDATE products SET product = $1, price = $2 WHERE id = $3',
      [product, price, id],
      (error, results) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      }
    );
  });
}

function addStock(updateInventory) {
  return new Promise((resolve, reject) => {
    console.log('updateInventory', updateInventory);
    const { id, stocks } = updateInventory;
    pool.query(
      'UPDATE inventory SET stocks = $1 WHERE id = $2',
      [stocks, id],
      (error, results) => {
        if (error) {
          console.error('Error updating stock:', error);
          reject(error);
          return;
        }
        resolve();
        broadcastInventory();
      }
    );
  });
}

function broadcastProducts(updatedProducts) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      broadcasts.sendProductsToClient(client);
      console.log('Broadcasting updated products to client:', updatedProducts);
    }
  });
}

function broadcastExpenses(updatedExpenses) {
  wss.clients.forEach((client) => {
    if(client.readyState === WebSocket.OPEN) {
      sendExpensesToClient(client);
      console.log('Broadcasting updated expenses to client:', updatedExpenses);
    }
  })
}

function broadcastInventory(addInventory) {
  wss.clients.forEach((client) => {
    if(client.readyState === WebSocket.OPEN) {
      sendInventoryToClient(client);
      console.log('Broadcasting updated inventory to client:', addInventory);
    }
  })
}

function broadcastSales(addSales) {
  wss.clients.forEach((client) => {
    if(client.readyState === WebSocket.OPEN) {
      sendSalesToClient(client);
      console.log('Broadcasting sales to client:', addSales)
    }
  })
}

app.use('/products', productsRoutes);

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
