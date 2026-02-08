const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');

router.post('/otp/request', AuthController.requestOTP);
router.post('/otp/verify', AuthController.verifyOTP);
router.get('/me', AuthController.authenticate, AuthController.getProfile);
router.get('/referral-code', AuthController.authenticate, AuthController.getReferralCode);

module.exports = router;
