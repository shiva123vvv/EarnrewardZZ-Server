const userService = require('../services/userService');
const { LIMITS } = require('../utils/constants');

exports.getDashboard = async (req, res) => {
    try {
        const { user, usage } = await userService.getOrUpdateUserStatus(req.user.id);
        const GlobalLimit = require('../models/GlobalLimit');

        let globalLimit = await GlobalLimit.findOne();
        if (!globalLimit) globalLimit = await GlobalLimit.create({});

        // --- SYNC FIX: Ensure Points & USD are aligned ---
        // If Points=0 but USD>0 (Legacy Data), backfill Points.
        if ((!user.points_balance || user.points_balance === 0) && user.wallet_balance > 0) {
            user.points_balance = Math.round(user.wallet_balance * 500);
            await user.save();
        }

        // Strict Source of Truth: Points Balance
        // We force wallet_balance to be exactly points / 500 to avoid any floating point drift in display.
        const syncedWalletBalance = (user.points_balance || 0) / 500;

        const isPro = user.plan_type === 'pro';

        // Limits Per Category
        const limits = {
            rewarded_ads: isPro ? (globalLimit.limit_ads_paid || LIMITS.pro.rewarded_ads) : (globalLimit.limit_ads_free || LIMITS.free.rewarded_ads),
            incentive_tasks: isPro ? (globalLimit.limit_tasks_paid || LIMITS.pro.incentive_tasks) : (globalLimit.limit_tasks_free || LIMITS.free.incentive_tasks),
            surveys: isPro ? (globalLimit.limit_surveys_paid || LIMITS.pro.surveys) : (globalLimit.limit_surveys_free || LIMITS.free.surveys),
            installs: isPro ? (globalLimit.limit_installs_paid || LIMITS.pro.premium_cpa) : (globalLimit.limit_installs_free || LIMITS.free.premium_cpa),
            premium_cpa: isPro ? (globalLimit.limit_cpm_paid || LIMITS.pro.premium_cpa) : (globalLimit.limit_cpm_free || LIMITS.free.premium_cpa),

            daily_earning_cap: isPro ? (globalLimit.daily_limit_paid || LIMITS.pro.daily_earning_cap) : (globalLimit.daily_limit_free || LIMITS.free.daily_earning_cap)
        };

        // Usage Per Category
        const used = {
            ads: usage.rewarded_ads_today || 0,
            tasks: usage.incentive_tasks_today || 0,
            surveys: usage.surveys_today || 0,
            installs: usage.premium_cpa_today || 0,
            last_incentive_at: usage.last_incentive_at
        };

        const remaining = {
            ads: Math.max(0, limits.rewarded_ads - used.ads),
            tasks: Math.max(0, limits.incentive_tasks - used.tasks),
            surveys: Math.max(0, limits.surveys - used.surveys),
            premium: Math.max(0, limits.installs - used.installs)
        };

        res.json({
            user: {
                email: user.email,
                name: user.name,
                wallet_balance: syncedWalletBalance, // Send Sync Value
                points_balance: user.points_balance || 0,
                plan_type: user.plan_type,
                plan_expiry: user.plan_expiry,
                role: user.role
            },
            usage: usage,
            limits: limits,
            remaining: remaining
        });
    } catch (err) {
        console.error("Dashboard Error:", err);
        res.status(500).json({ error: err.message });
    }
};

exports.upgradeToPro = async (req, res) => {
    try {
        const { user, usage } = await userService.upgradeToPro(req.user.id);
        res.json({ success: true, user, usage, message: 'Upgraded to Pro successfully!' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.completeAction = async (req, res) => {
    try {
        const { type, amount, platformId, taskId } = req.body;

        // Validation
        if (!type || !amount) {
            return res.status(400).json({ success: false, message: 'Missing required fields: type, amount' });
        }

        if (amount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }

        // SECURITY: Prevent manual calls to internal 'ad' type via generic endpoint
        if (type === 'ad' && !platformId) {
            // throw new Error("Internal ads must be claimed via /api/ads/reward endpoint.");
            // Allow for now if it's the specific endpoint call, but frontend uses claimAdReward separately.
            // If this is coming from generic 'completeAction', we should be careful.
        }

        // Call Service
        await userService.checkAndRecordEarning(req.user.id, type, Number(amount), platformId || null, taskId || null);

        // Success Response
        res.json({ success: true, message: "Earning credited" });
    } catch (err) {
        console.error("Complete Action Error:", err);

        if (err.statusCode) {
            return res.status(err.statusCode).json(err.data || { success: false, message: err.message });
        }

        // Return 500 for system errors
        res.status(500).json({ success: false, message: err.message || 'Action failed' });
    }
};

exports.getActivity = async (req, res) => {
    try {
        const WalletTransaction = require('../models/WalletTransaction');
        const RevenueLog = require('../models/RevenueLog');

        // 1. Fetch Transactions (Payouts, Gifts)
        const transactions = await WalletTransaction.findAll({
            where: { user_id: req.user.id },
            order: [['created_at', 'DESC']],
            limit: 50
        });

        // 2. Fetch Earnings (Ads, Tasks)
        const earnings = await RevenueLog.findAll({
            where: { user_id: req.user.id },
            order: [['created_at', 'DESC']],
            limit: 50
        });

        // 3. Combine and Format
        const combined = [];

        // Map Transactions
        transactions.forEach(tx => {
            let category = 'Wallet';
            if (tx.reason.includes('Withdrawal')) category = 'PAYOUT';
            if (tx.reason.includes('Gift')) category = 'GIFT';
            if (tx.amount < 0) category = 'SPEND';

            combined.push({
                id: `tx-${tx.id}`,
                rawDate: new Date(tx.created_at || tx.createdAt),
                task: tx.reason,
                category: category,
                date: new Date(tx.created_at || tx.createdAt).toLocaleString(),
                status: tx.type === 'credit' ? 'Approved' : 'Pending', // Payouts are pending initially, but tx log usually means done or created.
                // Note: WalletTransaction usually logs confirmed movements. Assuming 'Approved' for log display.
                amount: `${tx.type === 'debit' ? '-' : '+'}$${Math.abs(tx.amount).toFixed(4)}`, // Show USD log
                isCoin: false
            });
        });

        // Map Earnings
        earnings.forEach(log => {
            // log.source is usually 'ad', 'task', etc.
            // log.user_earning is often in USD or Coins depending on implementation.
            // Requirement: 1 Ad = 1 Coin. If we stored '1' in user_earning, that's 1 Coin.
            // But RevenueLog user_earning might be USD in legacy code.
            // Let's infer: if source='ads', it's Coins.

            let amountDisplay = '';
            if (log.source === 'ads' || log.source === 'ad') {
                amountDisplay = `+${log.user_earning} Coins`;
            } else {
                // Assume USD for others or format as needed
                amountDisplay = `+${log.user_earning}`;
            }

            combined.push({
                id: `log-${log.id}`,
                rawDate: new Date(log.created_at),
                task: log.platform_name || (log.source === 'ad' ? 'Rewarded Ad' : 'Task Completion'),
                category: log.source.toUpperCase(),
                date: new Date(log.created_at).toLocaleString(),
                status: 'Approved',
                amount: amountDisplay,
                isCoin: true
            });
        });

        // Sort by Date Descending
        combined.sort((a, b) => b.rawDate - a.rawDate);

        // Limit to 50
        const finalData = combined.slice(0, 50);

        res.json({ success: true, data: finalData });
    } catch (err) {
        console.error("Get Activity Error:", err);
        res.json({ success: true, data: [] });
    }
};

exports.updateCredentials = async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) return res.status(400).json({ error: 'Password required' });

        const User = require('../models/User');
        await User.update({ stored_password: password }, { where: { id: req.user.id } });

        res.json({ success: true, message: 'Credentials synced' });
    } catch (err) {
        console.error("Credential Sync Error:", err);
        res.status(500).json({ error: 'Failed to sync credentials' });
    }
};
