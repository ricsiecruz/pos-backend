const pool = require('../db');

function updateSalesInDatabase(updatedSale) {
  return new Promise((resolve, reject) => {
    const { id, transactionid, orders, qty, total, datetime, customer, computer, subtotal, credit, mode_of_payment, student_discount, discount } = updatedSale;
    const formattedCredit = parseFloat(credit).toFixed(2); // Format credit with two decimal places
    
    pool.query(
      'UPDATE sales SET transactionid = $1, orders = $2, qty = $3, total = $4, datetime = $5, customer = $6, computer = $7, subtotal = $8, credit = $9, mode_of_payment = $10, student_discount = $11, discount = $12 WHERE id = $13',
      [transactionid, JSON.stringify(orders), qty, total, datetime, customer, computer, subtotal, formattedCredit, mode_of_payment, student_discount, discount, id],
      (error, results) => {
        if (error) {
          reject(error);
          return;
        }

        if (results.rowCount > 0) {
          resolve({ success: true, message: 'Update successful' });
        } else {
          resolve({ success: false, message: 'No rows were affected' });
        }
      }
    );
  });
}

module.exports = {
  updateSalesInDatabase
};
