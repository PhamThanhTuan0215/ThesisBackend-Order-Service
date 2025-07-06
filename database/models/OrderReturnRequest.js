const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Order = require('./Order');

const OrderReturnRequest = sequelize.define('OrderReturnRequest', {
    id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    order_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
            model: 'orders',
            key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    },
    seller_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
    },
    user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
    },
    reason: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    return_shipping_fee_paid_by: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'seller',
        enum: ['customer', 'seller', 'platform'],
    },
    customer_message: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    url_images_related: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: true,
    },
    request_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
    response_message: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    response_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'requested',
        enum: ['requested', 'accepted', 'rejected', 'refunded'],
    },
    customer_shipping_address_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
    }, // id địa chỉ từ khách hàng muốn hoàn trả
}, {
    tableName: 'order_return_requests'
});

// tự động chọn return_shipping_paid_by dựa vào reason trước khi tạo bản ghi
OrderReturnRequest.beforeSave(async (orderReturnRequest, options) => {

    orderReturnRequest.return_shipping_fee_paid_by = getPaidByReason(orderReturnRequest.reason);
});

OrderReturnRequest.belongsTo(Order, { foreignKey: 'order_id' });

module.exports = OrderReturnRequest;


// xác định người chịu phí vận chuyển khi hoàn trả dựa vào lý do hoàn trả
const getPaidByReason = (reason) => {
    const reasons_from_seller = [
        'Sản phẩm bị lỗi, hư hỏng', 
        'Giao sai sản phẩm', 
        'Sản phẩm hết hạn sử dụng',
        'Sản phẩm không đúng mô tả', 
        'Bao bì sản phẩm bị móp méo, rách, không đảm bảo', 
    ]

    const reasons_from_customer = [
        'Khách đặt nhầm sản phẩm',
        'Khách hàng đổi ý không muốn mua'
    ]

    const reasons_from_platform = [
        // hiện chưa có lý do nào từ platform
    ]

    if (reasons_from_seller.includes(reason)) {
        return 'seller';
    } else if (reasons_from_customer.includes(reason)) {
        return 'customer';
    } else if (reasons_from_platform.includes(reason)) {
        return 'platform';
    }

    return 'seller';
}