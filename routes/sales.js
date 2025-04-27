// sales.js
const express = require("express");
const moment = require("moment-timezone");
const pool = require("../db");
const router = express.Router();

router.post("/", async (req, res) => {
  try {
    // Check if page and limit are passed in the request body instead of query
    const page = parseInt(req.body.page) || 1; // Default page is 1
    const limit = parseInt(req.body.limit) || 10; // Default limit is 10 records per page
    const offset = (page - 1) * limit;

    const [sales, totalRecords, totalSum] = await Promise.all([
      getSalesFromDatabase(limit, offset),
      getTotalSalesCount(),
      getSumOfTotalSales(),
    ]);

    const totalExpenses = await getSumOfExpensesByDateRange(null, null);
    const totalNet = totalSum - totalExpenses;

    const totalPages = Math.ceil(totalRecords / limit);

    const currentSalesData = await getSalesForCurrentDate();
    const currentIncome = currentSalesData.reduce((acc, sale) => acc + parseFloat(sale.total), 0);
    const currentExpenses = await getSumOfExpensesForCurrentDate();
    const currentNet = currentIncome - currentExpenses;
    const currentCredit = currentSalesData.reduce((acc, sale) => acc + parseFloat(sale.credit), 0);
    const currentComputer = currentSalesData.reduce(
      (acc, sale) => acc + parseFloat(sale.computer),
      0
    );
    const currentPs4 = currentSalesData.reduce((acc, sale) => acc + parseFloat(sale.ps4), 0);
    const currentFoodAndDrinks = currentSalesData.reduce(
      (acc, sale) => acc + parseFloat(sale.subtotal),
      0
    );
    const currentCashTotal = await getSumOfTotalSalesTodayByPayment("cash");
    const currentGcashTotal = await getSumOfTotalSalesTodayByPayment("gcash");

    // Count sales with non-zero credit for all sales
    const creditCount = sales.reduce(
      (acc, sale) => acc + (parseFloat(sale.credit) !== 0 ? 1 : 0),
      0
    );

    const responseData = {
      current_sales: {
        data: currentSalesData,
        income: currentIncome,
        expenses: currentExpenses,
        net: currentNet,
        computer: currentComputer,
        ps4: currentPs4,
        food_and_drinks: currentFoodAndDrinks,
        credit: currentCredit,
        cash: currentCashTotal,
        gcash: currentGcashTotal,
        totalRecords: totalRecords,
        totalPages: totalPages,
        pageNumber: page, // Correct page number
      },
      sales: {
        data: sales,
        income: totalSum,
        expenses: totalExpenses,
        net: totalNet,
        computer: await getSumOfComputers(),
        ps4: await getSumOfPs4(),
        food_and_drinks: await getSumOfFoodAndDrinks(),
        credit: await getSumOfCredits(),
        credit_count: creditCount,
        totalRecords: totalRecords,
        totalPages: totalPages,
        pageNumber: page, // Correct page number
      },
    };

    res.json(responseData);
  } catch (error) {
    console.error("Error fetching sales and total sum from database:", error);
    res.status(500).json({ error: "Internal server error - sales" });
  }
});

// in sales.js

router.post("/add", async (req, res) => {
  const sale = req.body;
  const client = await pool.connect();
  const localDatetime = moment().tz("Asia/Manila").format("YYYY-MM-DD HH:mm:ss");

  try {
    await client.query("BEGIN");

    // Check duplicate transactionid
    const checkQuery = "SELECT 1 FROM sales WHERE transactionid = $1";
    const { rows: checkRows } = await client.query(checkQuery, [sale.transactionid]);

    if (checkRows.length > 0) {
      await client.query("ROLLBACK");
      client.release();
      console.log(`Sale with transactionid ${sale.transactionid} already exists.`);
      return res.status(409).json({ error: "Sale with this transactionid already exists" });
    }

    // Insert sale
    const insertQuery = `
      INSERT INTO sales (transactionid, orders, qty, total, datetime, customer, computer, ps4, subtotal, credit, mode_of_payment, student_discount, discount)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *;
    `;
    const insertValues = [
      sale.transactionid,
      JSON.stringify(sale.orders),
      sale.qty,
      sale.total,
      localDatetime,
      sale.customer,
      sale.computer,
      sale.ps4,
      sale.subtotal,
      sale.credit,
      sale.mode_of_payment,
      sale.student_discount,
      sale.discount,
    ];
    const { rows: insertedSaleRows } = await client.query(insertQuery, insertValues);
    const insertedSale = insertedSaleRows[0];
    console.log("Incoming sale payload:", sale);

    const productNames = sale.orders.map((order) => order.product);

    // Fetch barista, utensils, beverages
    const [baristaResults, utensilsResults, beveragesResults] = await Promise.all([
      client.query("SELECT product FROM products WHERE product = ANY($1) AND barista = true", [
        productNames,
      ]),
      client.query("SELECT product FROM foods WHERE product = ANY($1) AND utensils = true", [
        productNames,
      ]),
      client.query("SELECT product FROM beverage WHERE product = ANY($1)", [productNames]),
    ]);

    const totalBaristaQuantity = sale.orders
      .filter((order) => baristaResults.rows.some((bp) => bp.product === order.product))
      .reduce((sum, order) => sum + order.quantity, 0);

    const totalUtensilsQuantity = sale.orders
      .filter((order) => utensilsResults.rows.some((up) => up.product === order.product))
      .reduce((sum, order) => sum + order.quantity, 0);

    const totalBeverageQuantity = sale.orders
      .filter((order) => beveragesResults.rows.some((b) => b.product === order.product))
      .reduce((sum, order) => sum + order.quantity, 0);

    // Deduct inventory
    if (totalBaristaQuantity > 0) {
      await client.query(
        `
        UPDATE inventory
        SET stocks = GREATEST(stocks - $1, 0)
        WHERE product IN ('straw', 'lids', 'cups')
      `,
        [totalBaristaQuantity]
      );
    }

    if (totalUtensilsQuantity > 0) {
      await client.query(
        `
        UPDATE inventory
        SET stocks = GREATEST(stocks - $1, 0)
        WHERE product = 'forks'
      `,
        [totalUtensilsQuantity]
      );
    }

    if (totalBeverageQuantity > 0) {
      await client.query(
        `
        UPDATE beverage
        SET stocks = GREATEST(stocks - $1, 0)
        WHERE product = ANY($1)
      `,
        [productNames]
      );
    }

    await client.query("COMMIT");
    client.release();

    res.status(201).json({ sale: insertedSale });
  } catch (error) {
    await client.query("ROLLBACK");
    client.release();
    console.error("Error adding sale:", error);
    res.status(500).json({ error: "Internal server error - adding sale" });
  }
});

async function getTotalSalesCount() {
  const queryText = "SELECT COUNT(*) FROM sales";
  const { rows } = await pool.query(queryText);
  return parseInt(rows[0].count, 10);
}

router.post("/date-range", async (req, res) => {
  try {
    const { startDate, endDate, customer } = req.body;
    let queryText = `
      SELECT 
          sales.customer, 
          sales.qty, 
          sales.datetime, 
          sales.computer, 
          sales.credit, 
          sales.total, 
          sales.subtotal, 
          members.id AS member_id
      FROM sales
      LEFT JOIN members ON sales.customer = members.name
    `;
    const values = [];

    if (customer) {
      queryText += " WHERE sales.customer = $1";
      values.push(customer);
    }

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
          " AND sales.datetime >= $" +
          (values.length + 1) +
          " AND sales.datetime <= $" +
          (values.length + 2);
      } else {
        queryText += " WHERE sales.datetime >= $1 AND sales.datetime <= $2";
      }
      values.push(startDateManila, endDateManila);
    }

    queryText += " ORDER BY sales.datetime DESC";

    const { rows } = await pool.query(queryText, values);

    const formattedRows = rows.map((row) => ({
      ...row,
      datetime: moment(row.datetime).format("YYYY-MM-DD HH:mm:ss"),
    }));

    const filteredIncome = rows.reduce((acc, sale) => acc + parseFloat(sale.total), 0);
    const filteredExpenses = await getSumOfExpensesByDateRange(startDate, endDate);
    const filteredNet = filteredIncome - filteredExpenses;
    const filteredCredit = rows.reduce((acc, sale) => acc + parseFloat(sale.credit), 0);
    const filteredComputer = rows.reduce((acc, sale) => acc + parseFloat(sale.computer), 0);
    const filteredFoodAndDrinks = rows.reduce((acc, sale) => acc + parseFloat(sale.subtotal), 0);

    const responseData = {
      salesData: {
        data: formattedRows,
        income: filteredIncome,
        expenses: filteredExpenses,
        net: filteredNet,
        computer: filteredComputer,
        food_and_drinks: filteredFoodAndDrinks,
        credit: filteredCredit,
      },
    };

    res.json(responseData);
  } catch (error) {
    console.error("Error fetching sales by date range and customer:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/member-sales-today", async (req, res) => {
  try {
    const { member } = req.body;

    if (!member) {
      return res.status(400).json({ error: "Please provide a member name" });
    }

    const salesData = await getSalesForMember(member);
    const totalIncome = salesData.reduce((acc, sale) => acc + parseFloat(sale.total), 0);
    const totalCredit = salesData.reduce((acc, sale) => acc + parseFloat(sale.credit), 0);
    const totalComputer = salesData.reduce((acc, sale) => acc + parseFloat(sale.computer), 0);
    const totalFoodAndDrinks = salesData.reduce((acc, sale) => acc + parseFloat(sale.subtotal), 0);

    const responseData = {
      member_sales: {
        data: salesData,
        income: totalIncome,
        computer: totalComputer,
        food_and_drinks: totalFoodAndDrinks,
        credit: totalCredit,
      },
    };

    res.json(responseData);
  } catch (error) {
    console.error("Error fetching sales for member:", error);
    res.status(500).json({ error: "Internal server error - member sales" });
  }
});

async function getSalesForCurrentDate() {
  const selectSalesQuery = `
    SELECT 
      sales.id AS sale_id,
      sales.transactionid,
      sales.customer,
      sales.datetime AT TIME ZONE 'Asia/Manila' AS datetime,
      sales.total, 
      sales.credit, 
      sales.computer, 
      sales.ps4,
      sales.subtotal, 
      sales.orders, 
      sales.qty, 
      sales.mode_of_payment,
      sales.student_discount, 
      sales.discount,
      members.id AS member_id
    FROM sales
    LEFT JOIN members ON sales.customer = members.name
    WHERE DATE(sales.datetime AT TIME ZONE 'Asia/Manila') = CURRENT_DATE
    ORDER BY credit DESC, sale_id DESC;
  `;

  try {
    const { rows } = await pool.query(selectSalesQuery);

    // Convert datetime to Asia/Manila timezone
    rows.forEach((row) => {
      row.datetime = moment(row.datetime).tz("Asia/Manila").format("YYYY-MM-DD HH:mm:ss");
    });

    return rows;
  } catch (err) {
    console.error("Error retrieving sales:", err);
    throw err;
  }
}

// Function to get sum of total sales for current date by mode of payment
async function getSumOfTotalSalesTodayByPayment(modeOfPayment) {
  const queryText = `
    SELECT COALESCE(SUM(total::numeric), 0) AS total_sum_today
    FROM sales
    WHERE DATE(datetime) = CURRENT_DATE
    AND mode_of_payment = $1;
  `;
  const { rows } = await pool.query(queryText, [modeOfPayment]);
  return rows[0].total_sum_today;
}

// Function to get the sum of total sales today
async function getSumOfTotalSalesToday() {
  const queryText = `
    SELECT COALESCE(SUM(total::numeric), 0) AS total_sum_today
    FROM sales
    WHERE DATE(datetime) = CURRENT_DATE;
  `;
  const { rows } = await pool.query(queryText);
  return rows[0].total_sum_today;
}

async function getSalesFromDatabase(limit, offset) {
  const queryText = `
      SELECT 
        sales.id AS sale_id,
        sales.transactionid,
        sales.customer,
        sales.datetime AT TIME ZONE 'Asia/Manila' AS datetime,
        sales.total, 
        sales.credit, 
        sales.computer, 
        sales.ps4,
        sales.subtotal, 
        sales.orders, 
        sales.qty, 
        sales.mode_of_payment,
        sales.student_discount, 
        sales.discount,
        members.id AS member_id
      FROM sales
      LEFT JOIN members ON sales.customer = members.name
      ORDER BY sales.credit DESC, sales.id DESC
      LIMIT $1 OFFSET $2;
    `;

  const { rows } = await pool.query(queryText, [limit, offset]);

  rows.forEach((row) => {
    row.datetime = moment(row.datetime).tz("Asia/Manila").format("YYYY-MM-DD HH:mm:ss");
  });
  return rows;
}

async function getSumOfTotalSales() {
  const queryText = "SELECT SUM(total::numeric) AS total_sum FROM sales";
  const { rows } = await pool.query(queryText);
  return rows[0].total_sum;
}

async function getSalesForMember(member) {
  const setTimezoneQuery = "SET TIME ZONE 'Asia/Manila';";
  const selectSalesQuery = `
    SELECT *
    FROM sales
    WHERE customer = $1 AND DATE(datetime AT TIME ZONE 'Asia/Manila') = CURRENT_DATE
    ORDER BY id DESC;
  `;
  const values = [member];

  await pool.query(setTimezoneQuery);
  const { rows } = await pool.query(selectSalesQuery, values);
  return rows;
}

async function getSumOfExpensesForCurrentDate() {
  const setTimezoneQuery = "SET TIME ZONE 'Asia/Manila';";
  const queryText = `
    SELECT COALESCE(SUM(amount::numeric), 0) AS total_expenses
    FROM expenses
    WHERE DATE(date AT TIME ZONE 'Asia/Manila') = CURRENT_DATE
    AND credit IS NOT TRUE;  -- Exclude records where credit is true
  `;

  await pool.query(setTimezoneQuery);
  const { rows } = await pool.query(queryText);
  return rows[0].total_expenses;
}

async function getSumOfExpensesByDateRange(startDate, endDate) {
  let queryText = `
    SELECT COALESCE(SUM(amount::numeric), 0) AS total_expenses
    FROM expenses
    WHERE credit = false
  `;
  const values = [];

  if (startDate && endDate) {
    queryText += " AND date >= $1 AND date <= $2";
    values.push(startDate, endDate);
  }

  try {
    const { rows } = await pool.query(queryText, values);
    return rows[0].total_expenses;
  } catch (error) {
    console.error("Error in getSumOfExpensesByDateRange query:", error);
    throw error;
  }
}

async function getSumOfCredits(startDate, endDate) {
  let queryText = "SELECT COALESCE(SUM(credit::numeric), 0) AS total_credit FROM sales";

  if (startDate && endDate) {
    queryText += " WHERE DATE(datetime) >= $1 AND DATE(datetime) <= $2";
  }

  const values = startDate && endDate ? [startDate, endDate] : [];

  try {
    const { rows } = await pool.query(queryText, values);
    return rows[0].total_credit;
  } catch (error) {
    console.error("Error in getSumOfCredits query:", error);
    throw error;
  }
}

async function getSumOfComputers(startDate, endDate) {
  let queryText = "SELECT COALESCE(SUM(computer::numeric), 0) AS total_computer FROM sales";

  if (startDate && endDate) {
    queryText += " WHERE DATE(datetime) >= $1 AND DATE(datetime) <= $2";
  }

  const values = startDate && endDate ? [startDate, endDate] : [];

  try {
    const { rows } = await pool.query(queryText, values);
    return rows[0].total_computer;
  } catch (error) {
    console.error("Error in getSumOfComputers query:", error);
    throw error;
  }
}

async function getSumOfPs4(startDate, endDate) {
  let queryText = "SELECT COALESCE(SUM(ps4::numeric), 0) AS total_ps4 FROM sales";

  if (startDate && endDate) {
    queryText += " WHERE DATE(datetime) >= $1 AND DATE(datetime) <= $2";
  }

  const values = startDate && endDate ? [startDate, endDate] : [];

  try {
    const { rows } = await pool.query(queryText, values);
    return rows[0].total_ps4;
  } catch (error) {
    console.error("Error in getSumOfPs4 query:", error);
    throw error;
  }
}

async function getSumOfFoodAndDrinks(startDate, endDate) {
  let queryText = "SELECT COALESCE(SUM(subtotal::numeric), 0) AS total_food_and_drinks FROM sales";

  if (startDate && endDate) {
    queryText += " WHERE DATE(datetime) >= $1 AND DATE(datetime) <= $2";
  }

  const values = startDate && endDate ? [startDate, endDate] : [];

  try {
    const { rows } = await pool.query(queryText, values);
    return rows[0].total_food_and_drinks;
  } catch (error) {
    console.error("Error in getSumOfFoodAndDrinks query:", error);
    throw error;
  }
}

module.exports = router;
