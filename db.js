const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'pos',
  password: 'R1cs1e09',
  port: 5432,
});

module.exports = pool;
