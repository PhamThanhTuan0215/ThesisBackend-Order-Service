const axios = require('axios');
require('dotenv').config()

const userServiceAxios = axios.create({
    baseURL: `${process.env.URL_API_GATEWAY}/user` || 'http://localhost:3000/user',
    validateStatus: function (status) {
        // Luôn trả về true để không throw lỗi với bất kỳ status code nào
        return true;
    }
});

module.exports = userServiceAxios;
