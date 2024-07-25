const express = require('express');
const moment = require('moment-timezone');
const pool = require('../db');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    // Check if file is provided
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Parse the Excel file
    const buffer = req.file.buffer;
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    console.log('Parsed data:', data);

    // Update the database
    for (const row of data) {
      // Adjust indices based on actual data structure
      const username = (row[7] || '').toLowerCase();  // Column H (7)
      const balance = row[41];  // Column AP (41)

      // Validate row data
      if (!username || !balance) {
        console.warn('Skipping row due to missing data:', row);
        continue;
      }

      const balanceNumeric = parseFloat(balance.replace(/[^0-9.-]+/g, ""));
      if (isNaN(balanceNumeric)) {
        console.warn('Skipping row due to invalid balance:', row);
        continue;
      }

      const queryText = `
        UPDATE members
        SET current_load = $1
        WHERE LOWER(name) = LOWER($2)
      `;
      const result = await pool.query(queryText, [balanceNumeric, username]);

      console.log('Query result for', username, ':', result.rowCount);
    }

    res.status(200).json({ message: 'Members updated successfully.' });
  } catch (error) {
    console.error('Error updating members:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Route to fetch all members
router.get('/', (request, response) => {
  pool.query('SELECT * FROM members ORDER BY name ASC', (error, results) => {
    if (error) {
      console.error('Error fetching members from database:', error);
      return response.status(500).json({ error: 'Internal server error' });
    }
    const members = results.rows;
    response.status(200).json(members);
  });
});

// Route to fetch a specific member by ID
router.get('/:id', async (request, response) => {
  const id = parseInt(request.params.id);

  try {
    const memberQuery = 'SELECT * FROM members WHERE id = $1';
    const memberResults = await pool.query(memberQuery, [id]);
    const member = memberResults.rows[0];

    if (!member) {
      return response.status(404).json({ error: 'Member not found' });
    }

    const transactions = await getMemberSales(member.name);
    member.transactions = transactions;

    response.status(200).json(member);
  } catch (error) {
    console.error('Error fetching member and transactions from database:', error);
    response.status(500).json({ error: 'Internal server error' });
  }
});

// Route to add a new member
router.post('/', (request, response) => {
  try {
    const { name, date_joined, coffee, total_load, total_spent, last_spent, current_load } = request.body;

    if (!date_joined || isNaN(Date.parse(date_joined))) {
      console.error('Invalid or missing date_joined:', date_joined);
      return response.status(400).json({ error: 'Invalid or missing date_joined' });
    }

    if (!last_spent || isNaN(Date.parse(last_spent))) {
      console.error('Invalid or missing last_spent:', last_spent);
      return response.status(400).json({ error: 'Invalid or missing last_spent' });
    }

    const formattedDate = new Date(date_joined);
    const formattedLastSpent = new Date(last_spent);

    console.log('Formatted date_joined:', formattedDate);
    console.log('Formatted last_spent:', formattedLastSpent);

    pool.query(
      'INSERT INTO members (name, date_joined, coffee, total_load, total_spent, last_spent, current_load) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [name, formattedDate, coffee, total_load, total_spent, formattedLastSpent, current_load],
      (error, results) => {
        if (error) {
          throw error;
        }
        const insertedId = results.rows[0].id;
        response.status(201).json({ id: insertedId });
      }
    );
  } catch (error) {
    console.error('Error executing query:', error);
    response.status(500).json({ error: 'Internal Server Error' });
  }
});

// Route to delete a member by ID
router.delete('/:id', (request, response) => {
  const id = parseInt(request.params.id);

  pool.query('DELETE FROM members WHERE id = $1', [id], (error, results) => {
    if (error) {
      console.error('Error deleting member from database:', error);
      return response.status(500).json({ error: 'Internal server error' });
    }
    response.status(200).json({ message: `Member deleted with ID: ${id}` });
  });
});

async function getMemberSales(memberName) {
  const queryText = `
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
    FROM 
      sales
    WHERE 
      customer = $1
    ORDER BY 
      datetime DESC;
  `;
  const { rows } = await pool.query(queryText, [memberName]);

  // Format the data if needed
  const formatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  rows.forEach(row => {
    row.total = formatter.format(row.total);
    row.subtotal = formatter.format(row.subtotal);
    row.computer = formatter.format(row.computer);
    row.qty = row.qty;
    row.datetime = moment(row.datetime).tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss');
  });

  return rows;
}

module.exports = router;
