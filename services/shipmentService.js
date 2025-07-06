const axios = require('axios');
require('dotenv').config()

const shipmentServiceAxios = axios.create({
    baseURL: `${process.env.URL_API_GATEWAY}/shipment` || 'http://localhost:3000/shipment',
    validateStatus: function (status) {
        // Luôn trả về true để không throw lỗi với bất kỳ status code nào
        return true;
    }
});

module.exports = shipmentServiceAxios;
