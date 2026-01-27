const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');

// --- Helper for fetching by status ---
const getWithdrawalsByStatus = async (res, status) => {
    try {
        // 1. Fetch All (JSON DB ignores where/include)
        const allWithdrawals = await Withdrawal.findAll();

        // 2. Filter by Status
        const filtered = allWithdrawals.filter(w =>
            w.status && w.status.toUpperCase() === status.toUpperCase()
        );

        // 3. Populate User Data & Validate
        const populated = await Promise.all(filtered.map(async w => {
            // Data might be Sequelize instance or Raw JSON
            const wData = (w.toJSON && typeof w.toJSON === 'function') ? w.toJSON() : w;

            let userData = null;
            if (wData.user_id) {
                const u = await User.findByPk(wData.user_id);
                if (u) {
                    userData = {
                        id: u.id,
                        email: u.email,
                        role: u.role,
                        wallet_balance: u.wallet_balance
                    };
                }
            }

            return {
                ...wData,
                user: userData
            };
        }));

        // 4. Filter Invalid Records (Missing User, Amount, or Method)
        const validWithdrawals = populated.filter(w =>
            w.user &&
            w.amount > 0 &&
            w.payment_method
        );

        // 5. Sort: PENDING = Oldest First (FIFO), OTHERS = Newest First
        validWithdrawals.sort((a, b) => {
            const dateA = new Date(a.createdAt);
            const dateB = new Date(b.createdAt);
            if (status.toUpperCase() === 'PENDING') {
                return dateA - dateB; // Oldest first
            }
            return dateB - dateA; // Newest first
        });

        res.json(validWithdrawals);
    } catch (err) {
        console.error(`Error fetching ${status} withdrawals:`, err);
        res.status(500).json({ error: err.message });
    }
};

// --- GET Endpoints ---
exports.getPendingWithdrawals = async (req, res) => {
    await getWithdrawalsByStatus(res, 'PENDING');
};

exports.getApprovedWithdrawals = async (req, res) => {
    await getWithdrawalsByStatus(res, 'APPROVED');
};

exports.getRejectedWithdrawals = async (req, res) => {
    await getWithdrawalsByStatus(res, 'REJECTED');
};

// --- ACTION Endpoints ---

exports.approveWithdrawal = async (req, res) => {
    try {
        const { id } = req.params;
        const { adminNote } = req.body;

        const withdrawal = await Withdrawal.findByPk(id);
        if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' });

        if (withdrawal.status !== 'PENDING') {
            return res.status(400).json({ error: `Cannot approve. Current status: ${withdrawal.status}` });
        }

        withdrawal.status = 'APPROVED';
        withdrawal.admin_note = adminNote || null;
        withdrawal.processed_at = new Date();
        await withdrawal.save();

        res.json({ success: true, message: 'Withdrawal approved', withdrawal });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.rejectWithdrawal = async (req, res) => {
    try {
        const { id } = req.params;
        const { adminNote } = req.body;

        if (!adminNote) return res.status(400).json({ error: 'Admin note (reason) is required for rejection.' });

        const withdrawal = await Withdrawal.findByPk(id);
        if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' });

        if (withdrawal.status !== 'PENDING') {
            return res.status(400).json({ error: `Cannot reject. Current status: ${withdrawal.status}` });
        }

        // Refund the amount to user's wallet
        // Wait, normally we deduct on Request. If rejected, we must refund.
        // Assuming wallet deduction happened on request creation.
        // TODO: Transaction handling if we were thorough, but keeping simple as requested.

        const user = await User.findByPk(withdrawal.user_id);
        if (user) {
            user.wallet_balance += withdrawal.amount;
            await user.save();
        }

        withdrawal.status = 'REJECTED';
        withdrawal.admin_note = adminNote;
        withdrawal.processed_at = new Date();
        await withdrawal.save();

        res.json({ success: true, message: 'Withdrawal rejected and refunded', withdrawal });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- User Create Withdrawal (Extra helper if needed) ---
exports.createWithdrawal = async (req, res) => {
    try {
        const { amount, paymentMethod, upiId, paypalEmail } = req.body;
        const userId = req.user.id;

        // Basic Validation
        if (amount < 50) return res.status(400).json({ error: 'Minimum withdrawal amount is $50' });

        const user = await User.findByPk(userId);
        if (user.wallet_balance < amount) return res.status(400).json({ error: 'Insufficient funds' });

        // Method validation
        if (paymentMethod === 'UPI' && !upiId) return res.status(400).json({ error: 'UPI ID is required' });
        if (paymentMethod === 'PAYPAL' && !paypalEmail) return res.status(400).json({ error: 'PayPal Email is required' });

        // Deduct balance immediately
        user.wallet_balance -= amount;
        await user.save();

        const withdrawal = await Withdrawal.create({
            user_id: userId,
            amount,
            payment_method: paymentMethod,
            upi_id: paymentMethod === 'UPI' ? upiId : null,
            paypal_email: paymentMethod === 'PAYPAL' ? paypalEmail : null,
            status: 'PENDING'
        });

        res.json({ success: true, withdrawal });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getUserWithdrawals = async (req, res) => {
    try {
        const userId = req.user.id;
        const withdrawals = await Withdrawal.findAll({
            where: { user_id: userId },
            order: [['createdAt', 'DESC']]
        });
        res.json(withdrawals);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
