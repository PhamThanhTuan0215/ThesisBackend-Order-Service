const Order = require('../database/models/Order');
const OrderItem = require('../database/models/OrderItem');
const OrderReturnRequest = require('../database/models/OrderReturnRequest');
const ReturnedOrder = require('../database/models/ReturnedOrder');
const ReturnedOrderItem = require('../database/models/ReturnedOrderItem');
const sequelize = require('../database/sequelize');
const { Op } = require('sequelize');

const axiosShipmentService = require('../services/shipmentService')
const axiosProductService = require('../services/productService')
const axiosNotificationService = require('../services/notificationService')

const { uploadFiles, deleteFile } = require('../utils/manageFilesOnCloudinary')

const multer = require('multer');
const storage = multer.memoryStorage();

// Cấu hình multer
const uploadConfig = {
    storage: storage,
    fileFilter: (req, file, cb) => {
        // Kiểm tra loại file
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Chỉ chấp nhận file hình ảnh!'), false);
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024, // tăng giới hạn mỗi file lên 10MB
        fieldSize: 10 * 1024 * 1024, // tăng giới hạn kích thước field
        files: 10 // cho phép tối đa 10 files
    }
};

const upload = multer(uploadConfig);

const folderPathUpload = 'ecommerce-pharmacy/order-return-requests'

// Middleware xử lý lỗi upload
const handleUploadError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                code: 1,
                message: 'File quá lớn. Giới hạn là 10MB cho mỗi file'
            });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                code: 1,
                message: 'Số lượng file vượt quá giới hạn. Tối đa 10 files'
            });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                code: 1,
                message: 'Tên field không đúng. Vui lòng sử dụng "image_related"'
            });
        }
        return res.status(400).json({
            code: 1,
            message: 'Lỗi upload file: ' + err.message
        });
    }
    if (err) {
        return res.status(400).json({
            code: 1,
            message: err.message
        });
    }
    next();
};

// Export middleware upload
module.exports.uploadCustom = [
    upload.fields([
        { name: 'image_related', maxCount: 10 }
    ]),
    handleUploadError
];

// Tạo yêu cầu hoàn trả
exports.createReturnRequest = async (req, res) => {

    let public_id_image_related = []

    const transaction = await sequelize.transaction();
    try {
        const { order_id } = req.params;
        const { reason, customer_message, customer_shipping_address_id, items: raw_items } = req.body;

        const items = JSON.parse(raw_items);

        // Kiểm tra đơn hàng có tồn tại và đã hoàn thành
        const order = await Order.findOne({
            where: {
                id: order_id,
                is_completed: true
            }
        });

        if (!order) {
            return res.status(404).json({
                code: 1,
                message: 'Đơn hàng không tồn tại hoặc chưa hoàn thành'
            });
        }

        // Kiểm tra yêu cầu hoàn trả đã tồn tại
        const existingRequest = await OrderReturnRequest.findOne({
            where: {
                order_id,
                status: {
                    [Op.in]: ['requested', 'accepted']
                }
            }
        });

        if (existingRequest && existingRequest.status === 'requested') {
            return res.status(400).json({
                code: 1,
                message: 'Yêu cầu hoàn trả đã tồn tại, vui lòng chờ phản hồi'
            });
        }

        if (existingRequest && existingRequest.status === 'accepted') {
            return res.status(400).json({
                code: 1,
                message: 'Yêu cầu hoàn trả đã được chấp nhận, vui lòng chờ hoàn trả'
            });
        }

        let image_related_files = [];
        let url_images_related = [];

        if (req.files && req.files['image_related']) {
            image_related_files = req.files['image_related'];
        }

        if (image_related_files.length > 0) {
            const results = await uploadFiles(image_related_files, folderPathUpload);

            results.forEach(result => {
                url_images_related.push(result.secure_url);
                public_id_image_related.push(result.public_id);
            });
        }

        const orderItems = await OrderItem.findAll({
            where: {
                order_id
            }
        });

        // Tạo yêu cầu hoàn trả
        const returnRequest = await OrderReturnRequest.create({
            order_id,
            seller_id: order.seller_id,
            user_id: order.user_id,
            reason,
            customer_message,
            url_images_related,
            status: 'requested',
            request_at: new Date(),
            customer_shipping_address_id,
        }, { transaction });

        // Tạo các sản phẩm trong yêu cầu hoàn trả
        const promises = items.map(async (item) => {
            const orderItem = orderItems.find(oi => oi.id == item.id);
            if (!orderItem) {
                throw new Error(`Sản phẩm có id là ${item.product_id} không tồn tại trong đơn hàng`);
            }
            if (item.product_quantity > orderItem.product_quantity) {
                throw new Error(`Số lượng hoàn trả không được vượt quá số lượng sản phẩm trong đơn hàng`);
            }
            return ReturnedOrderItem.create({
                order_return_request_id: returnRequest.id,
                product_id: orderItem.product_id,
                product_name: orderItem.product_name,
                product_price: orderItem.product_price,
                product_quantity: item.product_quantity,
                product_url_image: orderItem.product_url_image
            }, { transaction });
        });
        await Promise.all(promises);

        await transaction.commit();

        axiosNotificationService.post('/notifications', {
            target_type: 'customer',
            target_id: order.user_id,
            title: 'Yêu cầu hoàn trả đã được gửi',
            body: `Yêu cầu hoàn trả #${returnRequest.id} đã được gửi.`
        });

        axiosNotificationService.post('/notifications', {
            target_type: 'seller',
            store_id: order.seller_id,
            title: 'Có yêu cầu hoàn trả mới',
            body: `Có yêu cầu hoàn trả mới từ đơn hàng #${order.id}.`
        });

        return res.status(201).json({
            code: 0,
            message: 'Yêu cầu hoàn trả đã được gửi thành công',
            data: returnRequest
        });

    } catch (error) {
        await transaction.rollback();
        if (public_id_image_related.length > 0) {
            public_id_image_related.forEach(public_id => {
                deleteFile(public_id);
            });
        }
        return res.status(500).json({
            code: 2,
            message: error.message
        });
    }
};

// Xóa yêu cầu hoàn trả
exports.deleteReturnRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const returnRequest = await OrderReturnRequest.findOne({
            where: { id }
        });

        if (!returnRequest) {
            return res.status(404).json({
                code: 1,
                message: 'Yêu cầu hoàn trả không tồn tại'
            });
        }

        let public_ids_image_related = [];

        if (returnRequest.url_images_related && returnRequest.url_images_related.length > 0) {
            public_ids_image_related = returnRequest.url_images_related.map(url => {
                return extractFolderFromURL(url) + url.split('/').pop().split('.')[0];
            });
        }

        await returnRequest.destroy();

        if (public_ids_image_related.length > 0) {
            public_ids_image_related.forEach(public_id => {
                deleteFile(public_id);
            });
        }

        return res.status(200).json({
            code: 0,
            message: 'Yêu cầu hoàn trả đã được hủy thành công'
        });
    } catch (error) {
        return res.status(500).json({
            code: 2,
            message: error.message
        });
    }
};

// Lấy danh sách yêu cầu hoàn trả
exports.getReturnRequests = async (req, res) => {
    try {
        const { status, seller_id, user_id } = req.query;
        const where = {};

        if (seller_id) {
            where.seller_id = seller_id;
        }

        if (user_id) {
            where.user_id = user_id;
        }

        if (status) {
            if (!['requested', 'accepted', 'rejected'].includes(status)) {
                return res.status(400).json({
                    code: 1,
                    message: 'Trạng thái không hợp lệ'
                });
            }
            where.status = status;
        }

        const requests = await OrderReturnRequest.findAll({
            where,
            include: [
                {
                    model: Order,
                    attributes: ['id', 'total_quantity', 'final_total', 'createdAt', 'updatedAt']
                }
            ],
            order: [['request_at', 'DESC']]
        });

        return res.json({
            code: 0,
            message: 'Lấy danh sách yêu cầu hoàn trả thành công',
            data: requests
        });
    } catch (error) {
        return res.status(500).json({
            code: 2,
            message: error.message
        });
    }
};

// Lấy yêu cầu hoàn trả bằng id
exports.getReturnRequestById = async (req, res) => {
    try {
        const { id } = req.params;
        const returnRequest = await OrderReturnRequest.findByPk(id);

        if (!returnRequest) {
            return res.status(404).json({ code: 1, message: 'Yêu cầu hoàn trả không tồn tại' });
        }

        return res.json({ code: 0, message: 'Lấy yêu cầu hoàn trả thành công', data: returnRequest });
    } catch (error) {
        return res.status(500).json({
            code: 2,
            message: error.message
        });
    }
}

// Lấy chi tiết các sản phẩm trong yêu cầu hoàn trả hoặc đơn hoàn trả (dùng chung 1 hàm)
exports.getReturnedOrderDetail = async (req, res) => {
    try {
        // order_return_request_id và returned_order_id chỉ cung cấp 1 trong 2
        const { order_return_request_id, returned_order_id } = req.query;

        const where = {};

        if (order_return_request_id) {
            where.order_return_request_id = order_return_request_id;
        }

        if (returned_order_id) {
            where.returned_order_id = returned_order_id;
        }

        const returnedOrderItems = await ReturnedOrderItem.findAll({
            where
        });

        if (!returnedOrderItems || returnedOrderItems.length === 0) {
            return res.status(404).json({ code: 1, message: 'Chi tiết đơn hàng hoàn trả không tồn tại' });
        }

        return res.json({
            code: 0,
            message: 'Lấy chi tiết đơn hàng hoàn trả thành công',
            data: returnedOrderItems
        });
    } catch (error) {
        return res.status(500).json({
            code: 2,
            message: error.message
        });
    }
};

// Phản hồi yêu cầu hoàn trả (chấp nhận/từ chối)
exports.responseReturnRequest = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { request_id } = req.params;
        const { status, response_message } = req.body;

        if (!['accepted', 'rejected'].includes(status)) {
            return res.status(400).json({
                code: 1,
                message: 'Trạng thái không hợp lệ'
            });
        }

        const request = await OrderReturnRequest.findOne({
            where: {
                id: request_id,
                status: {
                    [Op.or]: ['requested', 'rejected']
                }
            }
        });

        if (!request) {
            return res.status(404).json({
                code: 1,
                message: 'Yêu cầu hoàn trả không tồn tại hoặc không ở trạng thái chờ phản hồi'
            });
        }

        // Update request status
        request.status = status;
        request.response_message = response_message;
        request.response_at = new Date();
        await request.save({ transaction });

        // lấy đơn hàng gốc
        const order = await Order.findOne({
            where: {
                id: request.order_id
            }
        });

        if (status === 'accepted') {
            // lấy dánh sách returned_order_item
            const returnedOrderItems = await ReturnedOrderItem.findAll({
                where: {
                    order_return_request_id: request.id
                }
            });

            const order_original_items_total = order.original_items_total;
            const order_discount_amount_items = order.discount_amount_items;
            const order_discount_amount_items_platform_allocated = order.discount_amount_items_platform_allocated;

            const total_items_price = Number(order_original_items_total); // tổng tiền các sản phẩm trong đơn hàng gốc
            const total_discount_amount_items = Number(order_discount_amount_items) + Number(order_discount_amount_items_platform_allocated); // tổng tiền đã được giảm giá các sản phẩm trong đơn hàng gốc

            const total_quantity = returnedOrderItems.reduce((acc, item) => acc + item.product_quantity, 0);

            // tính toán tổng số tiền cần hoàn trả cho đơn hàng hoàn trả
            const refund_amount = calculateReturnAmountOrder(total_items_price, total_discount_amount_items, returnedOrderItems);

            // tính toán tiền vận chuyển cần hoàn trả (gọi api shipment service)
            const response = await axiosShipmentService.post('/shipments/return-shipping-fee', {
                customer_shipping_address_id: request.customer_shipping_address_id,
                seller_id: order.seller_id
            });

            // if (response.data.code !== 0) {
            //     return res.status(400).json({ code: 1, message: response.data.message || 'Có lỗi khi tính toán tiền vận chuyển cần hoàn trả' });
            // }

            const return_shipping_fee = response.data.data || 30000; // tiền vận chuyển cần hoàn trả

            // tạo returned_order
            const returnedOrder = await ReturnedOrder.create({
                order_return_request_id: request.id,
                order_id: order.id,
                seller_id: order.seller_id,
                seller_name: order.seller_name,
                user_id: request.user_id,
                total_quantity: total_quantity,
                return_shipping_fee: return_shipping_fee,
                return_shipping_fee_paid_by: request.return_shipping_fee_paid_by,
                refund_amount: refund_amount,
                order_status: 'processing',
                payment_refund_status: 'pending'
            }, { transaction });

            // cập nhật returned_order_id vào các returned_order_item
            const promises = returnedOrderItems.map(async (item) => {
                item.returned_order_id = returnedOrder.id;
                await item.save({ transaction });
            });
            await Promise.all(promises);

            // tạo vận đơn hoàn trả
            axiosShipmentService.post('/shipments/shipping-orders', {
                order_id: order.id,
                returned_order_id: returnedOrder.id,
                user_id: order.user_id,
                seller_id: order.seller_id,
            });

            // gửi notification cho customer
            axiosNotificationService.post('/notifications', {
                target_type: 'customer',
                target_id: order.user_id,
                title: 'Yêu cầu hoàn trả đã được chấp nhận',
                body: `Yêu cầu hoàn trả #${request.id} đã được chấp nhận.`
            });
        }
        else {
            if (req.user.role === 'admin_system' || req.user.role === 'staff_system') {
                axiosNotificationService.post('/notifications', {
                    target_type: 'seller',
                    store_id: order.seller_id,
                    title: 'Yêu cầu từ chối hoàn trả đã được chấp nhận',
                    body: `Yêu cầu từ chối hoàn trả #${request.id} đã được chấp nhận.`
                });

                axiosNotificationService.post('/notifications', {
                    target_type: 'customer',
                    target_id: order.user_id,
                    title: 'Yêu cầu hoàn trả của bạn đã bị từ chối',
                    body: `Yêu cầu hoàn trả #${request.id} của bạn đã bị từ chối.`
                });
            }
            else {
                axiosNotificationService.post('/notifications', {
                    target_type: 'platform',
                    title: 'Có yêu cầu từ chối hoàn trả mới',
                    body: `Có yêu cầu từ chối hoàn trả mới từ đơn hàng #${order.id}.`
                });
            }
        }

        await transaction.commit();
        return res.json({
            code: 0,
            message: 'Phản hồi yêu cầu hoàn trả thành công',
            data: request
        });

    } catch (error) {
        await transaction.rollback();
        return res.status(500).json({
            code: 2,
            message: error.message
        });
    }
};

// Lấy danh sách đơn hàng hoàn trả
exports.getReturnedOrders = async (req, res) => {
    try {
        const { seller_id, user_id, order_status, payment_refund_status } = req.query;
        const where = {};

        if (seller_id) {
            where.seller_id = seller_id;
        }

        if (user_id) {
            where.user_id = user_id;
        }
        if (order_status) {
            if (!['processing', 'returned', 'failed'].includes(order_status)) {
                return res.status(400).json({
                    code: 1,
                    message: 'Trạng thái đơn hàng không hợp lệ'
                });
            }
            where.order_status = order_status;
        }

        if (payment_refund_status) {
            if (!['pending', 'completed', 'failed'].includes(payment_refund_status)) {
                return res.status(400).json({
                    code: 1,
                    message: 'Trạng thái hoàn tiền không hợp lệ'
                });
            }
            where.payment_refund_status = payment_refund_status;
        }

        const returnedOrders = await ReturnedOrder.findAll({
            where,
            order: [['returned_at', 'DESC']]
        });

        return res.json({
            code: 0,
            message: 'Lấy danh sách đơn hàng hoàn trả thành công',
            data: returnedOrders
        });
    } catch (error) {
        return res.status(500).json({
            code: 2,
            message: error.message
        });
    }
};

// Lấy đơn hàng hoàn trả bằng id
exports.getReturnedOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const returnedOrder = await ReturnedOrder.findByPk(id);

        if (!returnedOrder) {
            return res.status(404).json({ code: 1, message: 'Đơn hàng hoàn trả không tồn tại' });
        }

        return res.json({ code: 0, message: 'Lấy đơn hàng hoàn trả thành công', data: returnedOrder });
    } catch (error) {
        return res.status(500).json({
            code: 2,
            message: error.message
        });
    }
}

// Cập nhật đơn hàng hoàn trả
exports.updateReturnedOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { order_status, payment_refund_status } = req.body;

        const returnedOrder = await ReturnedOrder.findByPk(id);

        if (!returnedOrder) {
            return res.status(404).json({ code: 1, message: 'Đơn hàng hoàn trả không tồn tại' });
        }

        if (returnedOrder.is_completed) {
            return res.status(400).json({ code: 1, message: 'Đơn hàng hoàn trả đã hoàn tất, không thể cập nhật' });
        }

        if (order_status && order_status !== '') {
            returnedOrder.order_status = order_status;
        }

        if (payment_refund_status && payment_refund_status !== '') {
            returnedOrder.payment_refund_status = payment_refund_status;
        }

        await returnedOrder.save();

        // Gửi notification dựa vào trạng thái mới
        try {
            if (order_status && order_status !== '') {
                switch (order_status) {
                    case 'ready_to_ship':
                        // Gửi cho seller
                        axiosNotificationService.post('/notifications', {
                            target_type: 'seller',
                            store_id: returnedOrder.seller_id,
                            title: 'Đơn hoàn trả đã lấy hàng thành công',
                            body: `Đơn hoàn trả #${returnedOrder.id} đã lấy hàng thành công.`
                        });
                        // Gửi cho customer
                        axiosNotificationService.post('/notifications', {
                            target_type: 'customer',
                            target_id: returnedOrder.user_id,
                            title: 'Đơn hoàn trả đã lấy hàng thành công',
                            body: `Đơn hoàn trả #${returnedOrder.id} của bạn đã lấy hàng thành công.`
                        });
                        break;
                    case 'shipping':
                        // Gửi cho customer
                        axiosNotificationService.post('/notifications', {
                            target_type: 'customer',
                            target_id: returnedOrder.user_id,
                            title: 'Đơn hoàn trả đang được vận chuyển',
                            body: `Đơn hoàn trả #${returnedOrder.id} của bạn đang được vận chuyển.`
                        });
                        break;
                    case 'returned':
                        // Gửi cho customer
                        axiosNotificationService.post('/notifications', {
                            target_type: 'customer',
                            target_id: returnedOrder.user_id,
                            title: 'Đơn hoàn trả đã hoàn thành',
                            body: `Đơn hoàn trả #${returnedOrder.id} của bạn đã hoàn thành.`
                        });
                        // Gửi cho seller
                        axiosNotificationService.post('/notifications', {
                            target_type: 'seller',
                            store_id: returnedOrder.seller_id,
                            title: 'Đơn hoàn trả đã hoàn thành',
                            body: `Đơn hoàn trả #${returnedOrder.id} đã hoàn thành.`
                        });
                        break;
                    case 'failed':
                        // Gửi cho customer
                        axiosNotificationService.post('/notifications', {
                            target_type: 'customer',
                            target_id: returnedOrder.user_id,
                            title: 'Đơn hoàn trả thất bại',
                            body: `Đơn hoàn trả #${returnedOrder.id} của bạn đã thất bại.`
                        });
                        // Gửi cho seller
                        axiosNotificationService.post('/notifications', {
                            target_type: 'seller',
                            store_id: returnedOrder.seller_id,
                            title: 'Đơn hoàn trả thất bại',
                            body: `Đơn hoàn trả #${returnedOrder.id} đã thất bại.`
                        });
                        break;
                    default:
                        break;
                }
            }
            if (payment_refund_status && payment_refund_status !== '') {
                switch (payment_refund_status) {
                    case 'completed':
                        axiosNotificationService.post('/notifications', {
                            target_type: 'customer',
                            target_id: returnedOrder.user_id,
                            title: 'Hoàn tiền thành công',
                            body: `Đơn hoàn trả #${returnedOrder.id} của bạn đã được hoàn tiền thành công.`
                        });
                        break;
                    case 'failed':
                        axiosNotificationService.post('/notifications', {
                            target_type: 'customer',
                            target_id: returnedOrder.user_id,
                            title: 'Hoàn tiền thất bại',
                            body: `Đơn hoàn trả #${returnedOrder.id} của bạn hoàn tiền thất bại. Vui lòng liên hệ hỗ trợ.`
                        });
                        break;
                    default:
                        break;
                }
            }
        } catch (notifyErr) {
            console.log('Gửi notification hoàn trả thất bại:', notifyErr);
        }

        if (returnedOrder.is_completed) {
            const returnedOrderItems = await ReturnedOrderItem.findAll({
                where: {
                    returned_order_id: returnedOrder.id
                }
            });

            const list_product = returnedOrderItems.map(item => ({
                product_id: item.product_id,
                quantity: item.product_quantity,
                total_price: item.product_price * item.product_quantity
            }));

            // cập nhật dữ liệu về các sản phẩm đã mua (gọi api của product service)
            axiosProductService.put(`/purchased-products/returned/${returnedOrder.order_id}`, {
                list_product
            });

            // cập nhật trạng thái đơn hàng gốc
            Order.update({
                order_status: 'refunded',
                payment_status: 'refunded'
            }, {
                where: {
                    id: returnedOrder.order_id
                }
            });
        }

        return res.json({ code: 0, message: 'Cập nhật đơn hàng hoàn trả thành công', data: returnedOrder });
    } catch (error) {
        return res.status(500).json({
            code: 2,
            message: error.message
        });
    }
}

// hàm tính tiền hoàn trả cho mỗi sản phẩm (tính luôn số lượng)
const calculateReturnAmountItem = (total_items_price, total_discount_amount_items, item) => {
    const discount = (item.product_price / total_items_price) * total_discount_amount_items; // phân bổ tiền đã giảm giá cho sản phẩm
    return (item.product_price - discount) * item.product_quantity; // tiền hoàn trả cho sản phẩm
}

// hàm tính tiền hoàn trả cho đơn hàng hoàn trả
const calculateReturnAmountOrder = (total_items_price, total_discount_amount_items, returnedOrderItems) => {
    const total_return_amount = returnedOrderItems.reduce((acc, item) => acc + calculateReturnAmountItem(total_items_price, total_discount_amount_items, item), 0);
    return total_return_amount;
}

function extractFolderFromURL(url) {
    // Tách phần sau "upload/" (nếu có)
    const uploadIndex = url.indexOf('/upload/');
    if (uploadIndex === -1) return ''; // Không tìm thấy "/upload/", trả về chuỗi rỗng

    // Lấy phần sau "/upload/"
    const path = url.substring(uploadIndex + 8);

    // Loại bỏ tiền tố "v[digits]/" nếu có
    const cleanedPath = path.replace(/^v\d+\//, '');

    // Tìm vị trí của dấu "/" cuối cùng
    const lastSlashIndex = cleanedPath.lastIndexOf('/');

    // Trích xuất toàn bộ path (không có tiền tố "v[digits]/")
    if (lastSlashIndex !== -1) {
        return cleanedPath.substring(0, lastSlashIndex + 1);
    }

    // Nếu không có thư mục
    return ''; // Trả về chuỗi rỗng
}

// LẤY DANH SÁCH ĐƠN HÀNG HOÀN TRẢ KÈM CHI TIẾT SẢN PHẨM, USER, SHIPMENT
exports.getAllReturnedOrdersWithDetails = async (req, res) => {
    try {
        const { seller_id, user_id, order_status, payment_refund_status, startDate, endDate } = req.query;
        const where = {};
        if (seller_id) where.seller_id = seller_id;
        if (user_id) where.user_id = user_id;
        if (order_status) {
            if (!['processing', 'returned', 'failed'].includes(order_status)) {
                return res.status(400).json({ code: 1, message: 'Trạng thái đơn hàng không hợp lệ' });
            }
            where.order_status = order_status;
        }
        if (payment_refund_status) {
            if (!['pending', 'completed', 'failed'].includes(payment_refund_status)) {
                return res.status(400).json({ code: 1, message: 'Trạng thái hoàn tiền không hợp lệ' });
            }
            where.payment_refund_status = payment_refund_status;
        }
        // Filter theo ngày hoàn trả
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
            where.returned_at = {
                [Op.gte]: selectedStartDate,
                [Op.lte]: selectedEndDate
            };
        }
        // Lấy tất cả đơn hàng hoàn trả theo filter hiện tại
        const returnedOrders = await ReturnedOrder.findAll({
            where,
            order: [['returned_at', 'DESC']]
        });
        // Lấy chi tiết sản phẩm cho từng đơn hoàn trả
        const returnedOrderIds = returnedOrders.map(o => o.id);
        const allItems = await ReturnedOrderItem.findAll({
            where: { returned_order_id: { [Op.in]: returnedOrderIds } }
        });
        // Gom item theo returned_order_id
        const itemsByOrder = {};
        allItems.forEach(item => {
            if (!itemsByOrder[item.returned_order_id]) itemsByOrder[item.returned_order_id] = [];
            itemsByOrder[item.returned_order_id] = itemsByOrder[item.returned_order_id] || [];
            itemsByOrder[item.returned_order_id].push(item);
        });
        // Lấy thông tin shipment và user cho từng đơn hoàn trả
        const axiosUserService = require('../services/userService');
        const axiosShipmentService = require('../services/shipmentService');
        const results = await Promise.all(returnedOrders.map(async (order) => {
            let shipment = null;
            try {
                const shipmentRes = await axiosShipmentService.get(`/shipments/shipping-orders/returned-order/${order.id}`);
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
                user: userInfo,
                items: itemsByOrder[order.id] || []
            };
        }));
        // Tổng số đơn hàng hoàn trả theo filter hiện tại
        const total = returnedOrders.length;
        return res.status(200).json({
            code: 0,
            message: 'Lấy danh sách đơn hàng hoàn trả chi tiết thành công',
            data: results,
            total
        });
    } catch (error) {
        return res.status(500).json({ code: 2, message: 'Lấy danh sách đơn hàng hoàn trả chi tiết thất bại', error: error.message });
    }
}