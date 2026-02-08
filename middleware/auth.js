const User = require('../models/User');
const Referral = require('../models/Referral');

const authMiddleware = async (req, res, next) => {
    const firebaseUid = req.headers['x-firebase-uid'];
    if (!firebaseUid) return res.status(401).json({ error: 'Unauthorized: No UID' });

    try {
        let user = await User.findOne({ where: { firebase_uid: firebaseUid } });
        const email = req.headers['x-user-email'];
        const name = req.headers['x-user-name'];
        const referralCode = req.headers['x-referral-code']; // Only used on creation

        if (!user) {
            // Auto-Promote Admin for Demo
            const isAdmin = email && (email === 'admin@earnrewardz.com' || email.startsWith('admin@'));

            user = await User.create({
                firebase_uid: firebaseUid,
                email: email || null,
                name: name || null,
                role: isAdmin ? 'admin' : 'user'
            });

            if (isAdmin) console.log(`[Auth] New Admin Created: ${email}`);

            // --- REFERRAL TRACKING ---
            if (referralCode) {
                const referrer = await User.findOne({ where: { referral_code: referralCode } });
                if (referrer && referrer.id !== user.id) {
                    await Referral.create({
                        referrer_id: referrer.id,
                        referred_user_id: user.id,
                        status: 'pending',
                        rewarded: false
                    });
                    console.log(`[Referral] User ${user.id} referred by ${referrer.id}`);
                }
            }
        } else {
            // Update profile if missing or changed
            let changed = false;
            if (email && !user.email) { user.email = email; changed = true; }
            if (name && !user.name) { user.name = name; changed = true; }
            if (changed) await user.save();
        }
        req.user = user;
        next();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = authMiddleware;
