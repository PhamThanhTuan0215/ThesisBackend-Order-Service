const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Order = require('./Order');
const OrderReturnRequest = require('./OrderReturnRequest');

const ReturnedOrder = sequelize.define('ReturnedOrder', {
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
    seller_name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
    },
    total_quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    return_shipping_fee: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    }, // số tiền phí hoàn trả
    return_shipping_fee_paid_by: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'seller',
        enum: ['customer', 'seller', 'platform'],
    },
    refund_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    }, // số tiền hoàn trả
    order_status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'processing',
        enum: ['processing', 'ready_to_ship', 'shipping', 'returned', 'failed'],
    },
    payment_refund_status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending',
        enum: ['pending', 'completed', 'failed'],
    },
    is_completed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    returned_at: {
        type: DataTypes.DATE,
        allowNull: true,
    }, // thời gian hoàn thành việc hoàn trả
}, {
    tableName: 'returned_orders'
});

ReturnedOrder.beforeSave((returnedOrder, options) => {
    if(returnedOrder.order_Status === 'returned') {
        returnedOrder.returned_at = new Date();
    }
    returnedOrder.is_completed = (returnedOrder.payment_refund_status === 'completed' && returnedOrder.order_status === 'returned');
});

ReturnedOrder.belongsTo(OrderReturnRequest, { foreignKey: 'order_return_request_id' });
ReturnedOrder.belongsTo(Order, { foreignKey: 'order_id' });

module.exports = ReturnedOrder;