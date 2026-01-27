/**
 * CRITICAL: Single Source of Truth for Task Availability
 * 
 * This resolver determines if a user can perform tasks in a category
 * based ONLY on:
 * 1. Daily limits (Free/Paid)
 * 2. Completed count today
 * 3. Enabled providers
 * 4. User status
 * 
 * Task lists, provider responses, or UI state MUST NOT affect this logic.
 */

const { Op } = require('sequelize');
const Platform = require('../models/Platform');
const GlobalLimit = require('../models/GlobalLimit');
const RevenueLog = require('../models/RevenueLog');

/**
 * Category to Platform mapping
 */
const CATEGORY_MAP = {
    'ad': {
        platformCategory: 'ads',
        revenueSource: 'ad',
        limitKeyFree: 'limit_ads_free',
        limitKeyPaid: 'limit_ads_paid'
    },
    'task': {
        platformCategory: 'tasks',
        revenueSource: 'tasks',
        limitKeyFree: 'limit_tasks_free',
        limitKeyPaid: 'limit_tasks_paid'
    },
    'app_installs': {
        platformCategory: 'installs',
        revenueSource: 'installs',
        limitKeyFree: 'limit_installs_free',
        limitKeyPaid: 'limit_installs_paid'
    },
    'survey': {
        platformCategory: 'surveys',
        revenueSource: 'survey',
        limitKeyFree: 'limit_surveys_free',
        limitKeyPaid: 'limit_surveys_paid'
    }
};

/**
 * Resolve category availability for a user
 * 
 * @param {Object} user - User model instance
 * @param {string} category - Category type ('ad', 'task', 'app_installs', 'survey')
 * @returns {Promise<Object>} Availability data
 */
async function resolveCategoryAvailability(user, category) {
    try {
        // Validate category
        const categoryConfig = CATEGORY_MAP[category];
        if (!categoryConfig) {
            throw new Error(`Invalid category: ${category}`);
        }

        // Get Global Limits
        let globalLimit = await GlobalLimit.findOne();
        if (!globalLimit) {
            globalLimit = await GlobalLimit.create({});
        }

        // Determine user plan
        const isPaid = user.plan_type === 'pro';

        // Get daily limit for this category
        const dailyLimit = isPaid
            ? globalLimit[categoryConfig.limitKeyPaid]
            : globalLimit[categoryConfig.limitKeyFree];

        // Calculate completed today
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const completedToday = await RevenueLog.count({
            where: {
                user_id: user.id,
                source: categoryConfig.revenueSource,
                created_at: { [Op.gte]: todayStart }
            }
        });

        // Calculate remaining
        const remainingToday = Math.max(0, dailyLimit - completedToday);

        // Check if at least one provider is enabled
        const hasEnabledProvider = await Platform.count({
            where: {
                category: categoryConfig.platformCategory,
                status: 'enabled'
            }
        }) > 0;

        // CRITICAL: Determine if user CAN perform task (Source of Truth)
        const canPerformTask =
            remainingToday > 0 &&
            hasEnabledProvider &&
            user.status === 'active'; // Ensure user is not banned

        // Determine reason if cannot perform
        let reason = null;
        if (!canPerformTask) {
            if (user.status !== 'active') {
                reason = 'Account suspended';
            } else if (remainingToday === 0) {
                reason = 'Daily limit reached';
            } else if (!hasEnabledProvider) {
                reason = 'No providers available';
            } else {
                reason = 'Unknown';
            }
        }

        return {
            dailyLimit,
            completedToday,
            remainingToday,
            hasEnabledProvider,
            canPerformTask,
            limitReached: remainingToday === 0,
            reason
        };

    } catch (error) {
        console.error('Availability Resolver Error:', error);
        // Return safe defaults on error
        return {
            dailyLimit: 0,
            completedToday: 0,
            remainingToday: 0,
            hasEnabledProvider: false,
            canPerformTask: false,
            limitReached: true,
            reason: 'System error'
        };
    }
}

module.exports = {
    resolveCategoryAvailability,
    CATEGORY_MAP
};
