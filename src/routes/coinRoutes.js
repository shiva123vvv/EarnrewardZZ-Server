const express = require('express');
const router = express.Router();
const CoinController = require('../controllers/coinController');
const { authenticate } = require('../controllers/authController');

router.get('/wallet', authenticate, CoinController.getWallet);
router.post('/earn/ad', authenticate, CoinController.earnFromAd);
router.post('/withdraw', authenticate, CoinController.requestWithdrawal);
router.post('/gift', authenticate, CoinController.giftCoins);
router.get('/history', authenticate, CoinController.getHistory);

module.exports = router;
