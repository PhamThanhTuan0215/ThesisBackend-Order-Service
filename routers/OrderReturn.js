const express = require('express')
const Router = express.Router()

const Controller = require('../controllers/OrderReturn')

const authenticateToken = require('../middlewares/auth');

// Tạo yêu cầu hoàn trả
Router.post('/request/:order_id', Controller.uploadCustom, Controller.createReturnRequest)

// Xóa yêu cầu hoàn trả
Router.delete('/request/:id', Controller.deleteReturnRequest)

// Lấy danh sách yêu cầu hoàn trả
Router.get('/requests', Controller.getReturnRequests)

// Lấy chi tiết các sản phẩm trong yêu cầu hoàn trả bằng id của yêu cầu hoàn trả (order_return_request_id)
Router.get('/request/details', Controller.getReturnedOrderDetail)

// Lấy yêu cầu hoàn trả bằng id
Router.get('/request/:id', Controller.getReturnRequestById)

// Phản hồi yêu cầu hoàn trả (chấp nhận/từ chối)
Router.put('/request/:request_id/response', Controller.responseReturnRequest)

// Lấy danh sách đơn hàng hoàn trả
Router.get('/returned-orders', Controller.getReturnedOrders)

// Lấy danh sách đơn hàng hoàn trả kèm chi tiết sản phẩm, user, shipment
Router.get('/returned-orders-details', Controller.getAllReturnedOrdersWithDetails)

// Lấy chi tiết đơn hàng hoàn trả bằng id của đơn hàng hoàn trả (returned_order_id)
Router.get('/returned-order/details', Controller.getReturnedOrderDetail)

// Lấy đơn hàng hoàn trả bằng id
Router.get('/returned-order/:id', Controller.getReturnedOrderById)

// Cập nhật đơn hàng hoàn trả
Router.put('/returned-order/:id', Controller.updateReturnedOrder)

module.exports = Router