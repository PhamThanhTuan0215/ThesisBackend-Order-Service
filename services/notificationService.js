const axios = require('axios');
require('dotenv').config()

const notificationServiceAxios = axios.create({
    baseURL: `${process.env.URL_API_GATEWAY}/notification` || 'http://localhost:3000/notification',
    validateStatus: function (status) {
        // Luôn trả về true để không throw lỗi với bất kỳ status code nào
        return true;
    }
});

module.exports = notificationServiceAxios;
