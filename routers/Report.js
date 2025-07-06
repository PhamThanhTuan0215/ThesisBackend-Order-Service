const express = require('express')
const Router = express.Router()

const Controller = require('../controllers/Statistic')

const authenticateToken = require('../middlewares/auth');

Router.get('/', Controller.getOrderStatistics)

module.exports = Router;