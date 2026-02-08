const express = require('express');
const router = express.Router();
const AdminController = require('../controllers/adminController');
const AdminAuthController = require('../controllers/adminAuthController');
const SettingsController = require('../controllers/settingsController');
const { authenticate } = require('../controllers/authController');
const rateLimit = require('express-rate-limit');
const { cacheMiddleware } = require('../middleware/adminCache');

// Rate limit for admin APIs: 30 requests / minute
const adminLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30,
    message: { success: false, message: "Too many requests, please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
});

// Admin Login (no auth required)
router.post('/login', adminLimiter, AdminAuthController.adminLogin);

// Add admin check middleware here in production
const adminCheck = (req, res, next) => next();

// Apply cache and limiter to all following routes
router.use(authenticate, adminCheck, adminLimiter, cacheMiddleware);


// Dashboard & Stats
router.get('/dashboard', AdminController.getDashboardStats);

// User Management
router.get('/users', AdminController.getUsers);
router.post('/users/spins', AdminController.adjustSpins);
router.post('/users/tokens', AdminController.adjustTokens);


// Withdrawal Management
router.get('/withdrawals', AdminController.getWithdrawals);
router.post('/withdrawals/process', AdminController.processWithdrawal);

// Analytics
router.get('/analytics/earnings', AdminController.getEarningsAnalytics);
router.get('/analytics/activity', AdminController.getRecentActivity);

// Referrals
router.get('/referrals', AdminController.getReferralList);

// Giveaway Tickets
router.get('/tickets', AdminController.getGiveawayTickets);


// Platform Settings
router.get('/settings', SettingsController.getSettings);
router.put('/settings', SettingsController.updateSettings);


module.exports = router;
