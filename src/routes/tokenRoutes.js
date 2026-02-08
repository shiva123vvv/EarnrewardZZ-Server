const express = require('express');
const router = express.Router();
const TokenController = require('../controllers/tokenController');
const { authenticate } = require('../controllers/authController');

router.get('/wallet', authenticate, TokenController.getWallet);
router.get('/wallet/spins', authenticate, TokenController.getSpinBalance);
router.get('/spins/balance', authenticate, TokenController.getSpinBalance);

router.post('/spins/add', authenticate, TokenController.addSpins);
router.post('/spins/use', authenticate, TokenController.playSpin);

router.post('/earn', authenticate, TokenController.earnToken);
// endpoint for specific types like /earn/daily can point to earnToken with body param source='daily_claim'
// or we can make specific endpoints.
router.post('/earn/daily', authenticate, (req, res, next) => { req.body.source = 'daily_claim'; req.body.amount = 100; next(); }, TokenController.earnToken);
// Alias for daily check-in (fixing 404)
router.post('/daily-checkin', authenticate, (req, res, next) => { req.body.source = 'daily_claim'; req.body.amount = 100; next(); }, TokenController.earnToken);

router.post('/spin/play', authenticate, TokenController.playSpin);
// Alias for spin
router.post('/spin', authenticate, TokenController.playSpin);

router.get('/history', authenticate, TokenController.getHistory);
router.get('/referrals', authenticate, TokenController.getReferrals);
// Redeem Referral Code
router.post('/referrals/redeem', authenticate, TokenController.redeemReferral);


module.exports = router;
