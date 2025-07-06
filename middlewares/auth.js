const jwt = require('jsonwebtoken');

const authenticateToken = (requiredRoles) => {
    return (req, res, next) => {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Thiếu token hoặc token không hợp lệ,'
            });
        }

        jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
            if (err) {
                return res.status(403).json({
                    success: false,
                    message: 'Token không hợp lệ hoặc đã hết hạn.'
                });
            }

            // Kiểm tra quyền hạn
            if (requiredRoles && !requiredRoles.includes(user.role)) {
                return res.status(403).json({
                    success: false,
                    message: 'Bạn không có quyền truy cập tài nguyên này.'
                });
            }

            req.user = user; // Gắn thông tin người dùng vào request
            next();
        });
    };
};

module.exports = authenticateToken;