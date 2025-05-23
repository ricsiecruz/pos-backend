const express = require("express");
const moment = require("moment-timezone");
const multer = require("multer");
const { put } = require("@vercel/blob");
const pool = require("../db");
const router = express.Router();
const path = require("path");
const WebSocket = require("ws");

require("dotenv").config();

const storage = multer.memoryStorage();

const upload = multer({ storage: storage });

async function getSumOfCredit(paid_by = null) {
  let queryText = `
      SELECT 
        COALESCE(SUM(amount::numeric), 0) AS total_credit_amount,
        COUNT(*) AS credit_count
      FROM 
        expenses
      WHERE 
        credit = true
    `;

  const queryParams = [];

  if (paid_by) {
    queryText += " AND paid_by = $1";
    queryParams.push(paid_by);
  }

  try {
    const { rows } = await pool.query(queryText, queryParams);
    return {
      totalCreditAmount: rows[0]?.total_credit_amount || "0",
      creditCount: rows[0]?.credit_count || "0",
    };
  } catch (error) {
    console.error("Error executing getSumOfCredit query:", error);
    return {
      totalCreditAmount: "0",
      creditCount: "0",
    };
  }
}

async function getPaidBy() {
  const queryText = "SELECT * FROM paid_by";
  const { rows } = await pool.query(queryText);
  return rows;
}

async function getModeOfPayment() {
  const queryText = "SELECT * FROM mode_of_payment";
  const { rows } = await pool.query(queryText);
  return rows;
}

async function getExpensesData(limit, offset) {
  const queryText = `
      SELECT *
      FROM expenses
      ORDER BY credit DESC, id DESC
      LIMIT $1 OFFSET $2;
    `;
  const { rows } = await pool.query(queryText, [limit, offset]);
  return rows;
}

async function getTotalExpensesCount() {
  const queryText = `
      SELECT COUNT(*) AS total_count
      FROM expenses;
    `;
  const { rows } = await pool.query(queryText);
  return parseInt(rows[0].total_count, 10);
}

module.exports = function (wss) {
  router.post("/", async (req, res) => {
    try {
      // Extract pagination details from the request body
      const page = parseInt(req.body.page) || 1; // Default page is 1
      const limit = parseInt(req.body.limit) || 10; // Default limit is 10 records per page
      const offset = (page - 1) * limit;

      // Fetch expenses data with pagination and calculate total records
      const [expensesData, totalRecords, totalCreditAmount] = await Promise.all([
        getExpensesData(limit, offset), // Pass limit and offset for pagination
        getTotalExpensesCount(), // Function to count the total records in expenses
        getSumOfCredit(),
      ]);

      // Calculate total pages based on the total records and limit
      const totalPages = Math.ceil(totalRecords / limit);

      // Prepare the response data including pagination details
      const responseData = {
        data: expensesData,
        total_credit_amount: totalCreditAmount,
        totalRecords: totalRecords,
        totalPages: totalPages,
        pageNumber: page, // Correct page number
      };

      res.status(200).json(responseData);
    } catch (error) {
      console.error("Error fetching expenses data:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  async function addExpenses(newExpenseData) {
    const {
      expense,
      month,
      date,
      amount,
      mode_of_payment,
      image_path,
      credit,
      paid_by,
      settled_by,
    } = newExpenseData;

    try {
      const result = await pool.query(
        `INSERT INTO expenses (expense, month, date, amount, mode_of_payment, image_path, credit, paid_by, settled_by) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [expense, month, date, amount, mode_of_payment, image_path, credit, paid_by, settled_by]
      );

      const newExpense = result.rows[0];

      return newExpense;
    } catch (error) {
      console.error("Error adding new expense:", error);
      throw error;
    }
  }

  // Now the new API route
  router.post("/add", async (req, res) => {
    try {
      const newExpense = await addExpenses(req.body);
      res.status(201).json({ success: true, expense: newExpense });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to add expense" });
    }
  });

  router.post("/upload", upload.single("image"), async (req, res) => {
    if (!req.file) {
      return res.status(400).send("No file uploaded.");
    }

    try {
      const { buffer, originalname } = req.file;
      const extension = path.extname(originalname);
      const key = `uploads/${Date.now()}${extension}`;

      // Upload the file to Vercel Blob
      const { url } = await put(key, buffer, {
        access: "public",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });

      res.json({ imagePath: url });
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).send("Error uploading file.");
    }
  });

  router.put("/:id/pay", async (req, res) => {
    try {
      const expenseId = req.params.id;

      const currentDate = new Date().toISOString();

      const result = await pool.query(
        `UPDATE expenses
                SET credit = false, settled_by = $1, date_settled = $2
                WHERE id = $3
                RETURNING amount::numeric`,
        ["Tech Hybe", currentDate, expenseId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Expense not found" });
      }

      const deductedAmount = result.rows[0].amount;
      const totalCreditAmount = await getSumOfCredit();

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({ action: "deductCredit", expense: expenseId, totalCreditAmount })
          );
        }
      });

      res.status(200).json({ deductedAmount, totalCreditAmount });
    } catch (error) {
      console.error("Error executing query:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.get("/paid-by", async (req, res) => {
    try {
      const paidBy = await getPaidBy();
      res.json({ paid_by: paidBy });
    } catch (error) {
      res.status(500).json({ error: "Internal server error - paid by" });
    }
  });

  router.get("/mode-of-payment", async (req, res) => {
    try {
      const modeOfPayment = await getModeOfPayment();
      res.json({ mode_of_payment: modeOfPayment });
    } catch (error) {
      res.status(500).json({ error: "Internal server error - mode of payment" });
    }
  });

  router.post("/filter-by-paid-by", async (req, res) => {
    const { paid_by } = req.body;

    try {
      let queryText = `
                SELECT *
                FROM expenses
            `;
      const queryParams = [];

      if (paid_by !== null) {
        queryText += " WHERE paid_by = $1";
        queryParams.push(paid_by);
      }

      queryText += " ORDER BY credit DESC, id DESC";

      const [expensesData, totalCreditAmount] = await Promise.all([
        (async () => {
          const { rows } = await pool.query(queryText, queryParams);
          return rows;
        })(),
        getSumOfCredit(paid_by), // Pass paid_by as is, even if it's null
      ]);

      const responseData = {
        data: expensesData,
        total_credit_amount: totalCreditAmount,
      };

      res.status(200).json(responseData);
    } catch (error) {
      console.error("Error fetching filtered expenses data:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  router.post("/date-range", async (req, res) => {
    try {
      const { startDate, endDate, paidBy } = req.body;
      let queryText = `
                SELECT 
                    id, 
                    expense, 
                    month, 
                    date, 
                    amount, 
                    mode_of_payment, 
                    credit, 
                    paid_by, 
                    settled_by, 
                    image_path, 
                    date_settled
                FROM expenses
            `;
      const values = [];

      // Filter by paid_by if provided
      if (paidBy) {
        queryText += " WHERE paid_by = $1";
        values.push(paidBy);
      }

      // Add date range filter if both dates are provided
      if (startDate && endDate) {
        const startDateManila = moment
          .tz(startDate, "Asia/Manila")
          .startOf("day")
          .format("YYYY-MM-DD HH:mm:ss");
        const endDateManila = moment
          .tz(endDate, "Asia/Manila")
          .endOf("day")
          .format("YYYY-MM-DD HH:mm:ss");

        if (values.length > 0) {
          queryText +=
            " AND date >= $" + (values.length + 1) + " AND date <= $" + (values.length + 2);
        } else {
          queryText += " WHERE date >= $1 AND date <= $2";
        }
        values.push(startDateManila, endDateManila);
      }

      queryText += " ORDER BY date DESC";

      const { rows } = await pool.query(queryText, values);

      // Format the date in the result rows
      const formattedRows = rows.map((row) => ({
        ...row,
        date: moment(row.date).format("YYYY-MM-DD"),
        date_settled: row.date_settled ? moment(row.date_settled).format("YYYY-MM-DD") : null,
      }));

      // Calculate aggregates
      const totalAmount = rows.reduce((acc, expense) => acc + parseFloat(expense.amount), 0);
      const totalCredit = rows.reduce((acc, expense) => acc + parseFloat(expense.credit), 0);

      const responseData = {
        expensesData: {
          data: formattedRows,
          total_amount: totalAmount,
          total_credit: totalCredit,
        },
      };

      res.json(responseData);
    } catch (error) {
      console.error("Error fetching expenses by date range and paid_by:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
};
