const GlobalLimit = require('../models/GlobalLimit');
const DailyUsage = require('../models/DailyUsage');
const User = require('../models/User');

/**
 * Ensures a global limit config exists.
 */
async function ensureGlobalLimits() {
    const limit = await GlobalLimit.findOne();
    if (!limit) {
        await GlobalLimit.create({
            free_daily_task_limit: 10,
            paid_daily_task_limit: 50,
            free_daily_max_earn: 2.00,
            paid_daily_max_earn: 20.00,
            reset_time_utc: "00:00"
        });
    }
}

/**
 * Checks if a user can perform a task based on Global Limits.
 * @param {number} userId 
 * @param {number} estimatedReward (Optional) If provided, checks earning limit
 * @returns {Promise<{allowed: boolean, reason?: string}>}
 */
async function canUserDoTask(userId, estimatedReward = 0) {
    try {
        await ensureGlobalLimits();
        const settings = await GlobalLimit.findOne();

        const user = await User.findByPk(userId);
        if (!user) return { allowed: false, reason: 'User not found' };

        // 1. Get Limits based on Plan
        const isPaid = user.plan_type === 'pro';
        const taskLimit = isPaid ? settings.paid_daily_task_limit : settings.free_daily_task_limit;
        const earnLimit = isPaid ? settings.paid_daily_max_earn : settings.free_daily_max_earn;

        // 2. Get Current Usage
        // Ensure usage record exists for today (reset logic is handled elsewhere usually, but we assume data is fresh)
        let usage = await DailyUsage.findOne({ where: { user_id: userId } });
        if (!usage) {
            usage = { incentive_tasks_today: 0, rewarded_ads_today: 0, surveys_today: 0, premium_cpa_today: 0, earnings_today: 0 };
        }

        // 3. Calculate Totals
        const totalTasksDone = (usage.incentive_tasks_today || 0) +
            (usage.rewarded_ads_today || 0) +
            (usage.surveys_today || 0) +
            (usage.premium_cpa_today || 0);

        const totalEarnings = usage.earnings_today || 0;

        // 4. Check Limits
        if (totalTasksDone >= taskLimit) {
            return {
                allowed: false,
                reason: `Global daily task limit reached (${taskLimit}/${taskLimit}). Upgrade for more!`
            };
        }

        if ((totalEarnings + estimatedReward) > earnLimit) {
            return {
                allowed: false,
                reason: `Global daily earning limit reached ($${totalEarnings.toFixed(2)}/$${earnLimit.toFixed(2)}).`
            };
        }

        return { allowed: true };

    } catch (error) {
        console.error("Global Limit Check Error:", error);
        // Fail safe: Allow or Block? Block is safer for abuse, Allow is better for UX.
        // Given "No frontend trust" requirement, better to be strict, but let's allow if DB fails to avoid downtime.
        return { allowed: false, reason: "System validation error" };
    }
}

module.exports = {
    ensureGlobalLimits,
    canUserDoTask
};
