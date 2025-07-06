const axios = require('axios');
require('dotenv').config()

const storeServiceAxios = axios.create({
    baseURL: `${process.env.URL_API_GATEWAY}/store` || 'http://localhost:3000/store',
    validateStatus: function (status) {
        // Luôn trả về true để không throw lỗi với bất kỳ status code nào
        return true;
    }
});

module.exports = storeServiceAxios;
