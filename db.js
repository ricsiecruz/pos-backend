const { Pool, Client } = require('pg');
require('dotenv').config();

const dbName = process.env.DB_DATABASE || 'pos';

// Function to create database if it doesn't exist
async function createDatabaseIfNotExists() {
  const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: 'postgres', // Connect to the default DB to create a new one
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

// Function to create required tables
async function createTablesIfNotExist(pool) {
  try {
    // Create whitelist table with "ip" column
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whitelist (
        id SERIAL PRIMARY KEY,
        imei VARCHAR(20) UNIQUE NOT NULL,
        ip VARCHAR(45),
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log(`✅ Table "whitelist" exists or was created.`);

    // Ensure additional columns in case table existed before
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='whitelist' AND column_name='ip'
        ) THEN
          ALTER TABLE whitelist ADD COLUMN ip VARCHAR(45);
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='whitelist' AND column_name='enabled'
        ) THEN
          ALTER TABLE whitelist ADD COLUMN enabled BOOLEAN DEFAULT TRUE;
        END IF;
      END
      $$;
    `);

    // Create members table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS members (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create products table
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

// Create the pool
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: dbName,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: false, // Disable SSL for local dev
});

// Kick off the setup when this file is required
(async () => {
  await createDatabaseIfNotExists();
  await createTablesIfNotExist(pool);
})();

// Export the pool for use in other files
module.exports = pool;
