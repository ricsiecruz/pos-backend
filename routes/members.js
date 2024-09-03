// members.js
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

    // Update the database
    for (const row of data) {
      // Adjust indices based on actual data structure
      const username = (row[7] || '').toLowerCase();  // Column H (7)
      const balance = row[41];  // Column AP (41)

      // Validate row data
      if (!username || !balance) {
        continue;
      }

      const balanceNumeric = parseFloat(balance.replace(/[^0-9.-]+/g, ""));
      if (isNaN(balanceNumeric)) {
        continue;
      }

      const queryText = `
        UPDATE members
        SET current_load = $1
        WHERE LOWER(name) = LOWER($2)
      `;
      const result = await pool.query(queryText, [balanceNumeric, username]);

    }

    res.status(200).json({ message: 'Members updated successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', async(req, res) => {
  try {
    const results = await pool.query('SELECT * FROM members ORDER BY id DESC');
    const members = results.rows;
    res.status(200).json(members)
  } catch(error) {
    console.error('Error fetching members:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
})

router.post('/', async (request, response) => {
  const { page = 1, limit = 10 } = request.body;

  try {
      const offset = (page - 1) * limit;

      const totalRecordsResult = await pool.query('SELECT COUNT(*) FROM members');
      const totalRecords = parseInt(totalRecordsResult.rows[0].count, 10);
      const totalPages = Math.ceil(totalRecords / limit);

      const results = await pool.query(
        'SELECT * FROM members ORDER BY id DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      );

      const members = results.rows;

      response.status(200).json({
          data: members,
          totalRecords,
          totalPages,
          pageNumber: page
      });
  } catch (error) {
      console.error('Error fetching members:', error);
      response.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id', async (request, response) => {
  const id = parseInt(request.params.id);
  const { page = 1, limit = 10 } = request.body;

  try {
    // Query to get the member details
    const memberQuery = 'SELECT * FROM members WHERE id = $1';
    const memberResults = await pool.query(memberQuery, [id]);
    const member = memberResults.rows[0];

    if (!member) {
      return response.status(404).json({ error: 'Member not found' });
    }

    // Calculate pagination offset
    const offset = (page - 1) * limit;

    // Query to get paginated transactions
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
      FROM 
        sales
      WHERE 
        customer = $1
      ORDER BY 
        datetime DESC
      LIMIT $2 OFFSET $3
    `;

    // Query to get total transaction count
    const countQuery = `
      SELECT COUNT(*) 
      FROM sales
      WHERE customer = $1
    `;

    // Execute queries
    const transactionsResults = await pool.query(transactionsQuery, [member.name, limit, offset]);
    const countResults = await pool.query(countQuery, [member.name]);

    // Calculate pagination metadata
    const totalRecords = parseInt(countResults.rows[0].count, 10);
    const totalPages = Math.ceil(totalRecords / limit);

    // Format transaction data
    const formatter = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const transactions = transactionsResults.rows.map(row => {
      return {
        ...row,
        total: formatter.format(row.total),
        subtotal: formatter.format(row.subtotal),
        computer: formatter.format(row.computer),
        qty: row.qty,
        datetime: moment(row.datetime).tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss'),
      };
    });

    // Append transactions and pagination info to the member object
    member.transactions = transactions;
    member.totalRecords = totalRecords;
    member.totalPages = totalPages;
    member.pageNumber = page;

    response.status(200).json(member);
  } catch (error) {
    console.error('Error fetching member details or transactions:', error);
    response.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', (request, response) => {
  try {
    const { name, date_joined, coffee, total_load, total_spent, last_spent, current_load } = request.body;

    if (!date_joined || isNaN(Date.parse(date_joined))) {
      return response.status(400).json({ error: 'Invalid or missing date_joined' });
    }

    if (!last_spent || isNaN(Date.parse(last_spent))) {
      return response.status(400).json({ error: 'Invalid or missing last_spent' });
    }

    const formattedDate = new Date(date_joined);
    const formattedLastSpent = new Date(last_spent);

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
    response.status(500).json({ error: 'Internal Server Error' });
  }
});

// Route to delete a member by ID
router.delete('/:id', (request, response) => {
  const id = parseInt(request.params.id);

  pool.query('DELETE FROM members WHERE id = $1', [id], (error, results) => {
    if (error) {
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
