const express = require("express");
const pool = require("../db");
const moment = require("moment-timezone");
const router = express.Router();

const TIMEZONE = "Asia/Manila";

router.get("/", async (req, res) => {
  try {
    const [
      mostOrderedToday,
      mostOrdered,
      salesAndExpensesSummary,
      topSpenders,
      updatedMembers,
      startDate,
    ] = await Promise.all([
      getMostOrdered(true),
      getMostOrdered(),
      getSalesAndExpensesSummary(),
      getTopSpenders(),
      updateMemberData(),
      getStartDate(),
    ]);

    res.json({
      mostOrderedToday,
      mostOrdered,
      salesAndExpensesSummary,
      topSpenders,
      updatedMembers,
      startDate,
    });
  } catch (error) {
    handleError(
      res,
      "Error fetching dashboard from database:",
      error,
      "Internal server error - dashboard"
    );
  }
});

async function getMostOrdered(isToday = false) {
  let queryText = `
        WITH expanded_orders AS (
            SELECT 
                o.order_detail
            FROM 
                sales,
                LATERAL (
                    SELECT 
                        jsonb_array_elements(orders::jsonb) AS order_detail
                    WHERE 
                        jsonb_typeof(orders::jsonb) = 'array'
                ) o
    `;

  if (isToday) {
    queryText += ` WHERE DATE(datetime AT TIME ZONE '${TIMEZONE}') = CURRENT_DATE `;
  }

  queryText += `
        )
        SELECT 
            order_detail ->> 'product' AS product,
            SUM((order_detail ->> 'quantity')::integer) AS total_quantity
        FROM expanded_orders
        GROUP BY order_detail ->> 'product'
        ORDER BY total_quantity DESC
        LIMIT 10;
    `;

  const { rows } = await pool.query(queryText);
  return rows;
}

async function getSalesAndExpensesSummary(startDate, endDate) {
  const queryText = `
        WITH sales_summary AS (
            SELECT 
                DATE(datetime AT TIME ZONE '${TIMEZONE}') AS date,
                SUM(total::numeric) AS total_sales
            FROM 
                sales
            WHERE 
                datetime AT TIME ZONE '${TIMEZONE}' BETWEEN $1 AND $2
            GROUP BY 
                DATE(datetime AT TIME ZONE '${TIMEZONE}')
        ),
        expenses_summary AS (
            SELECT 
                DATE(date AT TIME ZONE '${TIMEZONE}') AS date,
                SUM(amount::numeric) AS total_expenses
            FROM 
                expenses
            WHERE 
                date AT TIME ZONE '${TIMEZONE}' BETWEEN $1 AND $2
            GROUP BY 
                DATE(date AT TIME ZONE '${TIMEZONE}')
        ),
        summary AS (
            SELECT 
                COALESCE(sales_summary.date, expenses_summary.date) AS date,
                COALESCE(sales_summary.total_sales, 0) AS total_sales,
                COALESCE(expenses_summary.total_expenses, 0) AS total_expenses,
                COALESCE(sales_summary.total_sales, 0) - COALESCE(expenses_summary.total_expenses, 0) AS net
            FROM 
                sales_summary
            FULL OUTER JOIN 
                expenses_summary 
            ON 
                sales_summary.date = expenses_summary.date
        )
        SELECT 
            date,
            total_sales,
            total_expenses,
            net
        FROM 
            summary
        WHERE 
            total_sales > 0
        ORDER BY 
            total_sales DESC;
    `;

  const { rows } = await pool.query(queryText, [startDate, endDate]);

  return {
    data: rows,
    all_time_low: rows[rows.length - 1],
    all_time_high: rows[0],
  };
}

async function getTopSpenders(today = false) {
  let queryText = `
        SELECT 
            customer,
            SUM(total::numeric) AS total_spent,
            SUM(subtotal::numeric) AS total_subtotal,
            SUM(computer::numeric) AS total_computer
        FROM 
            sales
    `;

  if (today) {
    queryText += ` WHERE DATE(datetime AT TIME ZONE '${TIMEZONE}') = CURRENT_DATE `;
  }

  queryText += `
        GROUP BY 
            customer
        ORDER BY 
            total_spent DESC
        LIMIT 10;
    `;

  const { rows } = await pool.query(queryText);

  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  rows.forEach((row) => {
    row.total_spent = formatter.format(row.total_spent);
    row.total_subtotal = formatter.format(row.total_subtotal);
    row.total_computer = formatter.format(row.total_computer);
  });

  return rows;
}

async function updateMemberData() {
  const updateQueryText = `
        WITH member_sales AS (
            SELECT 
                customer,
                MAX(datetime AT TIME ZONE '${TIMEZONE}') AS last_spent,
                SUM(computer::numeric) AS total_computer,
                SUM(subtotal::numeric) AS total_subtotal
            FROM 
                sales
            GROUP BY 
                customer
        )
        UPDATE members
        SET 
            total_load = ms.total_computer,
            coffee = ms.total_subtotal,
            total_spent = ms.total_computer + ms.total_subtotal,
            last_spent = ms.last_spent
        FROM 
            member_sales ms
        WHERE 
            members.name = ms.customer
        RETURNING id, name, total_load, coffee, total_spent, members.last_spent AT TIME ZONE '${TIMEZONE}' AS last_spent;
    `;
  const { rows } = await pool.query(updateQueryText);

  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  rows.forEach((row) => {
    row.total_load = formatter.format(row.total_load);
    row.coffee = formatter.format(row.coffee);
    row.total_spent = formatter.format(row.total_spent);
    row.last_spent = moment(row.last_spent).tz(TIMEZONE).format("YYYY-MM-DD HH:mm:ss");
  });

  return rows;
}

router.get("/most-ordered", async (req, res) => {
  try {
    const mostOrdered = await getMostOrdered();
    res.json({ most_ordered: mostOrdered });
  } catch (error) {
    console.error("Error fetching most ordered:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/sales-expenses-summary", async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: "start_date and end_date are required" });
    }

    const summary = await getSalesAndExpensesSummary(start_date, end_date);
    res.json({ sales_expenses_summary: summary });
  } catch (error) {
    console.error("Error fetching sales and expenses summary:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/top-spenders", async (req, res) => {
  try {
    const topSpenders = await getTopSpenders();
    res.json({ top_spenders: topSpenders });
  } catch (error) {
    console.error("Error fetching top spenders:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/top-spenders-today", async (req, res) => {
  try {
    const topSpendersToday = await getTopSpenders(true);
    res.json({ top_spenders_today: topSpendersToday });
  } catch (error) {
    console.error("Error fetching top spenders for today:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function getStartDate() {
  const queryText = `
        SELECT 
            MIN(datetime AT TIME ZONE '${TIMEZONE}') AS start_date
        FROM 
            sales;
    `;
  const { rows } = await pool.query(queryText);
  return rows[0].start_date;
}

function handleError(res, logMessage, error, clientMessage) {
  console.error(logMessage, error);
  res.status(500).json({ message: clientMessage });
}

module.exports = router;
