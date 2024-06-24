const pool = require('../db');

function updateSalesInDatabase(updatedSales) {
    return new Promise((resolve, reject) => {
      const { id, transactionid, orders, qty, total, datetime, customer, computer, subtotal, credit } = updatedSales;
      pool.query(
        'UPDATE sales SET transactionid = $1, orders = $2, qty = $3, total = $4, datetime = $5, customer = $6, computer = $7, subtotal = $8, credit = $9 WHERE id = $10',
        [transactionid, JSON.stringify(orders), qty, total, datetime, customer, computer, subtotal, credit, id],
        (error, results) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(results.rows[0]);
        }
      );
    });
}

module.exports = {
    updateSalesInDatabase
}