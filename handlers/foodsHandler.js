const pool = require('../db');

function addFoodToDatabase(newFood) {
    return new Promise((resolve, reject) => {
      const { product, price, stocks } = newFood;
      pool.query(
        'INSERT INTO foods (product, price, stocks) VALUES ($1, $2, $3) RETURNING id, product, price, stocks',
        [product, price, stocks],
        (error, results) => {
          if(error) {
            reject(error);
            return;
          }
          const { id, product, price, stocks } = results.rows[0];
          pool.query('SELECT * FROM foods ORDER BY id DESC', (error, results) => {
            if(error) {
              reject(error);
              return
            }
            const updatedFoods = results.rows;
            broadcastFoods(updatedFoods);
            resolve({ id, product, price, stocks })
          })
        }
      )
    })
}

function editFood(updatedFood) {
  return new Promise((resolve, reject) => {
    console.log('updated foods', updatedFood);
    const { id, product, price } = updatedFood;
    pool.query(
      'UPDATE foods SET product = $1, price = $2 WHERE id = $3',
      [product, price, id],
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