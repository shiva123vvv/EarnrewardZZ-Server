const { Op } = require('sequelize');
const GlobalLimit = require('../models/GlobalLimit');
const Platform = require('../models/Platform');
const RevenueLog = require('../models/RevenueLog');
const User = require('../models/User');

const getDayStart = (resetTimeStr) => {
    const now = new Date();
    const [h, m] = (resetTimeStr || "00:00").split(':').map(Number);
    const todayReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0));
    if (now >= todayReset) {
        return todayReset;
    } else {
        const yesterdayReset = new Date(todayReset);
        yesterdayReset.setUTCDate(todayReset.getUTCDate() - 1);
        return yesterdayReset;
    }
};

const canUserPerformTask = async (userId, platformId) => {
    try {
        const user = await User.findByPk(userId);
        if (!user) return { allowed: false, reason: "User not found" };

        const platform = await Platform.findByPk(platformId);
        if (!platform || platform.status !== 'enabled') return { allowed: false, reason: "Platform disabled" };

        let globalLimit = await GlobalLimit.findOne();
        if (!globalLimit) globalLimit = await GlobalLimit.create({});

        const dayStart = getDayStart(globalLimit.reset_time_utc);

        // 1. DETERMINE CATEGORY
        const category = platform.category; // ads, tasks, installs, cpm, surveys

        // 2. FETCH TOTAL COUNT FOR THIS CATEGORY TODAY
        // We filter RevenueLog by 'source'. Assuming 'source' in RevenueLog matches category or is close.
        // If RevenueLog.source uses specific strings like "OfferToro", "CPAGrip", we need mapping.
        // However, usually we might store category in source OR we have to join.
        // Since we added `platform_name` to RevenueLog, we can assume:
        // Join/Filter logic: Log -> platform_name -> Platform -> category.

        // BETTER: When logging RevenueLog, we normally save 'source' as the category (ads/tasks).
        // Let's assume 'source' corresponds to category OR we check all logs where platform_name 
        // matches any platform of this category.
        // For simplicity: We will query logs where `source` = category. 
        // IF source != category (e.g. source="CPAGrip"), we need better logic.
        // Assuming the system logs `source` as 'ads', 'tasks' etc. based on previous code context.
        // (See RevenueLog model comments: // ads | survey | cpa | task | referral)

        const count = await RevenueLog.count({
            where: {
                user_id: userId,
                source: category, // Enforcing source must match category string
                created_at: { [Op.gte]: dayStart }
            }
        });

        // 3. GET LIMIT
        const isPaid = user.plan_type === 'pro';
        let limit = 0;

        switch (category) {
            case 'ads': limit = isPaid ? globalLimit.limit_ads_paid : globalLimit.limit_ads_free; break;
            case 'tasks': limit = isPaid ? globalLimit.limit_tasks_paid : globalLimit.limit_tasks_free; break;
            case 'installs': limit = isPaid ? globalLimit.limit_installs_paid : globalLimit.limit_installs_free; break;
            case 'cpm': limit = isPaid ? globalLimit.limit_cpm_paid : globalLimit.limit_cpm_free; break;
            case 'surveys': limit = isPaid ? globalLimit.limit_surveys_paid : globalLimit.limit_surveys_free; break;
            default: limit = 9999; // Fallback
        }

        if (count >= limit) {
            return { allowed: false, reason: `Daily limit reached for ${category} (${limit} per day)` };
        }

        // 4. CHECK PLATFORM SPECIFIC FREQUENCY LIMITS (Config)
        // Checks config.free_limit, config.paid_limit, or config.frequency_cap
        const platformConfig = platform.config || {};
        let platformLimit = isPaid ? (platformConfig.paid_limit || platformConfig.frequency_cap) : (platformConfig.free_limit || platformConfig.frequency_cap);

        // Ensure numeric
        platformLimit = Number(platformLimit);

        if (platformLimit > 0) {
            const platformCount = await RevenueLog.count({
                where: {
                    user_id: userId,
                    platform_name: platform.name,
                    created_at: { [Op.gte]: dayStart }
                }
            });

            if (platformCount >= platformLimit) {
                return { allowed: false, reason: `Daily limit reached for ${platform.name} (${platformLimit} per day)` };
            }
        }

        // 5. CHECK PLATFORM Earning Cap
        if (platform.max_earn > 0) {
            const currentPlatformEarn = await RevenueLog.sum('user_earning', {
                where: {
                    user_id: userId,
                    platform_name: platform.name,
                    created_at: { [Op.gte]: dayStart }
                }
            }) || 0;

            if (currentPlatformEarn >= platform.max_earn) {
                return { allowed: false, reason: `Daily earning limit reached for ${platform.name}` };
            }
        }

        return { allowed: true };
    } catch (error) {
        console.error("Limit Check Error:", error);
        return { allowed: false, reason: "System error checking limits" };
    }
};

module.exports = { canUserPerformTask };
