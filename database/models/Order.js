const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Order = sequelize.define('Order', {
    id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
    },
    user_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
    },
    seller_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
    },
    seller_name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    total_quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    original_items_total: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    }, // tiền hàng gốc
    original_shipping_fee: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    }, // tiền vận chuyển gốc
    discount_amount_items: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    }, // tiền hàng giảm từ shop
    discount_amount_shipping: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    }, // tiền vận chuyển giảm từ shop
    discount_amount_items_platform_allocated: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    }, // tiền hàng giảm từ sàn
    discount_amount_shipping_platform_allocated: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    }, // tiền vận chuyển giảm từ sàn
    final_total: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    }, // tiền thanh toán
    payment_method: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'COD'
    },
    payment_status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending',
        validate: {
            isIn: {
                args: [['pending', 'completed', 'failed', 'cancelled', 'refunded']],
                msg: "payment_status phải là pending, completed, failed, cancelled hoặc refunded"
            }
        },
    },
    order_status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending',
        validate: {
            isIn: {
                args: [['pending', 'confirmed', 'ready_to_ship', 'shipping', 'delivered', 'cancelled', 'refunded']],
                msg: "order_status phải là pending, confirmed, ready_to_ship, shipping, delivered, cancelled hoặc refunded"
            }
        },
    },
    is_completed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    }
}, {
    tableName: 'orders'
});

// trước khi lưu (thêm hoặc cập nhât) thì thiết lập is_completed = true nếu payment_status = paid và order_status = delivered
Order.beforeSave((order, options) => {
    order.is_completed = (order.payment_status === 'completed' && order.order_status === 'delivered');
});

module.exports = Order;