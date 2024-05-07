const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const app = express()
const userRoutes = require('./routes/queries')
const inventoryRoutes = require('./routes/inventory')
const productsRoutes = require('./routes/products')
const port = 3000

app.use(cors())
app.use(bodyParser.json())
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
)

app.get('/', (request, response) => {
  response.json({ info: 'Node.js, Express, and Postgres API' })
})

app.use('/users', userRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/products', productsRoutes);

app.listen(port, () => {
  console.log(`App running on port ${port}.`)
})