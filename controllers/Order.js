const Order = require('../database/models/Order');
const OrderItem = require('../database/models/OrderItem');
const { Op } = require('sequelize');
const sequelize = require('../database/sequelize');

const sendMail = require("../utils/sendMail.js")

const axiosProductService = require('../services/productService')
const axiosCustomerService = require('../services/customerService')
const axiosDiscountService = require('../services/discountService')
const axiosPaymentService = require('../services/paymentService')
const axiosUserService = require('../services/userService')
const axiosStoreService = require('../services/storeService')
const axiosShipmentService = require('../services/shipmentService')
const axiosNotificationService = require('../services/notificationService')

// axios gọi trực tiếp không thông qua api gateway để tránh lỗi vòng lặp
const axiosDirectProductService = require('../services/directProductService')
const axiosDirectStoreService = require('../services/directStoreService')

module.exports.getOrder = async (req, res) => {
    try {
        const { startDate, endDate, order_status, payment_status, seller_id } = req.query;

        const conditions = {};

        let selectedStartDate = undefined
        let selectedEndDate = undefined

        if (startDate && endDate) {
            const isValidStartDate = /^\d{4}-\d{2}-\d{2}$/.test(startDate);
            const isValidEndDate = /^\d{4}-\d{2}-\d{2}$/.test(endDate);

            if (!isValidStartDate || !isValidEndDate) {
                return res.status(400).json({ code: 1, message: 'Định dạng ngày không hợp lệ. Vui lòng sử dụng: yyyy-mm-dd.' });
            }

            selectedStartDate = new Date(startDate);
            selectedStartDate.setHours(0, 0, 0, 0); // 00:00:00

            selectedEndDate = new Date(endDate);
            selectedEndDate.setHours(23, 59, 59, 999); // 23:59:59.999
        }

        if (selectedStartDate && selectedEndDate) {
            conditions.createdAt = {
                [Op.gte]: selectedStartDate,
                [Op.lte]: selectedEndDate
            };
        }

        if (order_status && order_status !== '') {
            if (order_status.includes(',')) {
                // Nếu truyền nhiều trạng thái, tách thành mảng
                const statusArr = order_status.split(',').map(s => s.trim()).filter(Boolean);
                conditions.order_status = { [Op.in]: statusArr };
            } else {
                conditions.order_status = order_status;
            }
        }

        if (payment_status && payment_status !== '') {
            conditions.payment_status = payment_status;
        }

        if (seller_id && seller_id > 0) {
            conditions.seller_id = seller_id;
        }

        const orders = await Order.findAll({
            where: conditions,
            order: [
                // Đưa order_status = 'cancelled' xuống cuối cùng
                [sequelize.literal(`CASE WHEN order_status = 'cancelled' THEN 1 ELSE 0 END`), 'ASC'],

                // sắp xếp theo ngày tạo đơn hàng
                ['createdAt', 'DESC']
            ]
        });

        return res.status(200).json({ code: 0, message: 'Lấy danh sách đơn hàng thành công', data: orders });
    }
    catch (error) {
        return res.status(500).json({ code: 2, message: 'Lấy danh sách đơn hàng thất bại', error: error.message });
    }
}

module.exports.getOrdersByIds = async (req, res) => {

    try {
        const { ids } = req.body;

        const orders = await Order.findAll({
            where: {
                id: { [Op.in]: ids }
            }
        });

        return res.status(200).json({ code: 0, message: 'Lấy danh sách đơn hàng theo ids thành công', data: orders });
    }
    catch (error) {
        return res.status(500).json({ code: 2, message: 'Lấy danh sách đơn hàng theo ids thất bại', error: error.message });
    }
}

module.exports.createOrder = async (req, res) => {
    try {
        const { user_id, payment_method, payment_status, stores } = req.body;

        const errors = [];

        if (!user_id || user_id <= 0) errors.push('user_id cần cung cấp');
        if (!payment_method || payment_method === '') errors.push('payment_method cần cung cấp');
        if (!payment_status || payment_status === '') errors.push('payment_status cần cung cấp');
        if (!stores || !Array.isArray(stores)) errors.push('stores cần cung cấp');

        if (errors.length > 0) {
            return res.status(400).json({ code: 1, message: 'Xác thực thất bại', errors });
        };

        // kiểm tra tồn kho (gọi api của product service)
        const products = [];
        for (const store of stores) {
            for (const product of store.products) {
                products.push({
                    id: product.product_id,
                    name: product.product_name,
                    quantity: product.quantity
                });
            }
        }

        const response = await axiosProductService.post('/products/check-stock', {
            products: products
        });

        if (response.data.code !== 0) {
            return res.status(400).json({ code: 1, message: response.data.message || 'Sản phẩm không đủ hàng' });
        }

        //tạo thông tin các đơn hàng để gửi email
        const orders_info = [];

        // tạo các đơn hàng cùng chi tiết đơn hàng theo từng cửa hàng, tạo đồng thời
        const orderPromises = stores.map(async (store) => {

            const total = (store.original_items_total + store.original_shipping_fee) - (store.discount_amount_items + store.discount_amount_shipping + store.discount_amount_items_platform_allocated + store.discount_amount_shipping_platform_allocated);

            // Tạo đơn hàng cho mỗi cửa hàng
            const order = await Order.create({
                user_id,
                seller_id: store.seller_id,
                seller_name: store.seller_name,
                total_quantity: store.total_quantity,
                original_items_total: store.original_items_total,
                original_shipping_fee: store.original_shipping_fee,
                discount_amount_items: store.discount_amount_items,
                discount_amount_shipping: store.discount_amount_shipping,
                discount_amount_items_platform_allocated: store.discount_amount_items_platform_allocated,
                discount_amount_shipping_platform_allocated: store.discount_amount_shipping_platform_allocated,
                final_total: total,
                payment_method,
                payment_status
            });

            // Tạo chi tiết đơn hàng
            const orderItems = store.products.map(product => ({
                order_id: order.id,
                product_id: product.product_id,
                product_name: product.product_name,
                product_price: product.price,
                product_quantity: product.quantity,
                product_url_image: product.product_url_image
            }));

            await OrderItem.bulkCreate(orderItems);

            // tạo dữ liệu về các sản phẩm đã mua và cập nhật kho hàng (gọi api của product service)
            axiosProductService.post('/purchased-products/add', {
                user_id,
                order_id: order.id,
                seller_id: store.seller_id,
                list_product: orderItems.map(item => ({
                    product_id: item.product_id,
                    quantity: item.product_quantity,
                    total_price: item.product_price * item.product_quantity
                }))
            });

            // xóa các sản phẩm đã mua khỏi giỏ hàng (gọi api của customer service)
            axiosCustomerService.post('/carts/remove', {
                user_id,
                product_ids: orderItems.map(item => item.product_id)
            });

            axiosNotificationService.post('/notifications', {
                target_type: 'seller',
                title: 'Đơn hàng mới chờ xác nhận',
                body: `Đơn hàng mới #${order.id} đã được tạo, vui lòng xác nhận`,
                store_id: store.seller_id
            });

            axiosNotificationService.post('/notifications', {
                target_type: 'customer',
                title: 'Đặt hàng thành công',
                body: `Đơn hàng #${order.id} đã được đạt thành công`,
                target_id: user_id
            });

            // tạo thông tin các đơn hàng để gửi email (orders_info, mỗi phần từ là 1 đơn hàng, trong 1 đơn hàng ngoài các thông tin đơn hàng còn có các thông tin về các sản phẩm trong đơn hàng (order.order_items))
            orders_info.push({
                ...order.dataValues,
                order_items: orderItems
            });

            return order;
        });

        // Đợi tất cả đơn hàng và chi tiết đơn hàng được tạo
        const orders = await Promise.all(orderPromises);

        try {
            // gửi email thông tin đơn hàng, lấy ra token từ req.headers.authorization nếu có
            const token = req.headers.authorization ? req.headers.authorization.split(' ')[1] : null;
            sendOrdersInfoEmail(token, user_id, orders_info);
        }
        catch (error) {
            console.log('Gửi email thông tin đơn hàng thất bại', error);
        }

        return res.status(201).json({ code: 0, message: 'Tạo đơn hàng thành công', data: orders });

    }
    catch (error) {
        return res.status(500).json({ code: 2, message: 'Tạo đơn hàng thất bại', error: error.message });
    }
}

module.exports.updateOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { payment_status, order_status } = req.body;

        const errors = [];

        if (!id || id <= 0) errors.push('id cần cung cấp');

        if (errors.length > 0) {
            return res.status(400).json({ code: 1, message: 'Xác thực thất bại', errors });
        }

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({ code: 1, message: 'Đơn hàng không tồn tại' });
        }

        if (order.is_completed) {
            return res.status(400).json({ code: 1, message: 'Đơn hàng đã hoàn tất, không thể cập nhật' });
        }

        if (order_status && order_status !== '') {
            order.order_status = order_status;
        }

        if (payment_status && payment_status !== '') {
            order.payment_status = payment_status;
        }

        await order.save();

        if (order.is_completed) {
            // cập nhật dữ liệu về các sản phẩm đã mua (gọi api của product service)
            console.log('Cập nhật trạng thái đơn hàng đã hoàn tất, cập nhật dữ liệu về các sản phẩm đã mua');
            const response1 = await axiosDirectProductService.put('/purchased-products/update-status', {
                order_id: order.id,
                status: 'completed'
            });

            console.log('reponse data product-service:', response1.data);

            console.log('Cập nhật trạng thái đơn hàng đã hoàn tất, cập nhật dữ liệu về số dư cửa hàng');
            const response2 = await axiosDirectStoreService.put(`/stores/${order.seller_id}/balance`, {
                balance: order.final_total * 0.75,
                type: 'add',
            });

            console.log('reponse data store-service:', response2.data);
        }
        else {
            console.log('Cập nhật trạng thái đơn hàng chưa hoàn tất, không cập nhật dữ liệu về các sản phẩm đã mua và số dư cửa hàng');
        }

        // Gửi notification dựa vào trạng thái mới
        try {
            // Gửi notification cho từng trạng thái đơn hàng
            if (order_status && order_status !== '') {
                switch (order_status) {
                    case 'confirmed':
                        // Gửi cho seller
                        axiosNotificationService.post('/notifications', {
                            target_type: 'seller',
                            store_id: order.seller_id,
                            title: 'Đơn hàng đã được xác nhận',
                            body: `Đơn hàng #${order.id} đã được xác nhận, vui lòng chuẩn bị hàng để giao.`
                        });
                        // Gửi cho customer
                        axiosNotificationService.post('/notifications', {
                            target_type: 'customer',
                            target_id: order.user_id,
                            title: 'Đơn hàng đã được xác nhận',
                            body: `Đơn hàng #${order.id} của bạn đã được xác nhận và sẽ sớm được giao.`
                        });

                        axiosNotificationService.post('/notifications', {
                            target_type: 'shipper',
                            title: 'Có đơn giao hàng mới vừa được tạo.',
                            body: `Đơn giao vận cho đơn hàng #${order.id} vừa được tạo. Vui lòng đến địa điểm lấy hàng.`
                        });

                        axiosShipmentService.post('/shipments/shipping-orders', {
                            order_id: order.id,
                            user_id: order.user_id,
                            seller_id: order.seller_id,
                        });
                        break;

                    case 'ready_to_ship':
                        // Gửi cho seller
                        axiosNotificationService.post('/notifications', {
                            target_type: 'seller',
                            store_id: order.seller_id,
                            title: 'Đơn hàng đã được lấy hàng thành công',
                            body: `Đơn hàng #${order.id} đã được lấy hàng thành công.`
                        });
                        // Gửi cho customer
                        axiosNotificationService.post('/notifications', {
                            target_type: 'customer',
                            target_id: order.user_id,
                            title: 'Đơn hàng đã được lấy hàng thành công',
                            body: `Đơn hàng #${order.id} của bạn đã được lấy hàng thành công.`
                        });
                        break;

                    case 'shipping':
                        // Gửi cho customer
                        axiosNotificationService.post('/notifications', {
                            target_type: 'customer',
                            target_id: order.user_id,
                            title: 'Đơn hàng đang được giao',
                            body: `Đơn hàng #${order.id} của bạn đang được giao.`
                        });
                        break;
                    case 'delivered':
                        // Gửi cho customer
                        axiosNotificationService.post('/notifications', {
                            target_type: 'customer',
                            target_id: order.user_id,
                            title: 'Đơn hàng đã giao thành công',
                            body: `Đơn hàng #${order.id} của bạn đã được giao thành công. Cảm ơn bạn đã mua hàng!`
                        });
                        break;
                    case 'cancelled':
                        // Gửi cho customer
                        axiosNotificationService.post('/notifications', {
                            target_type: 'customer',
                            target_id: order.user_id,
                            title: 'Đơn hàng đã bị hủy',
                            body: `Đơn hàng #${order.id} của bạn đã bị hủy.`
                        });
                        // Gửi cho seller
                        axiosNotificationService.post('/notifications', {
                            target_type: 'seller',
                            target_id: order.seller_id,
                            store_id: order.seller_id,
                            title: 'Đơn hàng đã bị hủy',
                            body: `Đơn hàng #${order.id} đã bị khách hàng hủy.`
                        });
                        break;
                    case 'refunded':
                        // Gửi cho customer
                        axiosNotificationService.post('/notifications', {
                            target_type: 'customer',
                            target_id: order.user_id,
                            title: 'Đơn hàng đã được hoàn tiền',
                            body: `Đơn hàng #${order.id} của bạn đã được hoàn tiền.`
                        });
                        break;
                    default:
                        break;
                }
            }
            // Gửi notification khi thanh toán thành công
            if (payment_status && payment_status === 'completed') {
                axiosNotificationService.post('/notifications', {
                    target_type: 'customer',
                    target_id: order.user_id,
                    title: 'Thanh toán thành công',
                    body: `Đơn hàng #${order.id} của bạn đã được thanh toán thành công.`
                });
            }
        } catch (notifyErr) {
            console.log('Gửi notification thất bại:', notifyErr);
        }

        return res.status(200).json({ code: 0, message: 'Cập nhật đơn hàng thành công', data: order });
    }
    catch (error) {
        return res.status(500).json({ code: 2, message: 'Cập nhật đơn hàng thất bại', error: error.message });
    }
}

module.exports.cancelOrder = async (req, res) => {
    try {
        const { id } = req.params;

        const errors = [];

        if (!id || id <= 0) errors.push('id cần cung cấp');

        if (errors.length > 0) {
            return res.status(400).json({ code: 1, message: 'Xác thực thất bại', errors });
        }

        const order = await Order.findByPk(id);
        if (!order) {
            return res.status(404).json({ code: 1, message: 'Đơn hàng không tồn tại' });
        }

        if (order.is_completed) {
            return res.status(400).json({ code: 1, message: 'Đơn hàng đã hoàn tất, không thể hủy' });
        }

        if (order.payment_status !== 'pending') {
            return res.status(400).json({ code: 1, message: 'Đơn hàng đã được thanh toán, không thể hủy' });
        }

        if (order.order_status !== 'pending') {
            return res.status(400).json({ code: 1, message: 'Đơn hàng đang được xử lý, không thể hủy' });
        }

        order.order_status = 'cancelled';
        await order.save();

        // cập nhật trạng thái thanh toán đã hủy giao dịch (gọi api của payment service)
        axiosPaymentService.patch(`/payments/order/${order.id}/status`, {
            status: 'cancelled'
        });

        // xóa dữ liệu về các sản phẩm đã mua (gọi api của product service)
        axiosProductService.delete(`/purchased-products/cancel/${order.id}`);

        //hoàn lại voucher đã áp dụng
        axiosDiscountService.delete(`/voucher-usages/restore/${order.id}`);

        return res.status(200).json({ code: 0, message: 'Hủy đơn hàng thành công', data: order });
    }
    catch (error) {
        return res.status(500).json({ code: 2, message: 'Hủy đơn hàng thất bại', error: error.message });
    }
}

module.exports.getOrderByUserId = async (req, res) => {
    try {
        const { user_id } = req.query;
        const { startDate, endDate, order_status } = req.query;

        const errors = [];

        if (!user_id || user_id <= 0) errors.push('user_id cần cung cấp');

        if (errors.length > 0) {
            return res.status(400).json({ code: 1, message: 'Xác thực thất bại', errors });
        }

        const conditions = {
            user_id
        };

        let selectedStartDate = undefined
        let selectedEndDate = undefined

        if (startDate && endDate) {
            const isValidStartDate = /^\d{4}-\d{2}-\d{2}$/.test(startDate);
            const isValidEndDate = /^\d{4}-\d{2}-\d{2}$/.test(endDate);

            if (!isValidStartDate || !isValidEndDate) {
                return res.status(400).json({ code: 1, message: 'Định dạng ngày không hợp lệ. Vui lòng sử dụng: yyyy-mm-dd.' });
            }

            selectedStartDate = new Date(startDate);
            selectedStartDate.setHours(0, 0, 0, 0); // 00:00:00

            selectedEndDate = new Date(endDate);
            selectedEndDate.setHours(23, 59, 59, 999); // 23:59:59.999
        }

        if (selectedStartDate && selectedEndDate) {
            conditions.createdAt = {
                [Op.gte]: selectedStartDate,
                [Op.lte]: selectedEndDate
            };
        }

        if (order_status && order_status !== '') {
            conditions.order_status = order_status;
        }

        const orders = await Order.findAll({
            where: conditions,
            order: [
                // Đưa order_status = 'cancelled' xuống cuối cùng
                [sequelize.literal(`CASE WHEN order_status = 'cancelled' THEN 1 ELSE 0 END`), 'ASC'],

                // sắp xếp theo ngày tạo đơn hàng
                ['createdAt', 'DESC']
            ]
        });

        return res.status(200).json({ code: 0, message: 'Lấy danh sách đơn hàng theo id người dùng thành công', data: orders });
    }
    catch (error) {
        return res.status(500).json({ code: 2, message: 'Lấy đơn hàng theo id người dùng thất bại', error: error.message });
    }
}

module.exports.getOrderBySellerId = async (req, res) => {
    try {
        const { seller_id } = req.params;
        const { startDate, endDate, order_status } = req.query;

        const errors = [];

        if (!seller_id || seller_id <= 0) errors.push('seller_id cần cung cấp');

        if (errors.length > 0) {
            return res.status(400).json({ code: 1, message: 'Xác thực thất bại', errors });
        }

        const conditions = {
            seller_id
        };

        let selectedStartDate = undefined
        let selectedEndDate = undefined

        if (startDate && endDate) {
            const isValidStartDate = /^\d{4}-\d{2}-\d{2}$/.test(startDate);
            const isValidEndDate = /^\d{4}-\d{2}-\d{2}$/.test(endDate);

            if (!isValidStartDate || !isValidEndDate) {
                return res.status(400).json({ code: 1, message: 'Định dạng ngày không hợp lệ. Vui lòng sử dụng: yyyy-mm-dd.' });
            }

            selectedStartDate = new Date(startDate);
            selectedStartDate.setHours(0, 0, 0, 0); // 00:00:00

            selectedEndDate = new Date(endDate);
            selectedEndDate.setHours(23, 59, 59, 999); // 23:59:59.999
        }

        if (selectedStartDate && selectedEndDate) {
            conditions.createdAt = {
                [Op.gte]: selectedStartDate,
                [Op.lte]: selectedEndDate
            };
        }

        if (order_status && order_status !== '') {
            conditions.order_status = order_status;
        }

        const orders = await Order.findAll({
            where: conditions,
            order: [
                // Đưa order_status = 'cancelled' xuống cuối cùng
                [sequelize.literal(`CASE WHEN order_status = 'cancelled' THEN 1 ELSE 0 END`), 'ASC'],

                // sắp xếp theo ngày tạo đơn hàng
                ['createdAt', 'DESC']
            ]
        });

        return res.status(200).json({ code: 0, message: 'Lấy danh sách đơn hàng theo id người bán thành công', data: orders });
    }
    catch (error) {
        return res.status(500).json({ code: 2, message: 'Lấy đơn hàng theo id người bán thất bại', error: error.message });
    }
}

module.exports.getOrderById = async (req, res) => {
    try {
        const { id } = req.params;

        const order = await Order.findByPk(id);

        if (!order) {
            return res.status(404).json({ code: 1, message: 'Đơn hàng không tồn tại' });
        }

        return res.status(200).json({ code: 0, message: 'Lấy đơn hàng theo id thành công', data: order });
    }
    catch (error) {
        return res.status(500).json({ code: 2, message: 'Lấy đơn hàng theo id thất bại', error: error.message });
    }
}

module.exports.getOrderDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const orderItems = await OrderItem.findAll({
            where: {
                order_id: id
            }
        });

        if (!orderItems || orderItems.length === 0) {
            return res.status(404).json({ code: 1, message: 'Chi tiết đơn hàng không tồn tại' });
        }

        return res.status(200).json({ code: 0, message: 'Lấy chi tiết đơn hàng thành công', data: orderItems });
    }
    catch (error) {
        return res.status(500).json({ code: 2, message: 'Lấy chi tiết đơn hàng thất bại', error: error.message });
    }
}

const sendOrdersInfoEmail = async (token, user_id, orders_info) => {
    try {
        // lấy thông tin người dùng (gọi api của user service)
        const response = await axiosUserService.get(`/users/${user_id}`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (response.data.code !== 0) {
            console.log('Lấy thông tin người dùng thất bại', response.data.message);
            throw new Error(response.data.message);
        }

        const { email, fullname } = response.data.data;

        await sendMail({
            to: email, subject: 'Đặt hàng thành công', text: 'Đơn hàng mới đã được tạo',
            html: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Bill</title>
                <style>
                    table {
                        border-collapse: collapse;
                        width: 100%;
                    }
                    th, td {
                        border: 1px solid #dddddd;
                        text-align: left;
                        padding: 8px;
                    }
                    th {
                        background-color: #f2f2f2;
                    }
                </style>
            </head>
            <body>
                <p>Xin chào ${fullname},</p>
                <p>Đơn hàng mới đã được tạo thành công.</p>
                <br>
                ${orders_info.map(order => `

                    <h2>Đơn hàng từ ${order.seller_name}</h2>
                    <table>
                        ${order.id && `
                            <tr>
                                <th>Mã đơn hàng</th>
                                <td>${order.id}</td>
                            </tr>
                        `}
                        <tr>
                            <th>Nhà bán</th>
                            <td>${order.seller_name}</td>
                        </tr>
                        <tr>
                            <th>Ngày tạo</th>
                            <td>${new Date(order.createdAt).toLocaleDateString('vi-VN')}</td>
                        </tr>
                        <tr>
                            <th>Tổng số lượng sản phẩm</th>
                            <td>${order.total_quantity}</td>
                        </tr>
                        <tr>
                            <th>Phí vận chuyển</th>
                            <td>${formatPrice(order.original_shipping_fee)}</td>
                        </tr>
                        <tr>
                            <th>Tổng giảm giá từ voucher</th>
                            <td>${formatPrice(Number(order.discount_amount_items || 0) +
                Number(order.discount_amount_shipping || 0) +
                Number(order.discount_amount_items_platform_allocated || 0) +
                Number(order.discount_amount_shipping_platform_allocated || 0))}</td>
                        </tr>
                        <tr>
                            <th>Phương thức thanh toán</th>
                            <td>${order.payment_method}</td>
                        </tr>
                        <tr>
                            <th>Tổng tiền đơn hàng</th>
                            <td style="font-weight: bold; color: red;">${formatPrice(order.final_total)}</td>
                        </tr>
                    </table>
                    <br>
                    <table>
                        <tr>
                            <th>Tên sản phẩm</th>
                            <th>Số lượng</th>
                            <th>Đơn giá</th>
                            <th>Thành tiền</th>
                        </tr>
                    ${order.order_items.map(item => `
                        <tr>
                            <td>${item.product_name}</td>
                            <td>${item.product_quantity}</td>
                            <td>${formatPrice(item.product_price)}</td>
                            <td>${formatPrice(item.product_price * item.product_quantity)}</td>
                        </tr>
                    `).join('')}
                    </table>
                    <br>
                `).join('')}
                <br>
                <p>Tổng tiền: <span style="font-weight: bold; color: red; font-size: 1.5em;">${formatPrice(orders_info.reduce((total, order) => total + Number(order.final_total || 0), 0))}</span></p>
                <br>
                <p>Cảm ơn bạn đã đặt hàng tại PharmaMart Tuan-Thanh.</p>
                <p>Nếu có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi.</p>
                <p>Trân trọng,</p>
                <p>PharmaMart Tuan-Thanh</p>
            </body>
            </html>
        `
        });

        return true;
    }
    catch (error) {
        console.log(error);
        return false;
    }
}

const formatPrice = (price) => {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(price);
};

// LẤY DANH SÁCH ĐƠN HÀNG KÈM VẬN CHUYỂN VÀ USER, ĐẾM SỐ LƯỢNG THEO NHÓM TRẠNG THÁI
module.exports.getAllOrdersWithDetails = async (req, res) => {
    try {
        const { startDate, endDate, order_status, payment_status, seller_id } = req.query;
        const conditions = {};
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
            conditions.createdAt = {
                [Op.gte]: selectedStartDate,
                [Op.lte]: selectedEndDate
            };
        }
        if (order_status && order_status !== '') {
            if (order_status.includes(',')) {
                // Nếu truyền nhiều trạng thái, tách thành mảng
                const statusArr = order_status.split(',').map(s => s.trim()).filter(Boolean);
                conditions.order_status = { [Op.in]: statusArr };
            } else {
                conditions.order_status = order_status;
            }
        }
        if (payment_status && payment_status !== '') {
            conditions.payment_status = payment_status;
        }
        if (seller_id && seller_id > 0) {
            conditions.seller_id = seller_id;
        }
        // Lấy tất cả đơn hàng theo filter hiện tại
        const orders = await Order.findAll({
            where: conditions,
            order: [
                [sequelize.literal(`CASE WHEN order_status = 'cancelled' THEN 1 ELSE 0 END`), 'ASC'],
                ['createdAt', 'DESC']
            ]
        });
        // Đếm số lượng theo nhóm trạng thái trên toàn bộ đơn hàng (chỉ filter seller_id nếu có)
        const countWhere = seller_id && seller_id > 0 ? { seller_id } : {};
        const allOrders = await Order.findAll({ where: countWhere });
        const statusCount = {
            pending: 0,
            confirmed: 0,
            ready_to_ship_shipping: 0, // ready_to_ship + shipping
            delivered: 0,
            cancelled_refunded: 0, // cancelled + refunded
            total: 0
        };
        for (const order of allOrders) {
            statusCount.total++;
            if (order.order_status === 'pending') statusCount.pending++;
            else if (order.order_status === 'confirmed') statusCount.confirmed++;
            else if (['ready_to_ship', 'shipping'].includes(order.order_status)) statusCount.ready_to_ship_shipping++;
            else if (order.order_status === 'delivered') statusCount.delivered++;
            else if (['cancelled', 'refunded'].includes(order.order_status)) statusCount.cancelled_refunded++;
        }
        // Lấy thông tin shipment và user cho từng đơn hàng
        const results = await Promise.all(orders.map(async (order) => {
            let shipment = null;
            try {
                const shipmentRes = await axiosShipmentService.get(`/shipments/shipping-orders/order/${order.id}`);
                if (shipmentRes.data.code === 0) {
                    shipment = shipmentRes.data.data;
                }
            } catch (e) { shipment = null; }
            let userInfo = null;
            try {
                const userRes = await axiosUserService.get(`users/info/${order.user_id}`);
                if (userRes.data && userRes.data.data) {
                    userInfo = userRes.data.data;
                }
            } catch (e) { userInfo = null; }
            return {
                ...order.dataValues,
                shipment,
                user: userInfo
            };
        }));
        // Tổng số đơn hàng theo filter hiện tại
        const total = orders.length;
        return res.status(200).json({
            code: 0,
            message: 'Lấy danh sách đơn hàng chi tiết thành công',
            data: results,
            statusCount,
            total
        });
    } catch (error) {
        return res.status(500).json({ code: 2, message: 'Lấy danh sách đơn hàng chi tiết thất bại', error: error.message });
    }
}
