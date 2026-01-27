const userService = require('../services/userService');
const { LIMITS } = require('../utils/constants');

exports.getDashboard = async (req, res) => {
    try {
        const { user, usage } = await userService.getOrUpdateUserStatus(req.user.id);
        const GlobalLimit = require('../models/GlobalLimit');

        let globalLimit = await GlobalLimit.findOne();
        if (!globalLimit) globalLimit = await GlobalLimit.create({});

        const isPro = user.plan_type === 'pro';

        // Limits Per Category
        const limits = {
            rewarded_ads: isPro ? globalLimit.limit_ads_paid : globalLimit.limit_ads_free,
            incentive_tasks: isPro ? globalLimit.limit_tasks_paid : globalLimit.limit_tasks_free,
            surveys: isPro ? globalLimit.limit_surveys_paid : globalLimit.limit_surveys_free,
            installs: isPro ? globalLimit.limit_installs_paid : globalLimit.limit_installs_free,
            premium_cpa: isPro ? globalLimit.limit_cpm_paid : globalLimit.limit_cpm_free,
        };

        // Usage Per Category
        const used = {
            ads: usage.rewarded_ads_today || 0,
            tasks: usage.incentive_tasks_today || 0, // Assuming this maps to 'tasks'
            surveys: usage.surveys_today || 0,
            installs: usage.premium_cpa_today || 0, // Assuming 'premium_cpa' maps to 'installs' or 'cpa'
            // usage.premium_cpa_today might be overloaded.
            // dashboard usually groups "tasks" and "earnings".
            last_incentive_at: usage.last_incentive_at // Send completion time for frontend cooldown
        };

        const remaining = {
            ads: Math.max(0, limits.rewarded_ads - used.ads),
            tasks: Math.max(0, limits.incentive_tasks - used.tasks),
            surveys: Math.max(0, limits.surveys - used.surveys),
            // Map legacy frontend keys
            premium: Math.max(0, limits.installs - used.installs)
        };

        res.json({
            user: {
                email: user.email,
                name: user.name,
                wallet_balance: user.wallet_balance,
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
    // Note: getDashboard implementation ends here, previously we had closing braces
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

        if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

        const result = await userService.checkAndRecordEarning(req.user.id, type, Number(amount), platformId, taskId);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.getActivity = async (req, res) => {
    try {
        const WalletTransaction = require('../models/WalletTransaction');

        const transactions = await WalletTransaction.findAll({
            where: { user_id: req.user.id },
            order: [['createdAt', 'DESC']],
            limit: 50
        });

        // Format for frontend
        const activity = transactions.map(tx => {
            // Parse reason "Earning: task (Platform #1)" -> Category: Task
            let category = 'Other';
            let taskName = tx.reason;

            if (tx.reason.includes('Earning:')) {
                const parts = tx.reason.split('Earning: ')[1].split(' ');
                category = parts[0].toUpperCase(); // TASK, AD, etc.
                taskName = tx.reason.replace('Earning: ', '');
            } else if (tx.reason.includes('Withdrawal')) {
                category = 'PAYOUT';
            }

            return {
                id: tx.id,
                task: taskName,
                category: category,
                date: new Date(tx.createdAt).toLocaleString(),
                status: 'Approved', // Wallet transactions are by definition approved/completed
                amount: `$${(tx.amount || 0).toFixed(2)}`
            };
        });

        res.json(activity);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
