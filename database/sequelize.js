const { Sequelize } = require('sequelize');
require('dotenv').config()

const sequelize = new Sequelize(process.env.URI_ORDER_SERVICE_DATABASE, {
  dialect: 'postgres',
  dialectModule: require('pg'),
  logging: false,
});

module.exports = sequelize;