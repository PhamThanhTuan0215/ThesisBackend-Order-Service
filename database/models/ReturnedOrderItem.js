const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

require('./OrderReturnRequest');
require('./ReturnedOrder');

const ReturnedOrderItem = sequelize.define('ReturnedOrderItem', {
    id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    order_return_request_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
            model: 'order_return_requests',
            key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    },
    returned_order_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: {
            model: 'returned_orders',
            key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    }, // chỉ lưu giá trị khi đơn hàng hoàn trả được chấp nhận và tạo ra returned_order, mặc định là null (đang xử lý hoặc bị từ chối)
    product_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
    },
    product_name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    product_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    product_quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
    },
    product_url_image: {
        type: DataTypes.STRING,
        allowNull: false
    },
}, {
    tableName: 'returned_order_items'
});

module.exports = ReturnedOrderItem;