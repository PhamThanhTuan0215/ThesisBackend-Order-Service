require('dotenv').config();
const nodemailer = require('nodemailer');
const { EMAIL_USER, EMAIL_PASSWORD } = process.env;

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASSWORD
    }
});

async function sendMail(options) {
    try {
        if (!EMAIL_USER || !EMAIL_PASSWORD) {
            throw new Error('Thiếu thông tin xác thực email (EMAIL_USER hoặc EMAIL_PASSWORD)');
        }

        const mailOptions = {
            from: `"Ecommerce Pharmacy" <${EMAIL_USER}>`,
            to: options.to,
            subject: options.subject,
            text: options.text || '',
            html: options.html || ''
        };

        await transporter.sendMail(mailOptions);
    } catch (error) {
        throw new Error(`Gửi email thất bại: ${error.message}`);
    }
}

module.exports = sendMail;