const User = require('../models/User');
const Referral = require('../models/Referral');
const { Op } = require('sequelize');
const db = require('../utils/db');

// Helper to generate code
const generateUniqueCode = async (userId) => {
    // Code: REF + UserId + Random 3 chars (e.g. REF50X9Z)
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `REF${userId}${random}`;
};

// 1. Get Referral Dashboard Data
exports.getReferralData = async (req, res) => {
    try {
        const userId = req.user.id;
        let user = req.user;

        // Ensure user has a referral code
        if (!user.referral_code) {
            user.referral_code = await generateUniqueCode(userId);
            await user.save();
        }

        // Stats
        const totalReferrals = await Referral.count({ where: { referrer_id: userId } });
        const successfulReferrals = await Referral.count({ where: { referrer_id: userId, status: 'verified' } });
        const earnedSpins = await Referral.count({ where: { referrer_id: userId, rewarded: true } });

        // History
        const history = await Referral.findAll({
            where: { referrer_id: userId },
            order: [['createdAt', 'DESC']],
            limit: 50 // Cap recent history
        });

        // Resolve referred user masking (need to fetch names/emails if not joined)
        const historyWithDetails = await Promise.all(history.map(async (ref) => {
            const referredUser = await User.findByPk(ref.referred_user_id);
            const email = referredUser ? referredUser.email : 'Unknown';
            // mask email: sh***@gmail.com
            const masked = email.replace(/(^.{2}).+(@.+)/, '$1***$2');
            return {
                id: ref.id,
                user_email: masked,
                status: ref.status,
                spins_granted: ref.rewarded ? 1 : 0,
                date: ref.createdAt
            };
        }));

        // Fetch Spin Config
        const SystemSetting = require('../models/SystemSetting');
        const configSetting = await SystemSetting.findOne({ where: { key: 'spin_wheel_config' } });
        let spinConfig = [];
        if (configSetting && configSetting.value) {
            try { spinConfig = JSON.parse(configSetting.value); } catch (e) { }
        }
        // Defaults
        if (!spinConfig.length) {
            spinConfig = [
                { id: 1, label: "$0.05", type: "cash", amount: 0.05, probability: 50 },
                { id: 2, label: "$0.10", type: "cash", amount: 0.10, probability: 30 },
                { id: 3, label: "50 Points", type: "points", amount: 50, probability: 10 },
                { id: 4, label: "$0.50", type: "cash", amount: 0.50, probability: 5 },
                { id: 5, label: "Better Luck Next Time", type: "none", amount: 0, probability: 4 },
                { id: 6, label: "$2.00 JACKPOT!", type: "cash", amount: 2.00, probability: 1 }
            ];
        }

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

        res.json({
            referral_code: user.referral_code,
            referral_link: `${frontendUrl}/register?ref=${user.referral_code}`,
            stats: {
                total: totalReferrals,
                verified: successfulReferrals,
                spins_earned: earnedSpins,
                points_balance: user.points_balance || 0,
                spins_available: user.spins_available || 0
            },
            history: historyWithDetails,
            spin_config: spinConfig // NEW
        });

    } catch (err) {
        console.error("Referral Data Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// 2. Trigger Verification Check (called by User B when they verify email)
exports.verifyReferral = async (req, res) => {
    try {
        const userId = req.user.id;
        const emailVerified = req.body.emailVerified; // Trusted from client (Firebase)

        if (!emailVerified) return res.json({ success: false, message: 'Email not verified yet.' });

        // Find incoming referral record for this user (where they are the 'referred')
        const referral = await Referral.findOne({ where: { referred_user_id: userId } });

        if (!referral) {
            // No referral, but we might want to update user status anyway?
            // User model update?
            return res.json({ success: true, message: 'No referral to verify, but status updated.' });
        }

        if (referral.status === 'verified') {
            return res.json({ success: true, message: 'Already verified.' });
        }

        // --- Execute Reward Logic ---
        referral.status = 'verified';

        // Grant Reward to Referrer
        const referrer = await User.findByPk(referral.referrer_id);
        if (referrer) {
            referrer.spins_available += 1;
            await referrer.save();
            referral.rewarded = true;
        }

        await referral.save();

        res.json({ success: true, message: 'Referral verified! Reward granted to referrer.' });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
