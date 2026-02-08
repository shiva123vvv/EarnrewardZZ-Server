const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const RevenueLog = require('../models/RevenueLog');
const db = require('../utils/db');

exports.giftCoins = async (req, res) => {
    try {
        const { email, amount } = req.body;
        const senderId = req.user.id;
        const giftAmount = parseInt(amount);

        if (!email || !giftAmount || giftAmount <= 0) {
            return res.status(400).json({ error: "Invalid email or amount" });
        }

        if (giftAmount % 1 !== 0) {
            return res.status(400).json({ error: "Amount must be a whole number" });
        }

        // Transaction for atomicity
        const result = await db.sequelize.transaction(async (t) => {
            // 1. Fetch Sender
            const sender = await User.findByPk(senderId, { transaction: t });
            if (!sender) throw new Error("Sender not found");

            // 2. Validate Balance (Use points_balance for integer coins)
            if ((sender.points_balance || 0) < giftAmount) {
                throw new Error("Insufficient coins");
            }

            // 3. Fetch Recipient
            const recipient = await User.findOne({ where: { email: email.trim() }, transaction: t });
            if (!recipient) throw new Error("Recipient email not found");

            if (recipient.id === sender.id) {
                throw new Error("Cannot gift to yourself");
            }

            // 4. Deduct from Sender
            sender.points_balance -= giftAmount;
            // Also deduct equivalent USD balance for backward compatibility if needed, 
            // but requirements say wallet balance is stored in coins.
            // Let's assume points_balance is the Source of Truth for coins.
            // If wallet_balance is USD, we sync: points / 500
            sender.wallet_balance = sender.points_balance / 500;

            await sender.save({ transaction: t });

            // 5. Add to Recipient
            recipient.points_balance = (recipient.points_balance || 0) + giftAmount;
            recipient.wallet_balance = recipient.points_balance / 500;
            await recipient.save({ transaction: t });

            // 6. Log Transactions
            // Sender Log
            await WalletTransaction.create({
                user_id: sender.id,
                amount: giftAmount, // Storing coins in amount for simplicity, or change schema
                type: 'debit',
                reason: `Gift to ${recipient.email}`
            }, { transaction: t });

            // Recipient Log
            await WalletTransaction.create({
                user_id: recipient.id,
                amount: giftAmount,
                type: 'credit',
                reason: `Gift from ${sender.email || 'User ' + sender.id}`
            }, { transaction: t });

            // Recipient Revenue Log (optional, but good for tracking)
            await RevenueLog.create({
                user_id: recipient.id,
                amount: giftAmount,
                source: 'gift',
                desc: `Gift from ${sender.email}`,
                status: 'completed'
            }, { transaction: t });

            return { sender, recipient };
        });

        res.json({
            success: true,
            message: `Successfully gifted ${giftAmount} coins to ${email}`,
            senderBalance: result.sender.points_balance,
            recipientBalance: result.recipient.points_balance,
            usdValue: result.sender.wallet_balance
        });

    } catch (err) {
        console.error("Gift Error:", err);
        res.status(400).json({ error: err.message || "Gift failed" });
    }
};

exports.getWallet = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        const coins = user.points_balance || 0;
        const usd = coins / 500;

        res.json({
            success: true,
            coins: coins,
            usd: usd,
            // Sync check
            synced: Math.abs(user.wallet_balance - usd) < 0.01
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch wallet" });
    }
};
