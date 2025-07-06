const Order = require('../database/models/Order');
const OrderItem = require('../database/models/OrderItem');
const ReturnedOrder = require('../database/models/ReturnedOrder');
const ReturnedOrderItem = require('../database/models/ReturnedOrderItem');
const { Op } = require('sequelize');

// Thống kê doanh thu, số lượng đơn hàng, sản phẩm bán ra, lợi nhuận
module.exports.getOrderStatistics = async (req, res) => {
    try {
        const { seller_id, startDate, endDate } = req.query;
        const where = {};
        if (seller_id) where.seller_id = seller_id;
        let selectedStartDate = undefined;
        let selectedEndDate = undefined;
        if (startDate && endDate) {
            const isValidStartDate = /^\d{4}-\d{2}-\d{2}$/.test(startDate);
            const isValidEndDate = /^\d{4}-\d{2}-\d{2}$/.test(endDate);
            if (!isValidStartDate || !isValidEndDate) {
                return res.status(400).json({ code: 1, message: 'Định dạng ngày không hợp lệ. Vui lòng sử dụng: yyyy-mm-dd.' });
            }
            selectedStartDate = new Date(startDate);
            selectedStartDate.setHours(0, 0, 0, 0);
            selectedEndDate = new Date(endDate);
            selectedEndDate.setHours(23, 59, 59, 999);
        }
        if (selectedStartDate && selectedEndDate) {
            where.createdAt = {
                [Op.gte]: selectedStartDate,
                [Op.lte]: selectedEndDate
            };
        }
        // Lấy các đơn hàng đã hoàn thành (is_completed = true)
        const orders = await Order.findAll({
            where: { ...where, is_completed: true }
        });
        const orderIds = orders.map(o => o.id);
        // Lấy tất cả order item của các đơn này
        const orderItems = await OrderItem.findAll({
            where: { order_id: { [Op.in]: orderIds } }
        });
        // Lấy các đơn hoàn trả đã hoàn thành
        const returnedOrders = await ReturnedOrder.findAll({
            where: { ...where, is_completed: true }
        });
        const returnedOrderIds = returnedOrders.map(o => o.id);
        const returnedOrderItems = await ReturnedOrderItem.findAll({
            where: { returned_order_id: { [Op.in]: returnedOrderIds } }
        });
        // Tổng số đơn hàng hoàn thành
        const totalOrders = orders.length;
        // Tổng số sản phẩm bán ra
        const totalProductsSold = orderItems.reduce((sum, item) => sum + Number(item.product_quantity), 0);
        // Tổng doanh thu (final_total của đơn hàng)
        const totalRevenue = orders.reduce((sum, order) => sum + Number(order.final_total), 0);
        // Tổng số tiền hoàn trả
        const totalRefund = returnedOrders.reduce((sum, ro) => sum + Number(ro.refund_amount), 0);
        // Tổng số sản phẩm hoàn trả
        const totalProductsRefunded = returnedOrderItems.reduce((sum, item) => sum + Number(item.product_quantity), 0);
        // Lợi nhuận tạm tính: doanh thu - hoàn trả (chưa trừ vốn)
        const profit = totalRevenue - totalRefund;
        return res.status(200).json({
            code: 0,
            message: 'Thống kê đơn hàng thành công',
            data: {
                totalOrders,
                totalProductsSold,
                totalRevenue,
                totalRefund,
                totalProductsRefunded,
                profit
            }
        });
    } catch (error) {
        return res.status(500).json({ code: 2, message: 'Thống kê đơn hàng thất bại', error: error.message });
    }
}; 