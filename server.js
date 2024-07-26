// server.js
const moment = require('moment-timezone');
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const pool = require('./db');
const app = express();
const port = 8080;
const wss = new WebSocket.Server({ port });
const websocketHandlers = require('./websocketHandlers');
const productsHandler = require('./handlers/productsHandler');
const salesHandler = require('./handlers/salesHandler');
const membersHandler = require('./handlers/membersHandler');
const uploadExpenses = require('./routes/expenses')

const multer = require('multer');
const path = require('path');

// Set up multer for file storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Folder where images will be saved
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Appending extension
    }
});

const upload = multer({ storage: storage });

app.use(cors());
app.use('/upload', uploadExpenses)

wss.on('listening', () => { 
  console.log(`WebSocket server is listening on port ${port}`); 
});

wss.on('connection', (ws) => {
  console.log('Client connected');
  websocketHandlers.sendAccessToClient(ws);
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
            broadcastProducts(wss);
          })
          .catch((error) => {
            console.error('Error adding product to database:', error);
          });
        break;
      case 'editProduct':
        productsHandler.editProductInDatabase(data.product)
          .then(() => {
            broadcastProducts(wss);
          })
          .catch((error) => {
            console.error('Error editing product in database:', error);
          });
        break;
      case 'addFood':
        addFoodToDatabase(data.food)
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
            broadcastSalesCredit(updatedSale);
          })
          .catch((error) => {
            console.error('Error updating sales in database:', error);
          });
        break;
      case 'editSalesLoad':
        editSalesLoad(data.product)
          .then(() => {
            broadcastSales();
          });
        break;
        case 'addInventory':
          addInventory(data.inventory)
            .then((updatedInventory) => {
              broadcastInventory(updatedInventory); // Broadcast updated inventory after adding new item
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
            .then(async (newExpense) => {
                console.log('Expense added successfully:', newExpense);
                const totalExpenses = await getSumOfExpensesForCurrentDate();
                broadcastExpenses({ newExpense, totalExpenses });
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
            updateMembersAfterSale();            
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
            // Send error message to the client
            ws.send(JSON.stringify({ action: 'errorResponse', error: error }));
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

function addFoodToDatabase(newFood) {
  return new Promise((resolve, reject) => {
    const { product, price, stocks, utensils } = newFood;
    pool.query(
      'INSERT INTO foods (product, price, stocks, utensils) VALUES ($1, $2, $3, $4) RETURNING id, product, price, stocks, utensils',
      [product, price, stocks, utensils],
      (error, results) => {
        if(error) {
          reject(error);
          return;
        }
        const { id, product, price, stocks, utensils } = results.rows[0];
        pool.query('SELECT * FROM foods ORDER BY id DESC', (error, results) => {
          if(error) {
            reject(error);
            return
          }
          const updatedFoods = results.rows;
          broadcastFoods(updatedFoods);
          resolve({ id, product, price, stocks, utensils })
        })
      }
    )
  })
}

function editSalesLoad(updatedLoad) {
  console.log('sales id', updatedLoad.id)
  return new Promise((resolve, reject) => {
    const { id, transactionid, orders, qty, datetime, customer, computer, subtotal, credit, mode_of_payment, student_discount, discount } = updatedLoad;
    const total = parseFloat(subtotal) + parseFloat(computer);

    pool.query(
      `UPDATE sales
       SET transactionid = $1, orders = $2, qty = $3, total = $4, datetime = $5, customer = $6, computer = $7, subtotal = $8, credit = $9, mode_of_payment = $10, student_discount = $11, discount = $12 WHERE id = $13`,
      [transactionid, JSON.stringify(orders), qty, total, datetime, customer, computer, subtotal, credit, mode_of_payment, student_discount, discount, id],
      (error, results) => {
        if (error) {
          console.error('Error updating sales:', error);
          reject(error);
          return;
        }
        console.log('data', updatedLoad)
        resolve();
        broadcastSales();
      }
    );
  });
}

function editFood(updatedFood) {
  return new Promise((resolve, reject) => {
    const { id, product, stocks, price, utensils } = updatedFood;
    pool.query(
      'UPDATE foods SET product = $1, stocks = $2, price = $3, utensils = $4 WHERE id = $5',
      [product, stocks, price, utensils, id],
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
    const { name, date_joined, coffee, total_load, total_spent, last_spent, current_load } = newMember;
    
    // Check if the member already exists
    pool.query(
      'SELECT id FROM members WHERE name = $1',
      [name],
      (error, results) => {
        if (error) {
          console.log('aaa', error)
          reject(error);
          return;
        }
        
        // If member with the same name exists, reject with a custom error
        if (results.rows.length > 0) {
          const errorMessage = 'Member already exists';
          console.log('error', errorMessage)
          reject(errorMessage);
          return;
        }

        // Otherwise, insert the new member
        pool.query(
          'INSERT INTO members (name, date_joined, coffee, total_load, total_spent, last_spent, current_load) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, date_joined, coffee, total_load, total_spent, last_spent, current_load',
          [name, date_joined, coffee, total_load, total_spent, last_spent, current_load],
          (error, results) => {
            if (error) {
              reject(error);
              return;
            }
            // Fetch updated list of members after insertion
            pool.query('SELECT * FROM members ORDER BY name ASC', (error, results) => {
              if (error) {
                reject(error);
                return;
              }
              const updatedMembers = results.rows;
              console.log('add member', updatedMembers)
              broadcastMembers(updatedMembers);
              resolve(updatedMembers); // Resolve with updated member list
            });
          }
        );
      }
    );
  });
}

function addExpenses(newExpenses) {
  return new Promise((resolve, reject) => {
      const { expense, month, date, amount, mode_of_payment, image_path, credit, paid_by, settled_by } = newExpenses;
      pool.query(
          'INSERT INTO expenses (expense, month, date, amount, mode_of_payment, image_path, credit, paid_by, settled_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
          [expense, month, date, amount, mode_of_payment, image_path, credit, paid_by, settled_by],
          (error, results) => {
              if (error) {
                  console.error('Database query error:', error);
                  reject(error);
                  return;
              }
              const newExpense = results.rows[0];
              console.log('New expense added:', newExpense);
              resolve(newExpense);

              wss.clients.forEach(client => {
                  if (client.readyState === WebSocket.OPEN) {
                      client.send(JSON.stringify({ action: 'addExpensesResponse', expense: newExpense }));
                  }
              });
          }
      );
  });
}

function handleAddExpensesResponse(data) {
  const { expense, totalSum } = data;
  console.log('Newly added expense:', expense);
  console.log('Total sum of expenses:', totalSum);
}

async function getSumOfExpensesForCurrentDate() {
  const setTimezoneQuery = "SET TIME ZONE 'Asia/Manila';";
  const queryText = `
    SELECT COALESCE(SUM(amount::numeric), 0) AS total_expenses
    FROM expenses
    WHERE DATE(date AT TIME ZONE 'Asia/Manila') = CURRENT_DATE;
  `;

  await pool.query(setTimezoneQuery);
  const { rows } = await pool.query(queryText);
  return rows[0].total_expenses;
}

const addTransactionSalesToDatabase = (sale) => {
  return new Promise((resolve, reject) => {
    const localDatetime = moment().tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss'); // Convert to local time

    const query = `
      INSERT INTO sales (transactionId, orders, qty, total, datetime, customer, computer, subtotal, credit, mode_of_payment, student_discount, discount)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
      sale.credit,
      sale.mode_of_payment,
      sale.student_discount,
      sale.discount
    ];

    console.log('new sale', values)

    pool.query(query, values, (error, results) => {
      if (error) {
        reject(error);
      } else {
        const insertedSale = results.rows[0];
        const productNames = sale.orders.map(order => order.product);

        // Fetch product details to check for barista and utensils flags
        const baristaProductsQuery = 'SELECT product FROM products WHERE product = ANY($1) AND barista = true';
        const utensilsProductsQuery = 'SELECT product FROM foods WHERE product = ANY($1) AND utensils = true';

        pool.query(baristaProductsQuery, [productNames], (baristaError, baristaResults) => {
          if (baristaError) {
            reject(baristaError);
          } else {
            pool.query(utensilsProductsQuery, [productNames], (utensilsError, utensilsResults) => {
              if (utensilsError) {
                reject(utensilsError);
              } else {
                // Calculate total quantities for barista and utensils products
                const totalBaristaQuantity = sale.orders
                  .filter(order => baristaResults.rows.some(bp => bp.product === order.product))
                  .reduce((sum, order) => sum + order.quantity, 0);

                const totalUtensilsQuantity = sale.orders
                  .filter(order => utensilsResults.rows.some(up => up.product === order.product))
                  .reduce((sum, order) => sum + order.quantity, 0);

                let baristaPromise = Promise.resolve();
                let utensilsPromise = Promise.resolve();

                if (totalBaristaQuantity > 0) {
                  // Deduct inventory for "straw", "lids", and "cups" based on the totalBaristaQuantity
                  const updateInventoryBaristaQuery = `
                    UPDATE inventory
                    SET stocks = GREATEST(stocks - $1, 0)
                    WHERE product IN ('straw', 'lids', 'cups')
                    RETURNING *
                  `;

                  baristaPromise = new Promise((resolve, reject) => {
                    pool.query(updateInventoryBaristaQuery, [totalBaristaQuantity], (updateError, updateResults) => {
                      if (updateError) {
                        reject(updateError);
                      } else {
                        resolve();
                      }
                    });
                  });
                }

                if (totalUtensilsQuantity > 0) {
                  // Deduct inventory for "forks" based on the totalUtensilsQuantity
                  const updateInventoryUtensilsQuery = `
                    UPDATE inventory
                    SET stocks = GREATEST(stocks - $1, 0)
                    WHERE product = 'forks'
                    RETURNING *
                  `;

                  utensilsPromise = new Promise((resolve, reject) => {
                    pool.query(updateInventoryUtensilsQuery, [totalUtensilsQuantity], (updateError, updateResults) => {
                      if (updateError) {
                        reject(updateError);
                      } else {
                        resolve();
                      }
                    });
                  });
                }

                // Wait for both promises to resolve before resolving the main promise
                Promise.all([baristaPromise, utensilsPromise])
                  .then(() => resolve(insertedSale))
                  .catch(reject);
              }
            });
          }
        });
      }
    });
  });
};

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
          resolve(updatedInventory);
        });
      }
    );
  });
}

function addStock(updateInventory) {
  return new Promise((resolve, reject) => {
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
    const { id, stocks } = updateFoodStock;
    pool.query(
      'UPDATE foods SET stocks = $1 WHERE id = $2',
      [stocks, id],
      (error, results) => {
        if (error) {
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
    if (client.readyState === WebSocket.OPEN) {
      websocketHandlers.sendExpensesToClient(client, updatedExpenses);
    }
  })
}

function broadcastMembers(updatedMembers) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      membersHandler.sendMembersToClient(client);
    }
  })
}

function broadcastFoods(addFood) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      websocketHandlers.sendFoodsToClient(client, addFood);
      console.log('Broadcasting updated foods to client:', addFood);
    }
  })
}

function updateMembersAfterSale() {
  pool.query(`
    WITH member_sales AS (
      SELECT 
        customer,
        MAX(datetime AT TIME ZONE 'Asia/Manila') AS last_spent,
        SUM(computer::numeric) AS total_computer,
        SUM(subtotal::numeric) AS total_subtotal
      FROM 
        sales
      GROUP BY 
        customer
    )
    UPDATE members
    SET 
      total_load = ms.total_computer,
      coffee = ms.total_subtotal,
      total_spent = ms.total_computer + ms.total_subtotal,
      last_spent = ms.last_spent
    FROM 
      member_sales ms
    WHERE 
      members.name = ms.customer;
  `, (error, results) => {
    if (error) {
      console.error('Error updating members after sale:', error);
      return;
    }
    
    // Broadcast updated members
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        membersHandler.sendMembersToClient(client);
      }
    });
  });
}

function broadcastProducts() {
  if (!wss || !wss.clients) {
    console.error('WebSocket Server or clients are not defined.');
    return;
  }
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      productsHandler.sendProductsToClient(client);
    }
  });
}

function broadcastInventory(updatedInventory) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      // websocketHandlers.sendInventoryToClient(client, updatedInventory);
      client.send(JSON.stringify({
        action: 'updatedInventory',
        data: updatedInventory
      }))
    }
  });
}

function broadcastSales(newSale) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        action: 'newSale',
        data: newSale
      }));
    }
  });
}

function broadcastSalesCredit(updatedSale) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ action: 'updateSale', data: updatedSale }));
    }
  });
}
