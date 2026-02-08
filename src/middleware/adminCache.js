const NodeCache = require('node-cache');
const adminCache = new NodeCache({ stdTTL: 30, checkperiod: 60 }); // Cache for 30 seconds

const cacheMiddleware = (req, res, next) => {
    // Only cache GET requests for admin
    if (req.method !== 'GET') {
        // For non-GET requests (actions), clear the cache
        adminCache.flushAll();
        return next();
    }

    const key = req.originalUrl || req.url;
    const cachedResponse = adminCache.get(key);

    if (cachedResponse) {
        console.log(`[Cache] Serving ${key} from cache`);
        return res.json(cachedResponse);
    }

    // Override res.json to store the response in cache
    const originalJson = res.json;
    res.json = (body) => {
        if (res.statusCode === 200 && body && body.success) {
            adminCache.set(key, body);
        }
        return originalJson.call(res, body);
    };

    next();
};

const clearAdminCache = () => {
    adminCache.flushAll();
};

module.exports = { cacheMiddleware, clearAdminCache };
