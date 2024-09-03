const express = require('express');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const pool = require('../db');
const router = express.Router();

const cron = require('node-cron');

const salesJsonPath = path.join(__dirname, '../sales.json');

console.log('Sales JSON Path:', salesJsonPath);
const fileExists = fs.existsSync(salesJsonPath);
console.log('File exists:', fileExists);

// Helper function to read and parse sales.json
async function getSalesFromJson() {
  try {
    const data = await fs.promises.readFile(salesJsonPath, 'utf-8');
    const jsonData = JSON.parse(data);
    console.log('json')
    return jsonData;
  } catch (error) {
    console.error('Error reading sales.json:', error);
    return [];
  }
}

async function writeSalesToJson(salesData) {
  try {
    const existingData = await getSalesFromJson();
    const updatedData = [...existingData, ...salesData];
    
    // Sort the updated data by datetime in descending order
    updatedData.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
    
    await fs.promises.writeFile(salesJsonPath, JSON.stringify(updatedData, null, 2));
    console.log('Sales data successfully written to sales.json');
    
    // Optional: Log the first few entries to verify order
    console.log('First few entries in sorted sales.json:', updatedData.slice(0, 5));
  } catch (error) {
    console.error('Error writing to sales.json:', error);
  }
}

async function getPreviousMonthSales(startDate, endDate) {
  try {
    console.log('Fetching sales data from:', startDate, 'to:', endDate);
    const query = `
      SELECT * FROM sales
      WHERE datetime >= $1 AND datetime <= $2
    `;
    const result = await pool.query(query, [startDate, endDate]);
    return result.rows;
  } catch (error) {
    console.error('Error fetching previous month sales:', error);
    throw error;
  }
}

async function exportPreviousMonthsSales() {
  try {
    const currentMonthStart = moment().startOf('month').format('YYYY-MM-DDTHH:mm:ssZ'); // ISO 8601 format

    // Query to get the oldest sale datetime
    const oldestDateQuery = `
      SELECT MIN(datetime) AS oldest_date
      FROM sales
    `;
    const oldestDateResult = await pool.query(oldestDateQuery);
    const oldestDate = oldestDateResult.rows[0]?.oldest_date;

    if (!oldestDate) {
      console.log('No sales data found in the database.');
      return;
    }

    // Parse the oldest date and set it to the start of the month
    const oldestDateLocal = moment(oldestDate).utcOffset('+08:00').startOf('month');
    console.log('Oldest date in local time zone:', oldestDateLocal.format()); // Debugging line

    let exportDate = oldestDateLocal;

    while (exportDate.isBefore(moment(currentMonthStart))) {
      const previousMonthStart = exportDate.format('YYYY-MM-DDT00:00:00+08:00'); // ISO 8601 format with time zone
      const previousMonthEnd = exportDate.endOf('month').format('YYYY-MM-DDT23:59:59+08:00'); // ISO 8601 format with time zone

      console.log(`Exporting sales data from ${previousMonthStart} to ${previousMonthEnd}`);

      const salesData = await getPreviousMonthSales(previousMonthStart, previousMonthEnd);
      console.log('Fetched sales data:', salesData);

      if (salesData.length > 0) {
        await writeSalesToJson(salesData);

        // Delete exported sales data from the database
        const deleteQuery = `
          DELETE FROM sales
          WHERE datetime >= $1 AND datetime <= $2
        `;
        await pool.query(deleteQuery, [previousMonthStart, previousMonthEnd]);
        console.log(`Sales data from ${previousMonthStart} to ${previousMonthEnd} exported and deleted.`);
      } else {
        console.log(`No sales data found for ${previousMonthStart} to ${previousMonthEnd}`);
      }

      // Move to the previous month
      exportDate = moment(exportDate).subtract(1, 'month').startOf('month');
      console.log('Next exportDate:', exportDate.format('YYYY-MM-DD')); // Debugging line
    }
  } catch (error) {
    console.error('Error exporting previous month sales:', error);
  }
}

// Updated cron job schedule
cron.schedule('0 0 1 * *', async () => {
  console.log('Running monthly sales export...');
  await exportPreviousMonthsSales();
});

async function mergeSalesData(jsonSales, dbSales) {
  // Combine the two data sources
  const combinedSales = [...jsonSales, ...dbSales];
  
  // Sort combined data by datetime in descending order
  combinedSales.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
  
  return combinedSales;
}

router.post('/', async (req, res) => {
  try {
    // Run export of previous month's sales before processing the request
    await exportPreviousMonthsSales();

    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;
    const offset = (page - 1) * limit;

    const [dbSales, totalRecords, totalSum] = await Promise.all([
      getSalesFromDatabase(limit, offset),
      getTotalSalesCount(),
      getSumOfTotalSales(),
    ]);

    // Read and parse the sales.json data
    const jsonSales = await getSalesFromJson();

    // Merge JSON and database sales data
    const mergedSales = await mergeSalesData(jsonSales, dbSales);

    // Apply pagination on merged data
    const paginatedSales = mergedSales.slice(offset, offset + limit);

    const totalExpenses = await getSumOfExpensesByDateRange(null, null);
    const totalNet = totalSum - totalExpenses;
    const totalPages = Math.ceil(totalRecords / limit);

    const currentSalesData = await getSalesForCurrentDate();
    const currentIncome = currentSalesData.reduce((acc, sale) => acc + parseFloat(sale.total), 0);
    const currentExpenses = await getSumOfExpensesForCurrentDate();
    const currentNet = currentIncome - currentExpenses;
    const currentCredit = currentSalesData.reduce((acc, sale) => acc + parseFloat(sale.credit), 0);
    const currentComputer = currentSalesData.reduce((acc, sale) => acc + parseFloat(sale.computer), 0);
    const currentFoodAndDrinks = currentSalesData.reduce((acc, sale) => acc + parseFloat(sale.subtotal), 0);
    const currentCashTotal = await getSumOfTotalSalesTodayByPayment('cash');
    const currentGcashTotal = await getSumOfTotalSalesTodayByPayment('gcash');

    // Count sales with non-zero credit for all sales
    const creditCount = paginatedSales.reduce((acc, sale) => acc + (parseFloat(sale.credit) !== 0 ? 1 : 0), 0);

    const responseData = {
      current_sales: {
        data: currentSalesData,
        income: currentIncome,
        expenses: currentExpenses,
        net: currentNet,
        computer: currentComputer,
        food_and_drinks: currentFoodAndDrinks,
        credit: currentCredit,
        cash: currentCashTotal,
        gcash: currentGcashTotal,
        totalRecords: totalRecords,
        totalPages: totalPages,
        pageNumber: page
      },
      sales: {
        data: paginatedSales,
        income: totalSum,
        expenses: totalExpenses,
        net: totalNet,
        computer: await getSumOfComputers(),
        food_and_drinks: await getSumOfFoodAndDrinks(),
        credit: await getSumOfCredits(),
        credit_count: creditCount,
        totalRecords: totalRecords,
        totalPages: totalPages,
        pageNumber: page
      }
    };

    console.log('sales');

    res.json(responseData);
  } catch (error) {
    console.error('Error fetching sales and total sum from database:', error);
    res.status(500).json({ error: 'Internal server error - sales' });
  }
});

async function getTotalSalesCount() {
  const queryText = 'SELECT COUNT(*) FROM sales';
  const { rows } = await pool.query(queryText);
  return parseInt(rows[0].count, 10);
}

router.post('/date-range', async (req, res) => {
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
      queryText += ' WHERE sales.customer = $1';
      values.push(customer);
    }

    if (startDate && endDate) {
      const startDateManila = moment.tz(startDate, 'Asia/Manila').startOf('day').format('YYYY-MM-DD HH:mm:ss');
      const endDateManila = moment.tz(endDate, 'Asia/Manila').endOf('day').format('YYYY-MM-DD HH:mm:ss');

      if (values.length > 0) {
        queryText += ' AND sales.datetime >= $' + (values.length + 1) + ' AND sales.datetime <= $' + (values.length + 2);
      } else {
        queryText += ' WHERE sales.datetime >= $1 AND sales.datetime <= $2';
      }
      values.push(startDateManila, endDateManila);
    }

    queryText += ' ORDER BY sales.datetime DESC';

    const { rows } = await pool.query(queryText, values);
    
    const formattedRows = rows.map(row => ({
      ...row,
      datetime: moment(row.datetime).format('YYYY-MM-DD HH:mm:ss')
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
      }
    };

    res.json(responseData);

  } catch (error) {
    console.error('Error fetching sales by date range and customer:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/member-sales-today', async (req, res) => {
  try {
    const { member } = req.body;

    if (!member) {
      return res.status(400).json({ error: 'Please provide a member name' });
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
        credit: totalCredit
      }
    };

    res.json(responseData);
  } catch (error) {
    console.error('Error fetching sales for member:', error);
    res.status(500).json({ error: 'Internal server error - member sales' });
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
    rows.forEach(row => {
      row.datetime = moment(row.datetime).tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss');
    });

    return rows;
  } catch (err) {
    console.error('Error retrieving sales:', err);
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

  rows.forEach(row => {
    row.datetime = moment(row.datetime).tz('Asia/Manila').format('YYYY-MM-DD HH:mm:ss');
  });
  return rows;
}

async function getSumOfTotalSales() {
  const queryText = 'SELECT SUM(total::numeric) AS total_sum FROM sales';
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
    queryText += ' AND date >= $1 AND date <= $2';
    values.push(startDate, endDate);
  }

  try {
    const { rows } = await pool.query(queryText, values);
    return rows[0].total_expenses;
  } catch (error) {
    console.error('Error in getSumOfExpensesByDateRange query:', error);
    throw error;
  }
}

async function getSumOfCredits(startDate, endDate) {
  let queryText = 'SELECT COALESCE(SUM(credit::numeric), 0) AS total_credit FROM sales';

  if (startDate && endDate) {
    queryText += ' WHERE DATE(datetime) >= $1 AND DATE(datetime) <= $2';
  }

  const values = startDate && endDate ? [startDate, endDate] : [];

  try {
    const { rows } = await pool.query(queryText, values);
    return rows[0].total_credit;
  } catch (error) {
    console.error('Error in getSumOfCredits query:', error);
    throw error;
  }
}

async function getSumOfComputers(startDate, endDate) {
  let queryText = 'SELECT COALESCE(SUM(computer::numeric), 0) AS total_computer FROM sales';

  if (startDate && endDate) {
    queryText += ' WHERE DATE(datetime) >= $1 AND DATE(datetime) <= $2';
  }

  const values = startDate && endDate ? [startDate, endDate] : [];

  try {
    const { rows } = await pool.query(queryText, values);
    return rows[0].total_computer;
  } catch (error) {
    console.error('Error in getSumOfComputers query:', error);
    throw error;
  }
}

async function getSumOfFoodAndDrinks(startDate, endDate) {
  let queryText = 'SELECT COALESCE(SUM(subtotal::numeric), 0) AS total_food_and_drinks FROM sales';

  if (startDate && endDate) {
    queryText += ' WHERE DATE(datetime) >= $1 AND DATE(datetime) <= $2';
  }

  const values = startDate && endDate ? [startDate, endDate] : [];

  try {
    const { rows } = await pool.query(queryText, values);
    return rows[0].total_food_and_drinks;
  } catch (error) {
    console.error('Error in getSumOfFoodAndDrinks query:', error);
    throw error;
  }
}

module.exports = router;
