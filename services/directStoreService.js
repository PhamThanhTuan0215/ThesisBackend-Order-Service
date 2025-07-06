const axios = require('axios');
require('dotenv').config()

const storeServiceAxios = axios.create({
    baseURL: `${process.env.URL_API_STORE_SERVICE}` || 'http://localhost:3004',
    validateStatus: function (status) {
        // Luôn trả về true để không throw lỗi với bất kỳ status code nào
        return true;
    }
});

module.exports = storeServiceAxios;
