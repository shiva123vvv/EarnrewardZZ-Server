const User = require('../models/User');
const Platform = require('../models/Platform');
const DailyUsage = require('../models/DailyUsage');
const WalletTransaction = require('../models/WalletTransaction');
const AdminLog = require('../models/AdminLog');
const AdminExpense = require('../models/AdminExpense');
const Referral = require('../models/Referral');
const Giveaway = require('../models/Giveaway');
const GiveawayTicket = require('../models/GiveawayTicket');
const SystemSetting = require('../models/SystemSetting');
const db = require('../utils/db');
const { Sequelize } = require('sequelize');
const Op = Sequelize.Op;

// --- Helpher for Logging ---
const logAction = async (adminId, action, target, details) => {
    try {
        await AdminLog.create({
            admin_id: adminId,
            action,
            target,
            details: typeof details === 'object' ? JSON.stringify(details) : details
        });
    } catch (e) {
        console.error("Failed to log admin action:", e);
    }
};

// --- Dashboard Stats ---
// --- Dashboard Stats ---
// Simple in-memory cache to reduce load
let dashboardCache = {
    timestamp: 0,
    data: null
};

// Helper to check if dates are same day
const isSameDay = (d1, d2) => {
    const date1 = new Date(d1);
    const date2 = new Date(d2);
    return date1.getDate() === date2.getDate() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getFullYear() === date2.getFullYear();
};

exports.getDashboardStats = async (req, res) => {
    try {
        // --- 1. INITIALIZE ZERO DATA (Real Data Basis) ---
        let dashData = {
            user_overview: { total: 0, active_today: 0, paid: 0, free: 0, new_today: 0, blocked: 0 },
            earnings: { lifetime_user_earnings: 0, today_user_earnings: 0, today_payouts: 0, platform_revenue_today: 0, platform_revenue_total: 0, net_profit_today: 0 },
            activity: { ads_watched: 0, tasks_completed: 0, surveys_completed: 0, cpa_completed: 0 },
            referrals: { today: 0, total: 0 },
            giveaways: { active_campaigns: 0, tickets: {} },
            system: { enabled_platforms: 0, users_hit_cap: 0, next_reset: new Date(new Date().setUTCHours(24, 0, 0, 0)).toISOString() },
            platform_revenue: []
        };

        // --- 2. FETCH REAL DATA ---
        const todayStart = new Date(); // Current time
        // Note: isSameDay compares Date parts, so time doesn't matter for the comparison logic itself if we use that.
        // But for DB queries like Op.gte, we need start of day.
        todayStart.setHours(0, 0, 0, 0);

        // A. User Stats
        const totalUsers = await User.count();
        if (totalUsers > 0) {
            const paidUsers = await User.count({ where: { plan_type: 'pro' } });
            const blockedUsers = await User.count({ where: { status: 'banned' } });
            const newToday = await User.count({ where: { createdAt: { [Op.gte]: todayStart } } });

            // Daily Usage Stats - Filter for ACTUAL today data
            const allDaily = await DailyUsage.findAll();

            // Filter records that belong to TODAY
            const todaysRecords = allDaily.filter(d => isSameDay(d.last_reset_at, todayStart));

            const activeUsersToday = todaysRecords.filter(d => d.earnings_today > 0 || d.incentive_tasks_today > 0).length;

            dashData.user_overview = {
                total: totalUsers,
                active_today: activeUsersToday,
                paid: paidUsers,
                free: totalUsers - paidUsers,
                new_today: newToday,
                blocked: blockedUsers
            };

            // B. Activity Stats (Only from today's records)
            dashData.activity = {
                ads_watched: todaysRecords.reduce((s, d) => s + (d.rewarded_ads_today || 0), 0),
                tasks_completed: todaysRecords.reduce((s, d) => s + (d.incentive_tasks_today || 0), 0),
                surveys_completed: todaysRecords.reduce((s, d) => s + (d.surveys_today || 0), 0),
                cpa_completed: todaysRecords.reduce((s, d) => s + (d.premium_cpa_today || 0), 0),
            };
        }

        // C. Earnings & Revenue
        const allUsers = await User.findAll({ attributes: ['wallet_balance'] });
        const currentUserBalance = allUsers.reduce((sum, u) => sum + (u.wallet_balance || 0), 0);

        // Calculate Earnings Stats from Logs
        const EarningsLog = require('../models/EarningsLog');
        const date = new Date();
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);

        let monthUserEarnings = 0;
        let allTimeUserEarnings = 0;

        try {
            monthUserEarnings = await EarningsLog.sum('amount', {
                where: { createdAt: { [Op.gte]: monthStart } }
            }) || 0;

            allTimeUserEarnings = await EarningsLog.sum('amount') || 0;
        } catch (e) {
            console.error("EarningsLog calc failed", e);
            // Fallback for file-based DB if sum not supported
            const allLogs = await EarningsLog.findAll();
            allTimeUserEarnings = allLogs.reduce((s, l) => s + (l.amount || 0), 0);
            monthUserEarnings = allLogs
                .filter(l => new Date(l.createdAt) >= monthStart)
                .reduce((s, l) => s + (l.amount || 0), 0);
        }



        // Revenue Logs
        let platformRevenueToday = 0;
        let monthPlatformRevenue = 0;
        let platformRevenueTotal = 0;

        try {
            const RevenueLog = require('../models/RevenueLog');
            const allRevenue = await RevenueLog.findAll();

            platformRevenueTotal = allRevenue.reduce((sum, r) => sum + (r.platform_commission || 0), 0);

            platformRevenueToday = allRevenue
                .filter(r => new Date(r.created_at) >= todayStart)
                .reduce((sum, r) => sum + (r.platform_commission || 0), 0);

            monthPlatformRevenue = allRevenue
                .filter(r => new Date(r.created_at) >= monthStart)
                .reduce((sum, r) => sum + (r.platform_commission || 0), 0);

            // Populate Breakdown
            const Platform = require('../models/Platform');
            const platforms = await Platform.findAll();

            // Map logs to platforms
            platforms.forEach(p => {
                const logs = allRevenue.filter(r => r.platform_name === p.name);
                const pTotal = logs.reduce((sum, r) => sum + (r.platform_commission || 0), 0);
                const pToday = logs.filter(r => new Date(r.created_at) >= todayStart).reduce((sum, r) => sum + (r.platform_commission || 0), 0);

                if (pTotal > 0 || pToday > 0) {
                    dashData.platform_revenue.push({
                        name: p.name,
                        today: pToday,
                        total: pTotal
                    });
                }
            });

            // Fill enabled_platforms count
            dashData.system.enabled_platforms = platforms.filter(p => p.status === 'enabled').length;

        } catch (e) {
            console.log("Revenue calc error/empty", e.message);
        }

        // Payouts & Expenses
        let totalWithdrawn = 0;
        let pendingPayouts = 0;
        let payoutsToday = 0;
        let adminExpenses = 0;
        let pendingUserEarnings = 0; // NEW

        try {
            const Withdrawal = require('../models/Withdrawal');
            const UserTask = require('../models/UserTask'); // NEW

            // Re-fetch withdrawals to get statuses
            const withdrawals = await Withdrawal.findAll();

            totalWithdrawn = withdrawals.filter(w => w.status === 'APPROVED').reduce((sum, w) => sum + w.amount, 0);

            pendingPayouts = withdrawals
                .filter(w => w.status === 'PENDING')
                .reduce((sum, w) => sum + w.amount, 0);

            payoutsToday = withdrawals
                .filter(w => w.status === 'APPROVED' && new Date(w.processed_at) >= todayStart)
                .reduce((sum, w) => sum + w.amount, 0);

            adminExpenses = (await AdminExpense.sum('amount')) || 0;

            // Pending Task Earnings
            pendingUserEarnings = (await UserTask.sum('reward_snapshot', {
                where: { status: 'pending_approval' }
            })) || 0;

        } catch (e) {
            console.error("Payout/Expense calc error", e);
        }

        dashData.earnings = {
            lifetime_user_earnings: allTimeUserEarnings > 0 ? allTimeUserEarnings : (currentUserBalance + totalWithdrawn),
            today_user_earnings: (await DailyUsage.sum('earnings_today')) || 0,
            month_user_earnings: monthUserEarnings,
            all_time_user_earnings: allTimeUserEarnings > 0 ? allTimeUserEarnings : (currentUserBalance + totalWithdrawn),
            pending_user_earnings: pendingUserEarnings, // EXP

            // Payouts
            today_payouts: payoutsToday,
            pending_payouts: pendingPayouts,
            total_paid_out: totalWithdrawn,
            admin_site_payouts: adminExpenses,

            // Site Revenue
            platform_revenue_today: platformRevenueToday,
            platform_revenue_month: monthPlatformRevenue,
            platform_revenue_total: platformRevenueTotal,

            // Totals
            total_system_revenue: (platformRevenueTotal + (allTimeUserEarnings > 0 ? allTimeUserEarnings : (currentUserBalance + totalWithdrawn))),

            net_profit_today: platformRevenueToday - ((await DailyUsage.sum('earnings_today')) || 0)
        };


        // D. Referrals
        const refCountTotal = await Referral.count();
        const refCountToday = await Referral.count({ where: { created_at: { [Op.gte]: todayStart } } });
        dashData.referrals = {
            total: refCountTotal,
            today: refCountToday
        };

        // E. Giveaways
        const activeGiveaways = await Giveaway.count({
            where: {
                end_date: { [Op.gte]: new Date() },
                status: 'active'
            }
        });
        dashData.giveaways.active_campaigns = activeGiveaways;


        // Cache and Return
        dashboardCache = { timestamp: Date.now(), data: dashData };
        res.json({ stats: dashData });

    } catch (err) {
        console.error("Dashboard Stats Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// --- Platform Management ---
exports.getUniquePlatformNames = async (req, res) => {
    try {
        const platforms = await Platform.findAll();
        const names = [...new Set(platforms.map(p => p.name))].sort();
        res.json(names);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.getPlatforms = async (req, res) => {
    try {
        const platforms = await Platform.findAll({ order: [['category', 'ASC'], ['priority', 'ASC']] });
        res.json(platforms);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updatePlatform = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const platform = await Platform.findByPk(id);
        if (!platform) return res.status(404).json({ error: 'Platform not found' });

        await platform.update(updates);
        await logAction(req.user.id, 'UPDATE_PLATFORM', platform.name, updates);

        res.json({ success: true, platform });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createPlatform = async (req, res) => {
    try {
        const platform = await Platform.create(req.body);
        await logAction(req.user.id, 'CREATE_PLATFORM', platform.name, 'Created new platform');
        res.json({ success: true, platform });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- User Management ---
exports.getUsers = async (req, res) => {
    try {
        let users = await User.findAll({
            where: {
                email: { [Op.ne]: null, [Op.ne]: '' },
                role: { [Op.notIn]: ['admin', 'super_admin'] }
            },
            limit: 200, // Fetch more to allow for filtering
            order: [['createdAt', 'DESC']]
        });

        // Filter valid users (Cross-compatible with JSON DB which ignores Where clauses)
        users = users.filter(u =>
            u.email &&
            u.email !== '' &&
            !u.email.includes('demo_user') &&
            u.role !== 'admin' &&
            u.role !== 'super_admin'
        );

        users = users.slice(0, 100);

        // if (users.length === 0) return res.json([]); // Explicitly return empty if no users found (or just continue to map empty array)

        // --- ENRICH REAL USERS ---
        const enrichedUsers = await Promise.all(users.map(async (u) => {
            try {
                // 1. Financials
                // Note: Models might be cached or need fresh require
                const EarningsLog = require('../models/EarningsLog');
                const DailyUsage = require('../models/DailyUsage');
                const Referral = require('../models/Referral');
                const GiveawayTicket = require('../models/GiveawayTicket');

                // Safe fetch logs
                const allLogs = await EarningsLog.findAll({ where: { user_id: u.id } }).catch(() => []);

                // EarningsLog schema currently has no 'status', assume all are completed/approved history
                const pending = 0;
                const lifetime = allLogs.reduce((s, l) => s + (l.amount || 0), 0) + (u.wallet_balance || 0);

                // 2. Activity
                // DailyUsage already required above
                const todayUsage = await DailyUsage.findOne({ where: { user_id: u.id } }).catch(() => ({})) || {};

                // 3. Referrals/Giveaways/Withdrawals
                // Models required above - ensure Withdrawal is required too
                const Withdrawal = require('../models/Withdrawal');
                const refCount = await Referral.count({ where: { referrer_id: u.id } }).catch(() => 0);
                const ticketCount = await GiveawayTicket.count({ where: { user_id: u.id } }).catch(() => 0);
                const allWithdrawals = await Withdrawal.findAll({ where: { user_id: u.id }, order: [['createdAt', 'DESC']] }).catch(() => []); // Fetch history

                const pendingWithdrawalSum = allWithdrawals.filter(w => w.status === 'pending').reduce((s, w) => s + w.amount, 0);

                // 4. RISK ANALYSIS
                // Simple heuristic based on known data
                let riskLevel = 'Low';
                const flags = [];

                if (u.status === 'banned') {
                    riskLevel = 'High';
                    flags.push('Account Banned');
                }

                // Risk: High Referrals + Low Activity
                if (refCount > 50 && (todayUsage.earnings_today || 0) < 0.1) {
                    riskLevel = 'Medium';
                    flags.push('Suspicious Referral Volume');
                }

                // Risk: High Earnings Velocity
                if ((todayUsage.earnings_today || 0) > 50) {
                    riskLevel = 'High';
                    flags.push('Abnormal Daily Earnings');
                }

                return {
                    ...u.toJSON(),
                    pending_earnings: pending, // Future: Sum pending UserTasks
                    withdrawable_balance: u.wallet_balance,
                    lifetime_earnings: lifetime,
                    referrals_count: refCount,
                    giveaway_tickets: ticketCount,
                    withdrawals_history: allWithdrawals,
                    pending_withdrawal_amount: pendingWithdrawalSum,
                    activity: {
                        ads: todayUsage.rewarded_ads_today || 0,
                        tasks: todayUsage.incentive_tasks_today || 0,
                        surveys: todayUsage.surveys_today || 0,
                        installs: todayUsage.premium_cpa_today || 0,
                        cap_hit: (todayUsage.earnings_today || 0) > 10
                    },
                    risk: {
                        level: riskLevel,
                        flags: flags,
                        ip: u.last_login_ip || '127.0.0.1', // Placeholder if not tracked
                        device: u.device_fingerprint || 'Unknown'
                    }
                };
            } catch (err) {
                console.error(`Failed to enrich user ${u.id}:`, err);
                return u.toJSON(); // Fallback to base user data
            }
        }));

        res.json(enrichedUsers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


// Get Single User Detailed
exports.getUser = async (req, res) => {
    try {
        const { id } = req.params;
        let u = await User.findByPk(id);

        if (!u) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Reuse enrichment logic (TODO: Refactor into helper)
        let enrichedUser = u.toJSON();
        try {
            const EarningsLog = require('../models/EarningsLog');
            const DailyUsage = require('../models/DailyUsage');
            const Referral = require('../models/Referral');
            const GiveawayTicket = require('../models/GiveawayTicket');
            const Withdrawal = require('../models/Withdrawal');

            const allLogs = await EarningsLog.findAll({ where: { user_id: u.id } }).catch(() => []);
            const pending = 0; // Schema limitation, requires UserTask sum for accuracy
            const lifetime = allLogs.reduce((s, l) => s + (l.amount || 0), 0) + (u.wallet_balance || 0);

            const todayUsage = await DailyUsage.findOne({ where: { user_id: u.id } }).catch(() => ({})) || {};
            const refCount = await Referral.count({ where: { referrer_id: u.id } }).catch(() => 0);
            const ticketCount = await GiveawayTicket.count({ where: { user_id: u.id } }).catch(() => 0);
            const allWithdrawals = await Withdrawal.findAll({ where: { user_id: u.id }, order: [['createdAt', 'DESC']] }).catch(() => []);
            const pendingWithdrawalSum = allWithdrawals.filter(w => w.status === 'pending').reduce((s, w) => s + w.amount, 0);

            // 4. RISK ANALYSIS
            let riskLevel = 'Low';
            const flags = [];

            if (u.status === 'banned') {
                riskLevel = 'High';
                flags.push('Account Banned');
            }
            if (refCount > 50 && (todayUsage.earnings_today || 0) < 0.1) {
                riskLevel = 'Medium';
                flags.push('Suspicious Referral Volume');
            }
            if ((todayUsage.earnings_today || 0) > 50) {
                riskLevel = 'High';
                flags.push('Abnormal Daily Earnings');
            }

            enrichedUser = {
                ...u.toJSON(),
                pending_earnings: pending,
                withdrawable_balance: u.wallet_balance,
                lifetime_earnings: lifetime,
                referrals_count: refCount,
                giveaway_tickets: ticketCount,
                withdrawals_history: allWithdrawals,
                pending_withdrawal_amount: pendingWithdrawalSum,
                activity: {
                    ads: todayUsage.rewarded_ads_today || 0,
                    tasks: todayUsage.incentive_tasks_today || 0,
                    surveys: todayUsage.surveys_today || 0,
                    installs: todayUsage.premium_cpa_today || 0,
                    cap_hit: (todayUsage.earnings_today || 0) > 10
                },
                risk: {
                    level: riskLevel,
                    flags: flags,
                    ip: u.last_login_ip || '127.0.0.1',
                    device: u.device_fingerprint || 'Unknown'
                }
            };
        } catch (enrichErr) {
            console.error("Enrichment failed for single user", enrichErr);
        }

        res.json(enrichedUser);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, plan_type, wallet_balance } = req.body;
        const user = await User.findByPk(id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const updates = {};
        if (status) updates.status = status;
        if (plan_type) updates.plan_type = plan_type;
        if (typeof wallet_balance !== 'undefined') updates.wallet_balance = wallet_balance;

        await user.update(updates);
        await logAction(req.user.id, 'UPDATE_USER', `User ${id}`, updates);

        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.resetUserCounters = async (req, res) => {
    try {
        const { id } = req.params;
        const usage = await DailyUsage.findOne({ where: { user_id: parseInt(id) } });
        if (usage) {
            await usage.update({
                incentive_tasks_today: 0,
                rewarded_ads_today: 0,
                surveys_today: 0,
                premium_cpa_today: 0,
                earnings_today: 0,
                last_reset_at: new Date()
            });
            await logAction(req.user.id, 'RESET_USER_COUNTERS', `User ${id}`, 'Manual Reset');
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.revokeUserItem = async (req, res) => {
    try {
        const { id } = req.params;
        const { type, amount } = req.body; // type: 'spins' or 'points'
        const user = await User.findByPk(id);

        if (type === 'spins') {
            user.spins_available = Math.max(0, (user.spins_available || 0) - amount);
        } else if (type === 'points') {
            user.points_balance = Math.max(0, (user.points_balance || 0) - amount);
        }

        await user.save();
        await logAction(req.user.id, 'REVOKE_' + type.toUpperCase(), `User ${id}`, `Amount: ${amount}`);

        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- Referrals ---
exports.getReferrals = async (req, res) => {
    try {
        const referrals = await Referral.findAll({ limit: 5000, order: [['createdAt', 'DESC']] });

        if (referrals.length === 0) {
            // return res.json([]);
        }

        // Enhance with user emails if possible (poor man's join for JSON DB)
        const enhanced = await Promise.all(referrals.map(async (ref) => {
            const referrer = await User.findByPk(ref.referrer_id);
            const referred = await User.findByPk(ref.referred_user_id);
            // Handle different object types
            const plainRef = ref.toJSON ? ref.toJSON() : ref;

            return {
                ...plainRef, // .toJSON() if SQL
                referrer_email: referrer?.email || 'Unknown',
                referred_email: referred?.email || 'Unknown'
            };
        }));
        res.json(enhanced);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateReferralStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // 'verified', 'blocked'
        const ref = await Referral.findByPk(id);
        if (!ref) return res.status(404).json({ error: 'Referral not found' });

        await ref.update({ status });

        // Logic: If verified (and previously pending), grant spin?
        // Usually system auto-verifies, but if admin forces 'verified', we might want to grant reward?
        // For now just update status. logic strictly follows "Approve referral" action.

        await logAction(req.user.id, 'UPDATE_REFERRAL', `Referral ${id}`, { status });
        res.json({ success: true, ref });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- Spins & Settings ---
exports.getSettings = async (req, res) => {
    try {
        const settings = await SystemSetting.findAll();
        // Convert array to object
        const settingsMap = {};
        if (settings) {
            settings.forEach(s => {
                let val = s.value;
                try { val = JSON.parse(s.value); } catch (e) { }
                settingsMap[s.key] = val;
            });
        }
        res.json(settingsMap);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateSetting = async (req, res) => {
    try {
        const { key, value } = req.body;
        // Check if exists
        let setting = await SystemSetting.findOne({ where: { key } });
        if (setting) {
            setting.value = JSON.stringify(value); // Model setter handles this but explicit is safe
            await setting.save();
        } else {
            await SystemSetting.create({ key, value });
        }
        await logAction(req.user.id, 'UPDATE_SETTING', key, value);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- Giveaways ---
exports.getGiveaways = async (req, res) => {
    try {
        const giveaways = await Giveaway.findAll({ order: [['createdAt', 'DESC']] });

        if (giveaways.length === 0) {
            // return res.json([]);
        }

        res.json(giveaways);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createGiveaway = async (req, res) => {
    try {
        const giveaway = await Giveaway.create(req.body); // { title, prize_name, cost_points... }
        await logAction(req.user.id, 'CREATE_GIVEAWAY', giveaway.title, 'Created');
        res.json({ success: true, giveaway });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.drawGiveawayWinner = async (req, res) => {
    try {
        const { id } = req.params;
        const giveaway = await Giveaway.findByPk(id);
        if (!giveaway) return res.status(404).json({ error: 'Giveaway not found' });
        if (giveaway.status !== 'active') return res.status(400).json({ error: 'Giveaway not active' });

        const tickets = await GiveawayTicket.findAll({ where: { giveaway_id: parseInt(id) } });
        if (tickets.length === 0) return res.status(400).json({ error: 'No tickets sold' });

        // Random winner
        const winnerTicket = tickets[Math.floor(Math.random() * tickets.length)];

        await giveaway.update({
            status: 'drawn',
            winner_user_id: winnerTicket.user_id,
            draw_time: new Date()
        });

        await logAction(req.user.id, 'DRAW_WINNER', `Giveaway ${id}`, `Winner: ${winnerTicket.user_id}`);
        res.json({ success: true, winner_id: winnerTicket.user_id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- Tickets ---
exports.getGiveawayTickets = async (req, res) => {
    try {
        const { id } = req.params;
        const tickets = await GiveawayTicket.findAll({ where: { giveaway_id: parseInt(id) } });

        if (tickets.length === 0) {
            // return res.json([]);
        }

        // Enrich with User Email & Name
        const enriched = await Promise.all(tickets.map(async (t) => {
            const user = await User.findByPk(t.user_id);
            // Handle different object types (Sequelize instance vs POJO)
            const plainTicket = t.toJSON ? t.toJSON() : t;

            let userName = 'Unknown';
            if (user && user.email) {
                userName = user.email.split('@')[0];
                try { userName = userName.charAt(0).toUpperCase() + userName.slice(1); } catch (e) { }
            }

            return {
                ...plainTicket,
                user_email: user?.email || 'Unknown',
                user_name: userName,
                user_uid: user?.firebase_uid
            };
        }));

        res.json(enriched);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateGiveaway = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const giveaway = await Giveaway.findByPk(id);
        if (!giveaway) return res.status(404).json({ error: 'Giveaway not found' });

        await giveaway.update(updates);
        await logAction(req.user.id, 'UPDATE_GIVEAWAY', `Giveaway ${id}`, updates);
        res.json({ success: true, giveaway });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

// --- Daily Limits Monitor ---
exports.getDailyStats = async (req, res) => {
    try {
        const usage = await DailyUsage.findAll();
        // Aggregate
        const stats = {
            users_hit_cap: 0, // Logic: earnings_today >= limit (need limit in query or constant)
            total_earnings_today: 0,
            tasks_done: 0,
            ads_watched: 0,
            surveys_done: 0
        };

        // Assume default cap $10 for free, $20 for pro. 
        // We need user info to know cap, but let's approximate or just show raw totals

        usage.forEach(u => {
            stats.total_earnings_today += u.earnings_today || 0;
            stats.tasks_done += u.incentive_tasks_today || 0;
            stats.ads_watched += u.rewarded_ads_today || 0;
            stats.surveys_done += u.surveys_today || 0;

            if (u.earnings_today >= 5.00) stats.users_hit_cap++; // Arbitrary threshold for monitor
        });

        res.json({
            stats,
            next_reset: new Date(new Date().setUTCHours(24, 0, 0, 0)).toISOString()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.forceGlobalReset = async (req, res) => {
    try {
        // Since we are using our hybrid `db.js` which might not iterate all in update(), 
        // the safest way for JSON DB without raw query support is:
        const allUsage = await DailyUsage.findAll();
        for (const usage of allUsage) {
            await usage.update({
                incentive_tasks_today: 0,
                rewarded_ads_today: 0,
                surveys_today: 0,
                premium_cpa_today: 0,
                earnings_today: 0,
                last_reset_at: new Date()
            });
        }

        await logAction(req.user.id, 'FORCE_RESET', 'GLOBAL', 'Manual Daily Reset Triggered');
        res.json({ success: true, count: allUsage.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- CMS: Global Limits ---
exports.getGlobalLimits = async (req, res) => {
    try {
        const GlobalLimit = require('../models/GlobalLimit');
        let limit = await GlobalLimit.findOne();
        if (!limit) limit = await GlobalLimit.create({});
        res.json(limit);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateGlobalLimits = async (req, res) => {
    try {
        const GlobalLimit = require('../models/GlobalLimit');
        let limit = await GlobalLimit.findOne();
        if (!limit) limit = await GlobalLimit.create({});

        await limit.update(req.body);
        await logAction(req.user.id, 'UPDATE_GLOBAL_LIMITS', 'Settings', req.body);

        res.json({ success: true, limit });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- Logs ---
exports.getLogs = async (req, res) => {
    try {
        const logs = await AdminLog.findAll({
            limit: 200,
            order: [['createdAt', 'DESC']]
        });
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.addAdminExpense = async (req, res) => {
    try {
        const { amount, description } = req.body;
        const AdminExpense = require('../models/AdminExpense');
        await AdminExpense.create({
            amount: parseFloat(amount),
            description
        });
        res.json({ success: true });
    } catch (error) {
        console.error("Add Expense Error:", error);
        res.status(500).json({ error: "Failed to add expense" });
    }
};
