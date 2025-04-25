const express = require('express');
const moment = require('moment-timezone');
const poolPromise = require('../db');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Upload route to update balances from Excel
router.post('/upload', upload.single('file'), async (req, res) => {
  const pool = await poolPromise;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const buffer = req.file.buffer;
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    for (const row of data) {
      const username = (row[7] || '').toLowerCase(); // Column H
      const balance = row[41]; // Column AP

      if (!username || !balance) continue;

      const balanceNumeric = parseFloat(balance.toString().replace(/[^0-9.-]+/g, ""));
      if (isNaN(balanceNumeric)) continue;

      const queryText = `
        UPDATE members
        SET current_load = $1
        WHERE LOWER(name) = LOWER($2)
      `;
      await pool.query(queryText, [balanceNumeric, username]);
    }

    res.status(200).json({ message: 'Members updated successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all members
router.get('/', async (req, res) => {
  const pool = await poolPromise;

  try {
    const result = await pool.query('SELECT * FROM members');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching members:', err);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// Paginated member list
router.post('/', async (req, res) => {
  const pool = await poolPromise;
  const { page = 1, limit = 10 } = req.body;

  try {
    const offset = (page - 1) * limit;

    const totalResult = await pool.query('SELECT COUNT(*) FROM members');
    const totalRecords = parseInt(totalResult.rows[0].count, 10);
    const totalPages = Math.ceil(totalRecords / limit);

    const results = await pool.query(
      'SELECT * FROM members ORDER BY id DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );

    res.status(200).json({
      data: results.rows,
      totalRecords,
      totalPages,
      pageNumber: page
    });
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add new member
router.post('/add', async (req, res) => {
  const pool = await poolPromise;

  try {
    const {
      name,
      email = null,
      date_joined,
      coffee = 0,
      total_load = 0,
      total_spent = 0,
      last_spent,
      current_load = 0
    } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Name is required and must be a string' });
    }

    if (email !== null && typeof email !== 'string') {
      return res.status(400).json({ error: 'Email must be a string if provided' });
    }

    const cleanEmail = email && email.trim() === '' ? null : email;

    if (!date_joined || isNaN(Date.parse(date_joined))) {
      return res.status(400).json({ error: 'Invalid or missing date_joined' });
    }

    if (!last_spent || isNaN(Date.parse(last_spent))) {
      return res.status(400).json({ error: 'Invalid or missing last_spent' });
    }

    const queryText = `
      INSERT INTO members (
        name, email, date_joined, coffee, total_load, total_spent, last_spent, current_load
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      name,
      cleanEmail,
      new Date(date_joined),
      coffee,
      total_load,
      total_spent,
      new Date(last_spent),
      current_load
    ];

    const result = await pool.query(queryText, values);
    res.status(201).json({
      message: 'Member added successfully',
      member: result.rows[0]
    });
  } catch (error) {
    console.error('Error adding member:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Member details with paginated transactions
router.post('/:id', async (req, res) => {
  const pool = await poolPromise;
  const id = parseInt(req.params.id);

  // 🚨 Validate ID before using it
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid member ID' });
  }

  const { page = 1, limit = 10 } = req.body;

  try {
    const memberResult = await pool.query('SELECT * FROM members WHERE id = $1', [id]);
    const member = memberResult.rows[0];

    if (!member) return res.status(404).json({ error: 'Member not found' });

    const offset = (page - 1) * limit;

    const transactionsQuery = `
      SELECT 
        datetime AT TIME ZONE 'Asia/Manila' AS datetime,
        total::numeric AS total,
        subtotal::numeric AS subtotal,
        computer::numeric AS computer,
        orders::jsonb AS orders,
        (
          SELECT SUM((order_item->>'quantity')::numeric)
          FROM jsonb_array_elements(orders) AS order_item
        ) AS qty
      FROM sales
      WHERE customer = $1
      ORDER BY datetime DESC
      LIMIT $2 OFFSET $3
    `;

    const countQuery = `SELECT COUNT(*) FROM sales WHERE customer = $1`;

    const [transactionsResult, countResult] = await Promise.all([
      pool.query(transactionsQuery, [member.name, limit, offset]),
      pool.query(countQuery, [member.name])
    ]);

    const totalRecords = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(totalRecords / limit);

    const formatter = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const transactions = transactionsResult.rows.map(row => ({
      ...row,
      total: formatter.format(row.total),
      subtotal: formatter.format(row.subtotal),
      computer: formatter.format(row.computer),
      qty: row.qty,
      datetime: moment(row.datetime).tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss'),
    }));

    member.transactions = transactions;
    member.totalRecords = totalRecords;
    member.totalPages = totalPages;
    member.pageNumber = page;

    res.status(200).json(member);
  } catch (error) {
    console.error('Error fetching member details or transactions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});



// Delete a member by ID
router.delete('/:id', async (req, res) => {
  const pool = await poolPromise;
  const id = parseInt(req.params.id);

  try {
    await pool.query('DELETE FROM members WHERE id = $1', [id]);
    res.status(200).json({ message: `Member deleted with ID: ${id}` });
  } catch (error) {
    console.error('Error deleting member:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
