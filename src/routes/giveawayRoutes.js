const express = require('express');
const router = express.Router();
const GiveawayController = require('../controllers/giveawayController');
const { authenticate } = require('../controllers/authController');

router.get('/', authenticate, GiveawayController.listGiveaways);
router.get('/active', authenticate, GiveawayController.listGiveaways);
router.post('/buy-ticket', authenticate, GiveawayController.buyTicket);
router.get('/my-tickets', authenticate, GiveawayController.getMyTickets);
router.get('/winners', authenticate, GiveawayController.getWinners);

module.exports = router;
