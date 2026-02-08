const User = require('../models/User');
const DailyUsage = require('../models/DailyUsage');
const RevenueLog = require('../models/RevenueLog');
const GlobalLimit = require('../models/GlobalLimit');
const db = require('../utils/db');

exports.handlePostback = async (req, res) => {
    try {
        // Generic Postback Handler
        // Supports query params: uid (user_id), payout (amount), currency, status, tx (transaction_id)
        // Example: /api/postback?uid=123&payout=0.50&status=1&tx=abc

        const { uid, payout, status, tx, subid } = req.query;
        const userId = uid || subid;
        // User requested fixed $0.50 per task
        let amount = parseFloat(payout);
        if (isNaN(amount) || amount === 0) {
            amount = 0.50;
        }

        console.log(`[POSTBACK] Received for User ${userId}: $${amount}`, req.query);

        if (!userId) {
            return res.status(400).send("Missing User ID");
        }

        // Check if user exists
        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).send("User not found");
        }

        // Deduplicate logic (optional, if tx provided)
        if (tx) {
            const exists = await RevenueLog.findOne({ where: { desc: tx } }); // Using desc to store tx id loosely
            if (exists) {
                console.log(`[POSTBACK] Duplicate transaction ${tx}`);
                return res.status(200).send("OK: Duplicate");
            }
        }

        // Get Global Limits to check (though postback usually overrides limit checks, we strictly enforce caps here if desired)
        // For now, we assume postback = verified completion = count it.

        // Get/Create Usage
        let usage = await DailyUsage.findOne({ where: { user_id: userId } });
        if (!usage) usage = await DailyUsage.create({ user_id: userId });

        // Update Stats
        const today = new Date();
        usage.incentive_tasks_today = (usage.incentive_tasks_today || 0) + 1;
        const currentEarnings = parseFloat(usage.earnings_today) || 0;
        usage.earnings_today = currentEarnings + amount;
        usage.last_incentive_at = today; // Update last active time for cooldown

        // Add to Wallet
        const currentBalance = parseFloat(user.wallet_balance) || 0;
        const currentTotal = parseFloat(user.total_earnings) || 0;

        user.wallet_balance = currentBalance + amount;
        user.total_earnings = currentTotal + amount;

        // Log Transaction
        await RevenueLog.create({
            user_id: userId,
            amount: amount,
            source: 'tasks', // Generic Incentive Task
            desc: tx || `Task Completion (Incentive)`,
            status: 'completed'
        });

        // Save All
        await usage.save();
        await user.save();

        console.log(`[POSTBACK] Success: User ${userId} credited $${amount}. Limit count: ${usage.incentive_tasks_today}`);
        return res.status(200).send("OK: Credited");

    } catch (err) {
        console.error("[POSTBACK ERROR]", err);
        return res.status(500).send("Error processing postback");
    }
};
