const axios = require('axios');
require('dotenv').config()

const customerServiceAxios = axios.create({
    baseURL: `${process.env.URL_API_GATEWAY}/customer` || 'http://localhost:3000/customer',
    validateStatus: function (status) {
        // Luôn trả về true để không throw lỗi với bất kỳ status code nào
        return true;
    }
});

module.exports = customerServiceAxios;
