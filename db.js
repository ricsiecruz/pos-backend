const { Pool, Client } = require("pg");
require("dotenv").config();

const dbName = process.env.DB_DATABASE || "pos";

// Function to create database if it doesn't exist
async function createDatabaseIfNotExists() {
  const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: "postgres", // default DB to connect to initially
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
  });

  try {
    await client.connect();
    const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);

    if (res.rowCount === 0) {
      console.log(`Database "${dbName}" does not exist. Creating...`);
      await client.query(`CREATE DATABASE ${dbName}`);
      console.log(`✅ Database "${dbName}" created successfully.`);
    } else {
      console.log(`✅ Database "${dbName}" already exists.`);
    }
  } catch (err) {
    console.error("❌ Error checking or creating database:", err);
  } finally {
    await client.end();
  }
}

// Function to create required tables
async function createTablesIfNotExist(pool) {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mode_of_payment (
      id SERIAL PRIMARY KEY,
      mode_of_payment VARCHAR(255)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS paid_by (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255)
      )
    `);

    // === WHITELIST TABLE ===
    await pool.query(`
      CREATE TABLE IF NOT EXISTS whitelist (
        id SERIAL PRIMARY KEY,
        imei VARCHAR(20) UNIQUE NOT NULL,
        ip VARCHAR(45),
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log(`✅ Table "whitelist" created/verified.`);

    // === MEMBERS TABLE ===
    await pool.query(`
      CREATE TABLE IF NOT EXISTS members (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        date_joined TIMESTAMP,
        total_load NUMERIC DEFAULT 0,
        coffee NUMERIC DEFAULT 0,
        total_spent NUMERIC DEFAULT 0,
        last_spent TIMESTAMP,
        current_load NUMERIC DEFAULT 0
      );
    `);

    // ✅ Ensure email column allows NULL if previously set to NOT NULL
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'members'
          AND column_name = 'email'
          AND is_nullable = 'NO'
        ) THEN
          ALTER TABLE members ALTER COLUMN email DROP NOT NULL;
        END IF;
      END
      $$;
    `);

    // === FOODS TABLE ===
    await pool.query(`
      CREATE TABLE IF NOT EXISTS foods (
        id SERIAL PRIMARY KEY,
        product VARCHAR(255) NOT NULL,
        price NUMERIC(10, 2) NOT NULL,
        stocks INTEGER DEFAULT 0,
        available BOOLEAN DEFAULT TRUE,
        utensils BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log(`✅ Table "foods" created/verified.`);

    // Add extra member fields if missing
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='members' AND column_name='date_joined') THEN
          ALTER TABLE members ADD COLUMN date_joined TIMESTAMP;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='members' AND column_name='coffee') THEN
          ALTER TABLE members ADD COLUMN coffee NUMERIC DEFAULT 0;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='members' AND column_name='total_load') THEN
          ALTER TABLE members ADD COLUMN total_load NUMERIC DEFAULT 0;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='members' AND column_name='total_spent') THEN
          ALTER TABLE members ADD COLUMN total_spent NUMERIC DEFAULT 0;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='members' AND column_name='last_spent') THEN
          ALTER TABLE members ADD COLUMN last_spent TIMESTAMP;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='members' AND column_name='current_load') THEN
          ALTER TABLE members ADD COLUMN current_load NUMERIC DEFAULT 0;
        END IF;
      END
      $$;
    `);

    // === BEVERAGE TABLE ===
    await pool.query(`
      CREATE TABLE IF NOT EXISTS beverage (
        id SERIAL PRIMARY KEY,
        product VARCHAR(100) NOT NULL,
        price NUMERIC(10, 2) NOT NULL,
        stocks INTEGER DEFAULT 0,
        available BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log(`✅ Table "beverage" created/verified.`);

    // === PRODUCTS TABLE ===
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        product VARCHAR(255) NOT NULL,
        price NUMERIC(10, 2),
        stocks NUMERIC DEFAULT 0,
        barista BOOLEAN DEFAULT TRUE
      )
    `);

    // === SALES TABLE ===
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        transactionid VARCHAR(255),
        orders JSONB,
        qty INT,
        total NUMERIC(10, 2),
        datetime TIMESTAMP,
        customer VARCHAR(255),
        computer NUMERIC(10, 2),
        ps4 NUMERIC(10, 2),
        mode_of_payment VARCHAR(50),
        credit NUMERIC(10, 2),
        student_discount BOOLEAN,
        discount NUMERIC(10, 2),
        subtotal NUMERIC(10, 2)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        expense VARCHAR(255),
        month VARCHAR(20),
        date DATE,
        amount NUMERIC(10, 2),
        mode_of_payment VARCHAR(50),
        credit BOOLEAN DEFAULT FALSE,
        paid_by VARCHAR(255),
        settled_by VARCHAR(255),
        image_path TEXT,
        date_settled TIMESTAMP WITH TIME ZONE
      )
    `);

    console.log(`✅ Table "sales" created/verified.`);

    console.log(`✅ Tables "members" and "products" created/verified.`);
  } catch (err) {
    console.error("❌ Error creating tables:", err);
  }
}

// === Connect Pool ===
// prod
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// local
// const pool = new Pool({
//   user: process.env.DB_USER,
//   host: process.env.DB_HOST,
//   database: dbName,
//   password: process.env.DB_PASSWORD,
//   port: process.env.DB_PORT,
//   ssl: false, // or true if using Vercel with Neon (enable if needed)
// });

// === Init Setup ===
(async () => {
  await createDatabaseIfNotExists();
  await createTablesIfNotExist(pool);
})();

module.exports = pool;
