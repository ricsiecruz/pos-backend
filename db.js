const { Pool, Client } = require('pg');
require('dotenv').config();

const dbName = process.env.DB_DATABASE || 'pos';

async function createDatabaseIfNotExists() {
  const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: 'postgres',
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
  });

  try {
    await client.connect();
    const res = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (res.rowCount === 0) {
      console.log(`Database "${dbName}" does not exist. Creating...`);
      await client.query(`CREATE DATABASE ${dbName}`);
      console.log(`✅ Database "${dbName}" created successfully.`);
    } else {
      console.log(`✅ Database "${dbName}" already exists.`);
    }
  } catch (err) {
    console.error('Error checking or creating database:', err);
  } finally {
    await client.end();
  }
}

async function createTablesIfNotExist(pool) {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS members (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        product VARCHAR(255) NOT NULL,
        price NUMERIC(10, 2),
        stocks NUMERIC DEFAULT 0
      )
    `);

    console.log(`✅ Tables "members" and "products" exist or were created.`);
  } catch (err) {
    console.error('Error creating tables:', err);
  }
}


const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: dbName,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: false,
});

// Kick off the setup
(async () => {
  await createDatabaseIfNotExists();
  await createTablesIfNotExist(pool);
})();

module.exports = pool; // ✅ exports a real pool now
