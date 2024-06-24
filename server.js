const moment = require('moment-timezone');
const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const pool = require('./db');
const app = express();
const server = http.createServer(app);
const port = 8080;
const wss = new WebSocket.Server({ port });
const websocketHandlers = require('./websocketHandlers');
const productsHandler = require('./handlers/productsHandler');
const foodsHandler = require('./handlers/foodsHandler');
const salesHandler = require('./handlers/salesHandler');
const membersHandler = require('./handlers/membersHandler');
const broadcasts = require('./broadcasts');
app.use(cors());

wss.on('listening', () => { 
  console.log(`WebSocket server is listening on port ${port}`); 
  }); 

wss.on('connection', (ws) => {
  console.log('Client connected');
  productsHandler.sendProductsToClient(ws);
  websocketHandlers.sendSalesToClient(ws);
  websocketHandlers.sendInventoryToClient(ws);
  websocketHandlers.sendFoodsToClient(ws);
  websocketHandlers.sendExpensesToClient(ws);
  membersHandler.sendMembersToClient(ws);

  ws.on('message', (message) => {
    console.log('Received:', message);
    const data = JSON.parse(message);
    switch (data.action) {
      case 'addProduct':
        productsHandler.addProductToDatabase(data.product)
          .then(() => {
            broadcasts.broadcastProducts(wss);
          })
          .catch((error) => {
            console.error('Error adding product to database:', error);
          });
        break;
      case 'editProduct':
        productsHandler.editProductInDatabase(data.product)
          .then(() => {
            broadcasts.broadcastProducts(wss);
          })
          .catch((error) => {
            console.error('Error editing product in database:', error);
          });
        break;
      case 'addFood':
        foodsHandler.addFoodToDatabase(data.food)
          .then((updatedFoodStock) => {
            broadcastFoods(updatedFoodStock);
          })
          .catch((error) => {
            console.error('Error adding foods to database:', error);
          });
        break;
      case 'editFood':
        editFood(data.product)
          .then(() => {
            broadcastFoods();
          })
          .catch((error) => {
            console.error('Error editing food in database:', error);
          });
        break;
      case 'updateSales':
        salesHandler.updateSalesInDatabase(data.sales)
          .then((updatedSale) => {
            broadcastSales(updatedSale);
          })
          .catch((error) => {
            console.error('Error updating sales in database:', error);
          });
        break;
      case 'addInventory':
        addInventory(data.inventory)
          .then(() => {
            broadcastInventory();
          })
          .catch((error) => {
            console.error('Error adding inventory to database:', error);
          });
        break;
      case 'addStock':
        addStock(data.inventory)
          .then(() => {
            broadcastInventory();
          })
          .catch((error) => {
            console.error('Error adding stock:', error);
          });
        break;
      case 'addFoodStock':
        addFoodStock(data.food)
          .then(() => {
            broadcastFoods();
          })
          .catch((error) => {
            console.error('Error adding food stock:', error)
          });
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
      case 'addMember':
        addMemberToDatabase(data.member)
          .then(() => {
            broadcastMembers(wss);
          })
          .catch((error) => {
            console.error('Error adding member to database:', error);
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

function editFood(updatedFood) {
  return new Promise((resolve, reject) => {
    console.log('updated foods', updatedFood);
    // if (!updatedFood || !updatedFood.id || !updatedFood.product || !updatedFood.price) {
    //   reject(new Error('Invalid updatedFood object or missing properties'));
    //   return;
    // }
    const { id, product, stocks, price } = updatedFood;
    pool.query(
      'UPDATE foods SET product = $1, stocks = $2, price = $3 WHERE id = $4',
      [product, stocks, price, id],
      (error, results) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
        broadcastFoods();
      }
    )

  })
}

function addMemberToDatabase(newMember) {
  return new Promise((resolve, reject) => {
    const { name, date_joined, coffee, total_load, total_spent, last_spent,  } = newMember;
    pool.query(
      'INSERT INTO members (name, date_joined, coffee, total_load, total_spent, last_spent) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, date_joined, coffee, total_load, total_spent, last_spent',
      [name, date_joined, coffee, total_load, total_spent, last_spent],
      (error, results) => {
        if(error) {
          reject(error);
          return;
        }
        // const updatedMembers = results.rows;
        // broadcastMembers(updatedMembers);
        // resolve({ id, name: name })
        pool.query('SELECT * FROM members ORDER BY id DESC', (error, results) => {
          if(error) {
            reject(error);
            return;
          }
          const updatedMembers = results.rows;
          broadcastMembers(updatedMembers);
        });
      }
    )
  })
}

function addExpenses(newExpenses) {
  return new Promise((resolve, reject) => {
    console.log('newExpenses', newExpenses)
    const { expense, month, date, amount, channel } = newExpenses;
    pool.query(
      'INSERT INTO expenses (expense, month, date, amount, channel) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [expense, month, date, amount, channel],
      (error, results) => {
        if(error) {
          reject(error);
          return;
        }
        const newExpense = results.rows[0];
        resolve(newExpense);
      }
    )
  })
}

function handleAddExpensesResponse(data) {
  const { expense, totalSum } = data;
  console.log('Newly added expense:', expense);
  console.log('Total sum of expenses:', totalSum);
}

function addTransactionSalesToDatabase(sale) {
  return new Promise((resolve, reject) => {
    const localDatetime = moment().tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss'); // Convert to local time

    const query = `
      INSERT INTO sales (transactionId, orders, qty, total, datetime, customer, computer, subtotal, credit)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const values = [
      sale.transactionId,
      JSON.stringify(sale.orders),
      sale.qty,
      sale.total,
      localDatetime, // Use the local datetime here
      sale.customer,
      sale.computer,
      sale.subtotal,
      sale.credit
    ];

    pool.query(query, values, (error, results) => {
      if (error) {
        reject(error);
      } else {
        resolve(results.rows[0]);
      }
    });
  });
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

function addFoodStock(updateFoodStock) {
  return new Promise((resolve, reject) => {
    console.log('updateFoodStock', updateFoodStock);
    const { id, stocks } = updateFoodStock;
    pool.query(
      'UPDATE foods SET stocks = $1 WHERE id = $2',
      [stocks, id],
      (error, results) => {
        if(error) {
          console.error('Error updating food stock:', error);
          reject(error);
          return;
        }
        resolve();
        broadcastFoods();
      }
    )
  })
}

function broadcastExpenses(updatedExpenses) {
  wss.clients.forEach((client) => {
    if(client.readyState === WebSocket.OPEN) {
      websocketHandlers.sendExpensesToClient(client, updatedExpenses);
      console.log('Broadcasting updated expenses to client:', updatedExpenses);
    }
  })
}

function broadcastMembers(updatedMembers) {
  wss.clients.forEach((client) => {
    if(client.readyState === WebSocket.OPEN) {
      membersHandler.sendMembersToClient(client);
      console.log('Broadcasting updated members to client:', updatedMembers);
    }
  })
}

function broadcastFoods(addFood) {
  wss.clients.forEach((client) => {
    if(client.readyState === WebSocket.OPEN) {
      websocketHandlers.sendFoodsToClient(client, addFood);
      console.log('Broadcasting updated foods to client:', addFood);
    }
  })
}

function broadcastInventory(addInventory) {
  wss.clients.forEach((client) => {
    if(client.readyState === WebSocket.OPEN) {
      websocketHandlers.sendInventoryToClient(client);
      console.log('Broadcasting updated inventory to client:', addInventory);
    }
  })
}

function broadcastSales(addSales) {
  wss.clients.forEach((client) => {
    if(client.readyState === WebSocket.OPEN) {
      websocketHandlers.sendSalesToClient(client, addSales);
      console.log('Broadcasting updated sales to client:', addSales)
    }
  })
}