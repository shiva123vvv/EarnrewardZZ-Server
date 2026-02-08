const Task = require('../models/Task');
const GlobalLimit = require('../models/GlobalLimit');
const UserTask = require('../models/UserTask');
const User = require('../models/User');
const DailyUsage = require('../models/DailyUsage');
const db = require('../utils/db');
const { canUserPerformTask } = require('../utils/limitHandler');
const Platform = require('../models/Platform');
const { resolveCategoryAvailability } = require('../utils/availabilityResolver');

// HELPER: Reset Daily Checks
const checkAndResetDaily = async (usage) => {
    const today = new Date().toISOString().slice(0, 10);
    const lastReset = usage.last_reset_at ? new Date(usage.last_reset_at).toISOString().slice(0, 10) : '';

    if (today !== lastReset) {
        usage.incentive_tasks_today = 0;
        usage.rewarded_ads_today = 0;
        usage.surveys_today = 0;
        usage.premium_cpa_today = 0;
        usage.earnings_today = 0;
        usage.last_reset_at = new Date();
        await usage.save();
    }
    return usage;
};

// GET /api/tasks?type=xxx
exports.getTasks = async (req, res) => {
    try {
        const { type } = req.query; // ad, task, survey, app_installs
        const userId = req.user.id;

        const user = await User.findByPk(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        // CRITICAL: Use shared availability resolver (Single Source of Truth)
        const availability = await resolveCategoryAvailability(user, type);

        // 1. Get & Reset Usage (Keep legacy usage tracking for dashboard stats)
        let usage = await DailyUsage.findOne({ where: { user_id: userId } });
        if (!usage) usage = await DailyUsage.create({ user_id: userId });
        usage = await checkAndResetDaily(usage);

        // 2. Fetch Tasks (Manual database tasks)
        let tasks = await Task.findAll();

        // [PLATFORM INJECTION] For Offerwalls, inject enabled platforms as clickable tasks
        if (type === 'task') {
            const platforms = await Platform.findAll({
                where: { category: 'tasks', status: 'enabled' },
                order: [['priority', 'ASC']]
            });

            const platformTasks = platforms.map(p => ({
                id: `platform-${p.id}`,
                title: p.name,
                provider: p.name,
                reward: 0, // Platforms handle their own rewards
                difficulty: 'Variable',
                instructions: p.notes || `Complete offers from ${p.name} to earn rewards.`,
                type: 'task',
                is_active: true,
                is_platform: true,
                platform_id: p.id,
                platform_config: p.config // Pass config for routing
            }));

            // Merge: Show platforms first, then manual tasks
            tasks = [...platformTasks, ...tasks];
        }

        // 3. Fetch User's History Today
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const userHistory = await UserTask.findAll();
        const historyToday = userHistory.filter(ut =>
            ut.user_id === userId &&
            new Date(ut.started_at) >= todayStart
        );

        // 4. Calculate Stats for this category
        const { Op } = require('sequelize');
        const RevenueLog = require('../models/RevenueLog');

        // Get Global Limits
        let globalLimit = await GlobalLimit.findOne();
        if (!globalLimit) globalLimit = await GlobalLimit.create({});

        const isPaid = user.plan_type === 'pro';

        // Determine daily limit based on type
        let dailyLimit = 0;
        let sourceType = type; // Map type to RevenueLog source

        switch (type) {
            case 'ad':
                dailyLimit = isPaid ? globalLimit.limit_ads_paid : globalLimit.limit_ads_free;
                break;
            case 'task':
                dailyLimit = isPaid ? globalLimit.limit_tasks_paid : globalLimit.limit_tasks_free;
                sourceType = 'tasks';
                break;
            case 'survey':
                dailyLimit = isPaid ? globalLimit.limit_surveys_paid : globalLimit.limit_surveys_free;
                break;
            default:
                dailyLimit = 0;
        }

        // Count completed today
        const completedToday = await RevenueLog.count({
            where: {
                user_id: userId,
                source: sourceType,
                created_at: { [Op.gte]: todayStart }
            }
        });

        const remaining = Math.max(0, dailyLimit - completedToday);

        // 5. Construct Response List (for display, NOT availability)
        const finalTasks = await Promise.all(tasks.filter(t => t.type === type && t.is_active).map(async t => {
            const h = historyToday.find(ut => ut.task_id === t.id);
            let status = 'Available';
            if (h) {
                if (h.status === 'completed') status = 'Completed';
                else if (h.status === 'pending_approval') status = 'Pending Approval';
                else if (h.status === 'in_progress') status = 'In Progress';
            }

            return {
                id: t.id,
                title: t.title,
                provider: t.provider,
                reward: t.reward,
                difficulty: t.difficulty,
                instructions: t.instructions,
                status
            };
        }));

        // RESPONSE: Explicit availability flags from resolver
        res.json({
            success: true,
            reset_time: "00:00 UTC",
            tasks: finalTasks,
            plan: user.plan_type,
            limits: {
                total: availability.dailyLimit,
                completed: availability.completedToday,
                remaining: availability.remainingToday
            },
            // CRITICAL: Availability from shared resolver
            availability: {
                canPerformTask: availability.canPerformTask,
                hasEnabledProvider: availability.hasEnabledProvider,
                limitReached: availability.limitReached,
                reason: availability.reason
            }
        });

    } catch (err) {
        console.error("Get Tasks Error:", err);
        res.status(500).json({ error: "Failed to fetch tasks" });
    }
};

// POST /api/tasks/start
exports.startTask = async (req, res) => {
    try {
        const { taskId } = req.body;
        const userId = req.user.id;

        // [PLATFORM HANDLING] Check if this is a platform-based task
        if (taskId && taskId.toString().startsWith('platform-')) {
            const platformId = taskId.replace('platform-', '');
            const platform = await Platform.findByPk(platformId);

            if (!platform) return res.status(404).json({ error: "Platform not found" });
            if (platform.status !== 'enabled') return res.status(403).json({ error: "Platform is disabled" });

            // Check global limits for this category
            const permission = await canUserPerformTask(userId, platform.id);
            if (!permission.allowed) {
                return res.status(403).json({ error: permission.reason });
            }

            // Return platform route info for frontend navigation
            return res.json({
                success: true,
                platform: true,
                route: platform.config?.route || platform.name.toLowerCase(),
                config: platform.config
            });
        }

        const task = await Task.findByPk(taskId);
        if (!task) return res.status(404).json({ error: "Task not found" });

        // 1. GET & RESET USAGE
        const user = await User.findByPk(userId);
        let usage = await DailyUsage.findOne({ where: { user_id: userId } });
        if (!usage) usage = await DailyUsage.create({ user_id: userId });
        usage = await checkAndResetDaily(usage);

        // 2. GLOBAL & PLATFORM LIMIT CHECK
        // Find platform by provider name
        const platform = await Platform.findOne({ where: { name: task.provider } });
        if (!platform) {
            // If platform known by provider name doesn't exist, we might fail or default.
            // Assuming strict mode: Platform must exist.
            return res.status(403).json({ error: `Platform ${task.provider} not configured.` });
        }

        const permission = await canUserPerformTask(userId, platform.id);
        if (!permission.allowed) {
            return res.status(403).json({ error: permission.reason });
        }

        // Check if already completed today (Duplicate Check)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);




        // Check duplicates
        const allUserTasks = await UserTask.findAll();
        const existing = allUserTasks.find(ut =>
            ut.user_id === userId &&
            ut.task_id === task.id &&
            new Date(ut.started_at) >= todayStart
        );

        if (existing && (existing.status === 'completed' || existing.status === 'pending_approval')) {
            return res.status(400).json({ error: "Task already completed today" });
        }

        // Log Start
        if (!existing) {
            await UserTask.create({
                user_id: userId,
                task_id: task.id,
                provider: task.provider,
                status: 'in_progress',
                reward_snapshot: task.reward
            });
        }

        // Generate "Tracking URL" (Simulated)
        const trackingUrl = `https://offers.simulate.com/click?offer=${task.id}&uid=${userId}`;

        res.json({
            success: true,
            url: trackingUrl
        });

    } catch (err) {
        console.error("Start Task Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// START CATEGORY (Generic Action)
// POST /api/tasks/start-category
// Body: { category: 'ad' | 'task' | 'app_installs' | 'survey' }
exports.startCategory = async (req, res) => {
    try {
        const { category } = req.body;
        const userId = req.user.id;

        const user = await User.findByPk(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        // 1. Verify Availability
        const availability = await resolveCategoryAvailability(user, category);
        if (!availability.canPerformTask) {
            return res.status(403).json({ error: availability.reason || "Task unavailable" });
        }

        // 2. Resolve Best Provider
        const { CATEGORY_MAP } = require('../utils/availabilityResolver');
        const config = CATEGORY_MAP[category];
        if (!config) return res.status(400).json({ error: "Invalid category" });

        // Find highest priority enabled platform for this category
        const platform = await Platform.findOne({
            where: {
                category: config.platformCategory,
                status: 'enabled'
            },
            order: [['priority', 'ASC']] // Assumes lower number = higher priority (1, 2, 3...)
        });

        if (!platform) {
            return res.status(404).json({ error: "No providers available at the moment. Please try again later." });
        }

        // 3. Log Start (Optional, usually we log on completion or specific callback)
        // But we can check specifically if user is allowed on THIS platform (redundant if availability checked enabled providers, but safe)
        // 3. Log Start (Optional, usually we log on completion or specific callback)
        // We already verified category limits via resolveCategoryAvailability.
        // We verified platform status manually.
        // Skipping redundant canUserPerformTask check to avoid system errors.

        // 4. Return Route
        return res.json({
            success: true,
            platform: true,
            provider: platform.name,
            route: platform.config?.route || platform.name.toLowerCase(),
            config: platform.config,
            // For external URL providers
            url: platform.config?.url
        });

    } catch (err) {
        console.error("Start Category Error:", err);
        res.status(500).json({ error: "Failed to start task" });
    }
};

// GET ACTIVE PLATFORMS (Public/Auth)
exports.getActivePlatforms = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findByPk(userId);

        const platforms = await Platform.findAll({
            where: { status: 'enabled' },
            order: [['priority', 'ASC']]
        });

        // Get Global Limits
        let globalLimit = await GlobalLimit.findOne();
        if (!globalLimit) globalLimit = await GlobalLimit.create({});

        const isPaid = user && user.plan_type === 'pro';

        // Calculate completed tasks today per category
        const { Op } = require('sequelize');
        const RevenueLog = require('../models/RevenueLog');

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // Count completions by source (category)
        const completedAds = await RevenueLog.count({
            where: { user_id: userId, source: 'ad', created_at: { [Op.gte]: todayStart } }
        });
        const completedTasks = await RevenueLog.count({
            where: { user_id: userId, source: 'tasks', created_at: { [Op.gte]: todayStart } }
        });
        const completedInstalls = await RevenueLog.count({
            where: { user_id: userId, source: 'installs', created_at: { [Op.gte]: todayStart } }
        });
        const completedSurveys = await RevenueLog.count({
            where: { user_id: userId, source: 'survey', created_at: { [Op.gte]: todayStart } }
        });

        // Valid Categories Map with stats
        const validCategories = {
            'ads': {
                id: 'ads',
                title: "A) Ads (Rewarded)",
                desc: "Watch rewarded ads to earn points.",
                icon: "📺",
                type: 'ad',
                limit: isPaid ? globalLimit.limit_ads_paid : globalLimit.limit_ads_free,
                completed: completedAds
            },
            'tasks': {
                id: 'offerwall',
                title: "B) Offerwalls & Tasks",
                desc: "Complete available tasks to earn points.",
                icon: "📋",
                type: 'task',
                limit: isPaid ? globalLimit.limit_tasks_paid : globalLimit.limit_tasks_free,
                completed: completedTasks
            },
            'installs': {
                id: 'app_installs',
                title: "C) App Installs",
                desc: "Install and use apps to earn points.",
                icon: "📲",
                type: 'app_installs',
                limit: isPaid ? globalLimit.limit_installs_paid : globalLimit.limit_installs_free,
                completed: completedInstalls
            },
            'surveys': {
                id: 'surveys',
                title: "E) Surveys",
                desc: "Answer surveys to earn points.",
                icon: "📝",
                type: 'survey',
                limit: isPaid ? globalLimit.limit_surveys_paid : globalLimit.limit_surveys_free,
                completed: completedSurveys
            }
        };

        const activeCategories = [];
        const categoryKeys = ['ads', 'tasks', 'installs', 'surveys'];

        categoryKeys.forEach(dbCategory => {
            const hasEnabledPlatforms = platforms.some(p => p.category === dbCategory);
            const conf = validCategories[dbCategory];

            if (hasEnabledPlatforms && conf && conf.limit > 0) {
                const remaining = Math.max(0, conf.limit - conf.completed);
                activeCategories.push({
                    id: conf.id,
                    title: conf.title,
                    desc: conf.desc,
                    icon: conf.icon,
                    type: conf.type,
                    stats: {
                        limit: conf.limit,
                        completed: conf.completed,
                        remaining
                    }
                });
            }
        });

        res.json({ success: true, categories: activeCategories });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/offerwalls/active - Get the highest priority enabled offerwall
exports.getActiveOfferwall = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findByPk(userId);

        if (!user) return res.status(404).json({ error: "User not found" });

        // Get Global Limits to determine daily task limit
        let globalLimit = await GlobalLimit.findOne();
        if (!globalLimit) globalLimit = await GlobalLimit.create({});

        const isPaid = user.plan_type === 'pro';
        const dailyLimit = isPaid ? globalLimit.limit_tasks_paid : globalLimit.limit_tasks_free;

        // Calculate completed tasks today
        const { Op } = require('sequelize');
        const RevenueLog = require('../models/RevenueLog');

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const completedToday = await RevenueLog.count({
            where: {
                user_id: userId,
                source: 'tasks', // Offerwall category
                created_at: { [Op.gte]: todayStart }
            }
        });

        const remaining = Math.max(0, dailyLimit - completedToday);

        // Fetch enabled offerwall platforms sorted by priority
        const platforms = await Platform.findAll({
            where: {
                category: 'tasks',
                status: 'enabled'
            },
            order: [['priority', 'ASC']] // Lower number = higher priority
        });

        if (platforms.length === 0) {
            return res.json({
                success: true,
                available: false,
                message: "No tasks available right now.",
                stats: {
                    dailyLimit,
                    completed: completedToday,
                    remaining,
                    planType: isPaid ? 'Pro' : 'Free'
                }
            });
        }

        // Check if user has reached limit
        if (remaining <= 0) {
            return res.json({
                success: true,
                available: false,
                message: `Daily limit reached (${dailyLimit} tasks per day)`,
                stats: {
                    dailyLimit,
                    completed: completedToday,
                    remaining: 0,
                    planType: isPaid ? 'Pro' : 'Free'
                }
            });
        }

        // Select the first (highest priority) platform
        const selectedPlatform = platforms[0];

        // Check if user can access this platform (global limits)
        const permission = await canUserPerformTask(userId, selectedPlatform.id);

        if (!permission.allowed) {
            // Try next platform if available
            if (platforms.length > 1) {
                const fallbackPlatform = platforms[1];
                const fallbackPermission = await canUserPerformTask(userId, fallbackPlatform.id);

                if (fallbackPermission.allowed) {
                    return res.json({
                        success: true,
                        available: true,
                        platform: {
                            id: fallbackPlatform.id,
                            route: fallbackPlatform.config?.route || fallbackPlatform.name.toLowerCase(),
                            type: fallbackPlatform.config?.type || 'external_iframe'
                        },
                        stats: {
                            dailyLimit,
                            completed: completedToday,
                            remaining,
                            planType: isPaid ? 'Pro' : 'Free'
                        }
                    });
                }
            }

            return res.json({
                success: true,
                available: false,
                message: permission.reason,
                stats: {
                    dailyLimit,
                    completed: completedToday,
                    remaining,
                    planType: isPaid ? 'Pro' : 'Free'
                }
            });
        }

        // Return platform routing info with stats
        res.json({
            success: true,
            available: true,
            platform: {
                id: selectedPlatform.id,
                route: selectedPlatform.config?.route || selectedPlatform.name.toLowerCase(),
                type: selectedPlatform.config?.type || 'external_iframe'
            },
            stats: {
                dailyLimit,
                completed: completedToday,
                remaining,
                planType: isPaid ? 'Pro' : 'Free'
            }
        });

    } catch (err) {
        console.error("Get Active Offerwall Error:", err);
        res.status(500).json({ error: "Failed to fetch offerwall" });
    }
};
