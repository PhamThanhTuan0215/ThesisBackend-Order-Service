const axios = require('axios');
require('dotenv').config()

const paymentServiceAxios = axios.create({
    baseURL: `${process.env.URL_API_GATEWAY}/payment` || 'http://localhost:3000/payment',
    validateStatus: function (status) {
        // Luôn trả về true để không throw lỗi với bất kỳ status code nào
        return true;
    }
});

module.exports = paymentServiceAxios;
