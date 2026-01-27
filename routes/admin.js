const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/adminAuth');
const adminController = require('../controllers/adminController');

// All routes here require: 1. Valid User (Auth) 2. Admin Role
router.use(authMiddleware);
router.use(adminMiddleware);

router.get('/dashboard', adminController.getDashboardStats);
router.get('/platforms', adminController.getPlatforms);
router.post('/platforms', adminController.createPlatform);
router.get('/platforms/names', adminController.getUniquePlatformNames);
router.put('/platforms/:id', adminController.updatePlatform);
router.get('/users', adminController.getUsers);
router.get('/users/:id', adminController.getUser);
router.put('/users/:id', adminController.updateUserStatus);
router.post('/users/:id/reset', adminController.resetUserCounters);
router.post('/users/:id/revoke', adminController.revokeUserItem);

// --- Withdrawal Management ---
const withdrawalController = require('../controllers/withdrawalController');
router.get('/withdrawals/pending', withdrawalController.getPendingWithdrawals);
router.get('/withdrawals/approved', withdrawalController.getApprovedWithdrawals);
router.get('/withdrawals/rejected', withdrawalController.getRejectedWithdrawals);
router.post('/withdrawals/:id/approve', withdrawalController.approveWithdrawal);
router.post('/withdrawals/:id/reject', withdrawalController.rejectWithdrawal);

// Expenses
router.post('/expenses', adminController.addAdminExpense);

// Global Limits
router.get('/global-limits', adminController.getGlobalLimits);
router.post('/global-limits', adminController.updateGlobalLimits);

// --- Referrals ---
router.get('/referrals', adminController.getReferrals);
router.put('/referrals/:id', adminController.updateReferralStatus);

// --- Giveaways ---
router.get('/giveaways', adminController.getGiveaways);
router.post('/giveaways', adminController.createGiveaway);
router.put('/giveaways/:id', adminController.updateGiveaway);
router.get('/giveaways/:id/tickets', adminController.getGiveawayTickets);
router.post('/giveaways/:id/draw', adminController.drawGiveawayWinner);

// --- System Settings ---
router.get('/settings', adminController.getSettings);
router.post('/settings', adminController.updateSetting);

// --- Daily Usage / Limits ---
router.get('/daily', adminController.getDailyStats);
router.post('/daily/reset', adminController.forceGlobalReset);

// --- Logs ---
router.get('/logs', adminController.getLogs);

module.exports = router;
