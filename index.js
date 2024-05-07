const express = require('express')
const bodyParser = require('body-parser')
const app = express()
const userRoutes = require('./routes/queries')
const inventoryRoutes = require('./routes/inventory')
const port = 3000

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

app.listen(port, () => {
  console.log(`App running on port ${port}.`)
})