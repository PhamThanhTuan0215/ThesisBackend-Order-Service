const express = require('express')
const Router = express.Router()

const Controller = require('../controllers/Order')

const authenticateToken = require('../middlewares/auth');

Router.get('/', Controller.getOrder)

Router.post('/ids', Controller.getOrdersByIds)

Router.get('/get-details-order', Controller.getAllOrdersWithDetails)

Router.post('/', Controller.createOrder)

Router.put('/:id', Controller.updateOrder)

Router.delete('/:id', Controller.cancelOrder)

Router.get('/user', Controller.getOrderByUserId) // ĐANG DÙNG USER_ID TRONG QUERY

Router.get('/shop/:seller_id', Controller.getOrderBySellerId)

Router.get('/:id', Controller.getOrderById)

Router.get('/details/:id', Controller.getOrderDetails)

module.exports = Router