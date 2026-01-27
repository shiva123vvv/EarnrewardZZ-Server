const authMiddleware = require('./auth');

const adminMiddleware = (req, res, next) => {
    // Auth middleware usually runs first and sets req.user
    // But if we use this standalone, we might need to rely on existing req.user
    if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ error: "Access Denied: Admins only" });
    }

    // Check status
    if (req.user.status !== 'active') {
        return res.status(403).json({ error: "Account suspended" });
    }

    next();
};

module.exports = adminMiddleware;
