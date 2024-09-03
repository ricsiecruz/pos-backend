const express = require('express');
const pool = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  console.log('kaha')
  // pool.query('SELECT * FROM kaha', (error, results) => {
  //   if (error) {
  //     throw error;
  //   }
  //   res.status(200).json(results.rows);
  //   // console.log('get kaha', results)
  // });
});

router.post('/', (req, res) => {
    const { amount } = req.body;
  
    pool.query('INSERT INTO kaha (amount) VALUES ($1)', [amount], (error, results) => {
      if (error) {
        throw error;
      }
      res.status(201).send(`kaha added with ID: ${results}`);
    });
});

router.put('/', (req, res) => {
    const { amount } = req.body;
  
    pool.query(
      'UPDATE kaha SET amount = $1',
      [amount],
      (error, results) => {
        if (error) {
          throw error;
        }
        res.status(200).send(`kaha updated`);
      }
    );
});

module.exports = router;