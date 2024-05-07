const { Pool } = require('pg');

const pool = new Pool({
  user: 'user',
  host: 'host',
  database: 'database',
  password: 'password',
  port: 1234,
});

module.exports = pool;
