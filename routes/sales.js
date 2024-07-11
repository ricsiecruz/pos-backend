const express = require('express');
const moment = require('moment-timezone');
const pool = require('../db');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [sales, totalSum] = await Promise.all([
      getSalesFromDatabase(),
      getSumOfTotalSales(),
      getSumOfTotalSalesToday(),
      getSumOfFoodAndDrinksToday()
    ]);

    const totalExpenses = await getSumOfExpensesByDateRange(null, null);
    const totalNet = totalSum - totalExpenses;

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
    const creditCount = sales.reduce((acc, sale) => acc + (parseFloat(sale.credit) !== 0 ? 1 : 0), 0);

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
      },
      sales: {
        data: sales,
        income: totalSum,
        expenses: totalExpenses,
        net: totalNet,
        computer: await getSumOfComputers(),
        food_and_drinks: await getSumOfFoodAndDrinks(),
        credit: await getSumOfCredits(),
        credit_count: creditCount, // Add the count to the sales response
      }
    };

    res.json(responseData);
  } catch (error) {
    console.error('Error fetching sales and total sum from database:', error);
    res.status(500).json({ error: 'Internal server error - sales' });
  }
});

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

    // If customer is provided, filter by customer
    if (customer) {
      queryText += ' WHERE sales.customer = $1';
      values.push(customer);
    }

    // If both startDate and endDate are provided, filter by date range
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

    // Execute the query
    const { rows } = await pool.query(queryText, values);
    
    // Calculate the totals
    const filteredIncome = rows.reduce((acc, sale) => acc + parseFloat(sale.total), 0);
    const filteredExpenses = await getSumOfExpensesByDateRange(startDate, endDate);
    const filteredNet = filteredIncome - filteredExpenses;
    const filteredCredit = rows.reduce((acc, sale) => acc + parseFloat(sale.credit), 0);
    const filteredComputer = rows.reduce((acc, sale) => acc + parseFloat(sale.computer), 0);
    const filteredFoodAndDrinks = rows.reduce((acc, sale) => acc + parseFloat(sale.subtotal), 0);

    const responseData = {
      salesData: {
        data: rows,
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

// New route for fetching sales for a specific member on the current date
router.post('/member-sales-today', async (req, res) => {
  try {
    const { member } = req.body;

    // Validate the input member
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
  const setTimezoneQuery = "SET TIME ZONE 'Asia/Manila';";
  const selectSalesQuery = `
  SELECT 
  sales.id AS sale_id,
  sales.customer,
  sales.datetime, 
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
    WHERE DATE(datetime AT TIME ZONE 'Asia/Manila') = CURRENT_DATE
    ORDER BY credit DESC, sale_id DESC;
  `;

  await pool.query(setTimezoneQuery);
  const { rows } = await pool.query(selectSalesQuery);
  return rows;
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

async function getSalesFromDatabase() {
  const queryText = `
      SELECT 
        sales.id AS sale_id,
        sales.customer,
        sales.datetime, 
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
      ORDER BY sales.id DESC;
    `;

    console.log('Query Text:', queryText); // Log the query being executed

    const { rows } = await pool.query(queryText);
    return rows;
}

   async function getSumOfTotalSales() {
    const queryText = 'SELECT SUM(total::numeric) AS total_sum FROM sales';
    const { rows } = await pool.query(queryText);
    return rows[0].total_sum;
  }
  
  async function getSumOfTotalSalesToday() {
    const queryText = `
      SELECT COALESCE(SUM(total::numeric), 0) AS total_sum_today
      FROM sales
      WHERE DATE(datetime) = CURRENT_DATE;
    `;
    const { rows } = await pool.query(queryText);
    return rows[0].total_sum_today;
  }
  
async function getSumOfFoodAndDrinksToday() {
   const queryText = `
    SELECT COALESCE(SUM(subtotal::numeric), 0) AS total_food_and_drinks_today
     FROM sales
    WHERE DATE(datetime) = CURRENT_DATE;
   `;
  const { rows } = await pool.query(queryText);
  return rows[0].total_food_and_drinks_today;
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

async function getSalesByDateRange(startDate, endDate) {
  const queryText = `
    SELECT customer, qty, datetime, computer, credit, total
    FROM sales
    WHERE DATE(datetime) >= $1 AND DATE(datetime) <= $2
    ORDER BY datetime DESC;
  `;
  const values = [startDate, endDate];

  try {
    const { rows } = await pool.query(queryText, values);
    const totalIncome = rows.reduce((acc, sale) => acc + parseFloat(sale.total), 0);
    return { salesData: rows, totalIncome: totalIncome };
  } catch (error) {
    console.error('Error in getSalesByDateRange query:', error);
    throw error;
  }
}

async function getSalesByDateRangeAndCustomer(startDate, endDate, customer) {
  const queryText = `
    SELECT customer, qty, datetime, computer, credit, total
    FROM sales
    WHERE DATE(datetime) >= $1 AND DATE(datetime) <= $2 AND customer = $3
    ORDER BY datetime DESC;
  `;
  const values = [startDate, endDate, customer];

  try {
    const { rows } = await pool.query(queryText, values);
    const totalIncome = rows.reduce((acc, sale) => acc + parseFloat(sale.total), 0);
    return { salesData: rows, totalIncome: totalIncome };
  } catch (error) {
    console.error('Error in getSalesByDateRangeAndCustomer query:', error);
    throw error;
  }
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
