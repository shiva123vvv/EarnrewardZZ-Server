const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const mainController = require('../controllers/mainController');
const adminController = require('../controllers/adminController');
const withdrawalController = require('../controllers/withdrawalController');
const referralController = require('../controllers/referralController');

// Public Webhooks / Postbacks
const postbackController = require('../controllers/postbackController');
router.get('/webhook/postback', postbackController.handlePostback);

// Global Auth Middleware for all API routes (except maybe public callbacks if any)
router.use(authMiddleware);

// --- User Routes ---
router.get('/dashboard', mainController.getDashboard);
router.post('/upgrade', mainController.upgradeToPro);
router.post('/withdraw', withdrawalController.createWithdrawal);
router.get('/withdrawals', withdrawalController.getUserWithdrawals);
router.get('/referrals', referralController.getReferralData);
router.post('/referrals/verify', referralController.verifyReferral);

// Earnings & Activity
router.post('/earn', mainController.completeAction);
router.get('/activity', mainController.getActivity);

// --- Task Routes ---
const taskController = require('../controllers/taskController');
router.get('/tasks', taskController.getTasks);
router.post('/tasks/start', taskController.startTask);
router.post('/tasks/start-category', taskController.startCategory);
router.get('/start-options', taskController.getActivePlatforms);
router.get('/offerwalls/active', taskController.getActiveOfferwall); // Single-button offerwall

// --- Giveaway & Spin Routes ---
const giveawayController = require('../controllers/giveawayController');
router.get('/giveaways', giveawayController.getActiveGiveaways);
router.post('/giveaways/:id/enter', giveawayController.enterGiveaway);
router.post('/spin', giveawayController.performSpin);

// --- Admin Middleware ---
const isAdmin = (req, res, next) => {
    // Check if user role is admin or super_admin
    if (req.user && (req.user.role === 'admin' || req.user.role === 'super_admin')) {
        next();
    } else {
        res.status(403).json({ error: 'Admin Access Required' });
    }
};

// --- Admin Routes ---
router.use('/admin', isAdmin);

// Dashboard
router.get('/admin/dashboard', adminController.getDashboardStats);

// Platforms
router.get('/admin/platforms/names', adminController.getUniquePlatformNames);
router.get('/admin/platforms', adminController.getPlatforms);
router.post('/admin/platforms', adminController.createPlatform);
router.put('/admin/platforms/:id', adminController.updatePlatform);

// Users
router.get('/admin/users', adminController.getUsers);
router.get('/admin/users/:id', adminController.getUser);
router.put('/admin/users/:id', adminController.updateUserStatus);
router.post('/admin/users/:id/reset', adminController.resetUserCounters);
router.post('/admin/users/:id/revoke', adminController.revokeUserItem);

// Referrals
router.get('/admin/referrals', adminController.getReferrals);
router.put('/admin/referrals/:id', adminController.updateReferralStatus);

// Withdrawals (Admin)
router.get('/admin/withdrawals/:status', (req, res) => {
    const status = req.params.status.toLowerCase();
    if (status === 'pending') return withdrawalController.getPendingWithdrawals(req, res);
    if (status === 'approved') return withdrawalController.getApprovedWithdrawals(req, res);
    if (status === 'rejected') return withdrawalController.getRejectedWithdrawals(req, res);
    return res.status(400).json({ error: 'Invalid status filter' });
});
router.post('/admin/withdrawals/:id/approve', withdrawalController.approveWithdrawal);
router.post('/admin/withdrawals/:id/reject', withdrawalController.rejectWithdrawal);

// Giveaways
router.get('/admin/giveaways', adminController.getGiveaways);
router.post('/admin/giveaways', adminController.createGiveaway);
router.put('/admin/giveaways/:id', adminController.updateGiveaway);
router.get('/admin/giveaways/:id/tickets', adminController.getGiveawayTickets);
router.post('/admin/giveaways/:id/draw', adminController.drawGiveawayWinner);

// Settings (Spins, Global Toggles)
router.get('/admin/settings', adminController.getSettings);
router.post('/admin/settings', adminController.updateSetting);

// Daily Limits & Monitor
router.get('/admin/daily', adminController.getDailyStats);
router.post('/admin/daily/reset', adminController.forceGlobalReset);

// Logs
router.get('/admin/logs', adminController.getLogs);

// Global Limits Manager
router.get('/admin/global-limits', adminController.getGlobalLimits);
router.post('/admin/global-limits', adminController.updateGlobalLimits);

module.exports = router;
