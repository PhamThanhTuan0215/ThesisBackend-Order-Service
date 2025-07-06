const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

require('./Order');

const OrderItem = sequelize.define('OrderItem', {
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
    tableName: 'order_items'
});

module.exports = OrderItem;