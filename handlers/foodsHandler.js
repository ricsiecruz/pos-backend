const pool = require('../db');

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

function editFood(updatedFood) {
  return new Promise((resolve, reject) => {
    const { id, product, price, utensils } = updatedFood;
    pool.query(
      'UPDATE foods SET product = $1, price = $2, utensils = $3 WHERE id = $4',
      [product, price, utensils, id],
      (error, results) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      }
    )

  })
}

module.exports = {
    addFoodToDatabase,
    editFood
}