const Giveaway = require('../models/Giveaway');
const GiveawayTicket = require('../models/GiveawayTicket');
const User = require('../models/User');
const { Op } = require('sequelize');

// GET /api/giveaways
// Public/User: List ACTIVE giveaways only
exports.getActiveGiveaways = async (req, res) => {
    try {
        const activeGiveaways = await Giveaway.findAll({
            where: {
                status: 'active'
            },
            order: [['createdAt', 'DESC']]
        });

        // Enrich with user's ticket count?
        const enriched = await Promise.all(activeGiveaways.map(async (g) => {
            const ticketCount = await GiveawayTicket.count({
                where: {
                    giveaway_id: g.id,
                    user_id: req.user.id
                }
            });
            const totalTickets = await GiveawayTicket.count({ where: { giveaway_id: g.id } });

            return {
                ...g.toJSON(),
                user_tickets: ticketCount,
                total_tickets: totalTickets // Optional: Show popularity
            };
        }));

        res.json(enriched);
    } catch (err) {
        console.error("Fetch Active Giveaways Error:", err);
        res.status(500).json({ error: "Failed to fetch giveaways" });
    }
};

// POST /api/giveaways/:id/enter
exports.enterGiveaway = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // 1. Check Giveaway
        const giveaway = await Giveaway.findByPk(id);
        if (!giveaway) return res.status(404).json({ error: "Giveaway not found" });
        if (giveaway.status !== 'active') return res.status(400).json({ error: "Giveaway is closed" });

        // 2. Check Balance
        const user = await User.findByPk(userId);
        if ((user.points_balance || 0) < giveaway.cost_points) {
            return res.status(400).json({ error: "Insufficient points" });
        }

        // 3. Deduct Points & Create Ticket
        user.points_balance -= giveaway.cost_points;
        await user.save();

        await GiveawayTicket.create({
            giveaway_id: giveaway.id,
            user_id: userId
        });

        res.json({ success: true, remaining_points: user.points_balance });

    } catch (err) {
        console.error("Enter Giveaway Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// POST /api/spin
exports.performSpin = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findByPk(userId);
        const SystemSetting = require('../models/SystemSetting');

        // 1. Check Spins
        if ((user.spins_available || 0) <= 0) {
            return res.status(400).json({ error: "No spins available. invite friends to earn more!" });
        }

        // 2. Fetch Config
        let config = [];
        const configSetting = await SystemSetting.findOne({ where: { key: 'spin_wheel_config' } });
        if (configSetting && configSetting.value) {
            try {
                config = JSON.parse(configSetting.value);
            } catch (e) { console.error("Bad JSON in spin config", e); }
        }

        // Fallback Default
        if (!config || config.length === 0) {
            config = [
                { id: 1, label: "$0.05", type: "cash", amount: 0.05, probability: 50 },
                { id: 2, label: "$0.10", type: "cash", amount: 0.10, probability: 30 },
                { id: 3, label: "50 Points", type: "points", amount: 50, probability: 10 },
                { id: 4, label: "$0.50", type: "cash", amount: 0.50, probability: 5 },
                { id: 5, label: "Better Luck Next Time", type: "none", amount: 0, probability: 4 },
                { id: 6, label: "$2.00 JACKPOT!", type: "cash", amount: 2.00, probability: 1 }
            ];
        }

        // 3. Weighted Random Selection
        const totalWeight = config.reduce((sum, item) => sum + (item.probability || 0), 0);
        let random = Math.random() * totalWeight;
        let selectedItem = config[config.length - 1]; // Default to last if precision error

        for (const item of config) {
            if (random < item.probability) {
                selectedItem = item;
                break;
            }
            random -= item.probability;
        }

        const { type, amount, label } = selectedItem;

        // 4. Update User
        user.spins_available -= 1;

        if (type === 'cash') {
            user.wallet_balance = (user.wallet_balance || 0) + Number(amount);
        } else if (type === 'points') {
            user.points_balance = (user.points_balance || 0) + Number(amount);
        }

        await user.save();

        // 5. Log Transaction (Only for Cash)
        if (type === 'cash' && Number(amount) > 0) {
            const WalletTransaction = require('../models/WalletTransaction');
            await WalletTransaction.create({
                user_id: user.id,
                amount: Number(amount),
                reason: `Spin Reward: ${label}`
            });
        }

        res.json({
            success: true,
            prize: { type, amount, label },
            spins_remaining: user.spins_available,
            new_balance: { wallet: user.wallet_balance, points: user.points_balance }
        });

    } catch (err) {
        console.error("Spin Error:", err);
        res.status(500).json({ error: err.message });
    }
};
