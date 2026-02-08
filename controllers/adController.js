const User = require('../models/User');
const DailyUsage = require('../models/DailyUsage');
const GlobalLimit = require('../models/GlobalLimit');
const RevenueLog = require('../models/RevenueLog');
const db = require('../utils/db');

const REWARD_PER_AD = 1; // 1 Coin per ad strictly

exports.claimAdReward = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findByPk(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        // 1. Get Global Limits
        let globalLimit = await GlobalLimit.findOne();
        if (!globalLimit) globalLimit = await GlobalLimit.create({});

        const limit = user.plan_type === 'pro' ? globalLimit.limit_ads_paid : globalLimit.limit_ads_free;

        // 2. Get Daily Usage
        let usage = await DailyUsage.findOne({ where: { user_id: userId } });
        if (!usage) usage = await DailyUsage.create({ user_id: userId });

        // Reset check (simple logic, assuming mainController handles reset on dashboard load, but good to be safe)
        const todayStr = new Date().toISOString().slice(0, 10);
        const lastReset = usage.last_reset_at ? new Date(usage.last_reset_at).toISOString().slice(0, 10) : '';

        if (todayStr !== lastReset) {
            usage.rewarded_ads_today = 0;
            usage.last_reset_at = new Date();
            await usage.save(); // Save reset immediately
        }

        // 3. Check Limit
        if (usage.rewarded_ads_today >= limit) {
            return res.status(403).json({
                error: "Daily ad limit reached. Come back tomorrow!",
                limitReached: true
            });
        }

        // 4. Cooldown Check (e.g. 10 seconds between claims to prevent rapid-fire api abuse)
        // We can use last_incentive_at for this
        if (usage.last_incentive_at) {
            const lastTime = new Date(usage.last_incentive_at).getTime();
            const now = new Date().getTime();
            if (now - lastTime < 10000) { // 10 seconds
                return res.status(429).json({ error: "Please wait a few seconds before claiming again." });
            }
        }

        // 5. Award Reward (1 COIN)
        const REWARD_COINS = 1;
        usage.rewarded_ads_today += 1;

        // Update Daily Earnings
        // const currentEarnings = parseFloat(usage.earnings_today) || 0; 
        // usage.earnings_today = currentEarnings + REWARD_PER_AD; // Deprecated USD tracking?
        // Let's keep earnings_today as Coins or make a new field. For now, track COINS in usage.earnings_today? 
        // The previous code used USD ($0.05). If 1 coin = $0.002 (since 500 = $1), $0.05 = 25 coins.
        // Wait, user requirement: 1 ad = 1 coin. 500 coins = $1.
        // So 1 ad = $0.002.

        const COIN_VALUE_USD = 1 / 500;

        usage.earnings_today = (parseFloat(usage.earnings_today) || 0) + COIN_VALUE_USD;
        usage.last_incentive_at = new Date();

        // Update User Wallet
        const currentPoints = user.points_balance || 0;
        user.points_balance = currentPoints + REWARD_COINS;

        // Sync USD Balance
        user.wallet_balance = user.points_balance / 500;
        user.total_earnings = (parseFloat(user.total_earnings) || 0) + COIN_VALUE_USD;

        // 6. Log
        await RevenueLog.create({
            user_id: userId,
            amount: COIN_VALUE_USD,
            source: 'ad',
            desc: 'Rewarded Ad View (1 Coin)',
            status: 'completed'
        });

        await usage.save();
        await user.save();

        res.json({
            success: true,
            message: "Reward claimed!",
            reward: REWARD_PER_AD,
            stats: {
                today: usage.rewarded_ads_today,
                limit: limit,
                remaining: limit - usage.rewarded_ads_today,
                newBalance: user.wallet_balance
            }
        });

    } catch (err) {
        console.error("Ad Reward Error:", err);
        res.status(500).json({ error: "Failed to claim reward" });
    }
};

exports.getAdStatus = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findByPk(userId);

        let globalLimit = await GlobalLimit.findOne();
        if (!globalLimit) globalLimit = await GlobalLimit.create({});

        const limit = user && user.plan_type === 'pro' ? globalLimit.limit_ads_paid : globalLimit.limit_ads_free;

        let usage = await DailyUsage.findOne({ where: { user_id: userId } });
        if (!usage) usage = await DailyUsage.create({ user_id: userId });

        // Check reset
        const todayStr = new Date().toISOString().slice(0, 10);
        const lastReset = usage.last_reset_at ? new Date(usage.last_reset_at).toISOString().slice(0, 10) : '';
        if (todayStr !== lastReset) {
            usage.rewarded_ads_today = 0;
            usage.last_reset_at = new Date();
            await usage.save();
        }

        res.json({
            success: true,
            stats: {
                today: usage.rewarded_ads_today,
                limit: limit,
                remaining: Math.max(0, limit - usage.rewarded_ads_today)
            }
        });

    } catch (err) {
        console.error("Ad Status Error:", err);
        res.status(500).json({ error: "Failed to fetch status" });
    }
};
