const axios = require('axios');
require('dotenv').config()

const discountServiceAxios = axios.create({
    baseURL: `${process.env.URL_API_GATEWAY}/discount` || 'http://localhost:3000/discount',
    validateStatus: function (status) {
        // Luôn trả về true để không throw lỗi với bất kỳ status code nào
        return true;
    }
});

module.exports = discountServiceAxios;
