const axios = require('axios');
require('dotenv').config()

const productServiceAxios = axios.create({
    baseURL: `${process.env.URL_API_PRODUCT_SERVICE}` || 'http://localhost:3001',
    validateStatus: function (status) {
        // Luôn trả về true để không throw lỗi với bất kỳ status code nào
        return true;
    }
});

module.exports = productServiceAxios;
