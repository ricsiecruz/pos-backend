// index.js
const express = require('express');
const cors = require('cors');
const moment = require('moment-timezone');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const path = require('path');
const pool = require('./db');
const app = express();
const port = 3000;

// Import routes
const dashboardRoutes = require('./routes/dashboard');
const userRoutes = require('./routes/queries');
const inventoryRoutes = require('./routes/inventory');
const productsRoutes = require('./routes/products');
const expensesRoutes = require('./routes/expenses');
const salesRoutes = require('./routes/sales');
const membersRoutes = require('./routes/members');
const foodsRoutes = require('./routes/foods');
const beverageRoutes = require('./routes/beverage');
const whitelistRoutes = require('./routes/whitelist');
const kahaRoutes = require('./routes/kaha');

// WebSocket server setup
const server = app.listen(port, () => {
  console.log(`App running on port ${port}.`);
});

const wss = new WebSocket.Server({ server });
const websocketHandlers = require('./websocketHandlers');
const productsHandler = require('./handlers/productsHandler');
const salesHandler = require('./handlers/salesHandler');
const membersHandler = require('./handlers/membersHandler');

// Serve the uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(cors({
  // origin: 'http://localhost:4200', // or your deployed frontend URL
  origin: 'https://ricsiecruz.github.io',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// HTTP Routes
app.use('/users', userRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/products', productsRoutes);
app.use('/expenses', expensesRoutes(wss)); // Pass WebSocket server instance
app.use('/sales', salesRoutes);
app.use('/members', membersRoutes);
app.use('/foods', foodsRoutes);
app.use('/beverage', beverageRoutes);
app.use('/whitelist', whitelistRoutes);
app.use('/kaha', kahaRoutes);

wss.on('connection', (ws, req) => {
  console.log('Client connected');
  productsHandler.sendProductsToClient(ws);
  websocketHandlers.sendSalesToClient(ws);
  websocketHandlers.sendInventoryToClient(ws);
  websocketHandlers.sendFoodsToClient(ws);
  websocketHandlers.sendBeverageToClient(ws);
  websocketHandlers.sendExpensesToClient(ws);
  membersHandler.sendMembersToClient(ws);

  ws.on('message', async (message) => {
    console.log('Received:', message);
    const data = JSON.parse(message);
    if (message.action === 'checkAccess') {
      try {
        const access = await getWhitelistFromDatabase(req);
        ws.send(JSON.stringify(access));
      } catch (error) {
        ws.send(JSON.stringify({ message: 'fail' }));
      }
    }
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
      case 'addBeverage':
        addBeverageToDatabase(data.beverage)
          .then((updatedBeverageStock) => {
            broadcastBeverage(updatedBeverageStock);
          })
          .catch((error) => {
            console.error('Error adding beverage to database:', error);
          });
        break;
      case 'editBeverage':
        editBeverage(data.beverage)
          .then(() => {
            broadcastBeverage();
          })
          .catch((error) => {
            console.error('Error editing beverage to database:', error);
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
      case 'addBeverageStock':
        addBeverageStock(data.beverage)
          .then(() => {
            broadcastBeverage();
          })
          .catch((error) => {
            console.error('Error adding beverage stocks:', error)
          });
        break;
      case 'addExpenses':
        addExpenses(data.expense)
            .then(async (newExpense) => {
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

async function addFoodToDatabase(newFood) {
  try {
    const { product, price, stocks, utensils } = newFood;
    const result = await pool.query(
      'INSERT INTO foods (product, price, stocks, utensils) VALUES ($1, $2, $3, $4) RETURNING id, product, price, stocks, utensils',
      [product, price, stocks, utensils]
    );
    const { id } = result.rows[0];
    const updatedFoods = await pool.query('SELECT * FROM foods ORDER BY id DESC');
    broadcastFoods(updatedFoods.rows);
    return { id, product, price, stocks, utensils };
  } catch (error) {
    console.error('Error adding food to database:', error);
    throw error;
  }
}

async function addBeverageToDatabase(newBeverage) {
  try {
    const { product, price, stocks } = newBeverage;

    await pool.query(`
      CREATE TABLE IF NOT EXISTS beverage (
        id SERIAL PRIMARY KEY,
        product VARCHAR(255) UNIQUE NOT NULL,
        price NUMERIC(10, 2) DEFAULT NULL,
        stocks NUMERIC DEFAULT NULL
      );    
    `);

    const result = await pool.query(
      'INSERT INTO beverage (product, price, stocks) VALUES ($1, $2, $3) RETURNING id, product, price, stocks', 
      [product, price, stocks]
    );
    const { id } = result.rows[0];
    const updatedBeverage = await pool.query('SELECT * FROM beverage ORDER BY id DESC');
    broadcastBeverage(updatedBeverage.rows);
    return { id, product, price, stocks };
  } catch(error) {
    console.error('Error adding beverage to database:', error);
    throw error;
  }
}

function editSalesLoad(updatedLoad) {
  return new Promise((resolve, reject) => {
    const { id, transactionid, orders, qty, datetime, customer, computer, subtotal, credit, mode_of_payment, student_discount, discount } = updatedLoad;
    const total = parseFloat(subtotal) + parseFloat(computer);

    pool.query(
      `UPDATE sales
       SET transactionid = $1, orders = $2, qty = $3, total = $4, datetime = $5, customer = $6, computer = $7, subtotal = $8, credit = $9, mode_of_payment = $10, student_discount = $11, discount = $12 WHERE id = $13`,
      [transactionid, JSON.stringify(orders), qty, total, datetime, customer, computer, subtotal, credit, mode_of_payment, student_discount, discount, id],
      (error, results) => {
        if (error) {
          reject(error);
          return;
        }
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

function editBeverage(updatedBeverage) {
  return new Promise((resolve, reject) => {
    const { id, product, stocks, price } = updatedBeverage;
    pool.query(
      'UPDATE beverage SET product = $1, stocks = $2, price = $3 WHERE id = $4', 
      [product, stocks, price, id],
      (error, results) => {
        if(error) {
          reject(error);
          return;
        }
        resolve();
        broadcastBeverage();
      }
    )
  })
}

function addMemberToDatabase(newMember) {
  return new Promise((resolve, reject) => {
    const { name, date_joined, coffee, total_load, total_spent, last_spent, current_load } = newMember;
    
    pool.query(
      'SELECT id FROM members WHERE name = $1',
      [name],
      (error, results) => {
        if (error) {
          reject(error);
          return;
        }
        
        if (results.rows.length > 0) {
          const errorMessage = 'Member already exists';
          reject(errorMessage);
          return;
        }

        pool.query(
          'INSERT INTO members (name, date_joined, coffee, total_load, total_spent, last_spent, current_load) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, date_joined, coffee, total_load, total_spent, last_spent, current_load',
          [name, date_joined, coffee, total_load, total_spent, last_spent, current_load],
          (error, results) => {
            if (error) {
              reject(error);
              return;
            }
            
            pool.query('SELECT * FROM members ORDER BY id DESC', (error, results) => {
              if (error) {
                reject(error);
                return;
              }
              const updatedMembers = results.rows;
              broadcastMembers(updatedMembers);
              resolve(updatedMembers);
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
                  reject(error);
                  return;
              }
              const newExpense = results.rows[0];
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

    pool.connect((err, client, release) => {
      if (err) return reject(err);

      client.query('BEGIN', (beginError) => {
        if (beginError) {
          release();
          return reject(beginError);
        }

        // Check if the transactionId already exists
        const checkQuery = 'SELECT 1 FROM sales WHERE transactionid = $1';
        client.query(checkQuery, [sale.transactionid], (checkError, checkResults) => {
          if (checkError) {
            return client.query('ROLLBACK', () => {
              release();
              reject(checkError);
            });
          }

          if (checkResults.rows.length > 0) {
            console.log(`Sale with transactionid ${sale.transactionid} already exists.`);
            return client.query('ROLLBACK', () => {
              release();
              resolve(null); // Skip insertion or handle as needed
            });
          }

          // Proceed with insertion if no duplicate is found
          const query = `
            INSERT INTO sales (transactionid, orders, qty, total, datetime, customer, computer, ps4, subtotal, credit, mode_of_payment, student_discount, discount)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
          `;
          const values = [
            sale.transactionid,
            JSON.stringify(sale.orders),
            sale.qty,
            sale.total,
            localDatetime,
            sale.customer,
            sale.ps4,
            sale.computer,
            sale.subtotal,
            sale.credit,
            sale.mode_of_payment,
            sale.student_discount,
            sale.discount
          ];

          client.query(query, values, (error, results) => {
            if (error) {
              return client.query('ROLLBACK', () => {
                release();
                reject(error);
              });
            }

            const insertedSale = results.rows[0];
            const productNames = sale.orders.map(order => order.product);

            // Fetch product details to check for barista, utensils, and beverages
            const baristaProductsQuery = 'SELECT product FROM products WHERE product = ANY($1) AND barista = true';
            const utensilsProductsQuery = 'SELECT product FROM foods WHERE product = ANY($1) AND utensils = true';
            const beveragesQuery = 'SELECT product FROM beverage WHERE product = ANY($1)';

            client.query(baristaProductsQuery, [productNames], (baristaError, baristaResults) => {
              if (baristaError) {
                return client.query('ROLLBACK', () => {
                  release();
                  reject(baristaError);
                });
              }

              client.query(utensilsProductsQuery, [productNames], (utensilsError, utensilsResults) => {
                if (utensilsError) {
                  return client.query('ROLLBACK', () => {
                    release();
                    reject(utensilsError);
                  });
                }

                client.query(beveragesQuery, [productNames], (beveragesError, beveragesResults) => {
                  if (beveragesError) {
                    return client.query('ROLLBACK', () => {
                      release();
                      reject(beveragesError);
                    });
                  }

                  // Calculate total quantities for barista, utensils, and beverages
                  const totalBaristaQuantity = sale.orders
                    .filter(order => baristaResults.rows.some(bp => bp.product === order.product))
                    .reduce((sum, order) => sum + order.quantity, 0);

                  const totalUtensilsQuantity = sale.orders
                    .filter(order => utensilsResults.rows.some(up => up.product === order.product))
                    .reduce((sum, order) => sum + order.quantity, 0);

                  const totalBeverageQuantity = sale.orders
                    .filter(order => beveragesResults.rows.some(b => b.product === order.product))
                    .reduce((sum, order) => sum + order.quantity, 0);

                  let baristaPromise = Promise.resolve();
                  let utensilsPromise = Promise.resolve();
                  let beveragesPromise = Promise.resolve();

                  if (totalBaristaQuantity > 0) {
                    // Deduct inventory for "straw", "lids", and "cups" based on the totalBaristaQuantity
                    const updateInventoryBaristaQuery = `
                      UPDATE inventory
                      SET stocks = GREATEST(stocks - $1, 0)
                      WHERE product IN ('straw', 'lids', 'cups')
                      RETURNING *
                    `;

                    baristaPromise = new Promise((resolve, reject) => {
                      client.query(updateInventoryBaristaQuery, [totalBaristaQuantity], (updateError, updateResults) => {
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
                      client.query(updateInventoryUtensilsQuery, [totalUtensilsQuantity], (updateError, updateResults) => {
                        if (updateError) {
                          reject(updateError);
                        } else {
                          resolve();
                        }
                      });
                    });
                  }

                  if (totalBeverageQuantity > 0) {
                    // Deduct inventory for the beverages sold
                    const updateBeverageStocksQuery = `
                      UPDATE beverage
                      SET stocks = GREATEST(stocks - $1, 0)
                      WHERE product = ANY($2)
                      RETURNING *
                    `;

                    beveragesPromise = new Promise((resolve, reject) => {
                      client.query(updateBeverageStocksQuery, [totalBeverageQuantity, productNames], (updateError, updateResults) => {
                        if (updateError) {
                          reject(updateError);
                        } else {
                          broadcastBeverage()
                          resolve();
                        }
                      });
                    });
                  }

                  // Wait for all promises to resolve before committing the transaction
                  Promise.all([baristaPromise, utensilsPromise, beveragesPromise])
                    .then(() => {
                      client.query('COMMIT', (commitError) => {
                        release();
                        if (commitError) {
                          reject(commitError);
                        } else {
                          console.log('New sale added successfully');
                          resolve(insertedSale);
                        }
                      });
                    })
                    .catch((error) => {
                      client.query('ROLLBACK', () => {
                        release();
                        reject(error);
                      });
                    });
                });
              });
            });
          });
        });
      });
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
          reject(error);
          return;
        }
        resolve();
        broadcastFoods();
      }
    )
  })
}

function addBeverageStock(updateBeverageStock) {
  return new Promise((resolve, reject) => {
    const { id, stocks } = updateBeverageStock;
    pool.query(
      'UPDATE beverage SET stocks = $1 WHERE id = $2',
      [stocks, id],
      (error, results) => {
        if(error) {
          reject(error);
          return;
        }
        resolve();
        broadcastBeverage();
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
    }
  })
}

function broadcastBeverage(addBeverage) {
  wss.clients.forEach((client) => {
    if(client.readyState === WebSocket.OPEN) {
      websocketHandlers.sendBeverageToClient(client, addBeverage)
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
