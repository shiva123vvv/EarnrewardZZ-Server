const { pool } = require('../config/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const JWT_SECRET = process.env.JWT_SECRET || 'earnrewards_premium_security_2024_!@#';

// Create Transporter (Single Instance)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
    }
});

// OTP Request
exports.requestOTP = async (req, res) => {
    const { email, phoneNumber, isSignup } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email required" });

    try {
        const client = await pool.connect();

        // Check User Existence
        const userCheck = await client.query("SELECT id FROM users WHERE email = $1", [email]);

        if (isSignup && userCheck.rows.length > 0) {
            client.release();
            return res.status(400).json({ success: false, message: "Email already registered" });
        }
        if (!isSignup && userCheck.rows.length === 0) {
            client.release();
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpHash = await bcrypt.hash(otp, 10);
        const expiry = Date.now() + 5 * 60 * 1000;

        await client.query(`
            INSERT INTO otps (email, otp_hash, expiry, phone_number, is_signup)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (email) DO UPDATE SET otp_hash = $2, expiry = $3, phone_number = $4, is_signup = $5
        `, [email, otpHash, expiry, phoneNumber, !!isSignup]);

        client.release();

        // Send Email (Real)
        const mailOptions = {
            from: process.env.GMAIL_USER,
            to: email,
            subject: 'Your Login Validation Code',
            text: `Your validation code is: ${otp}. It is valid for 5 minutes. Do not share this code.`
        };

        try {
            await transporter.sendMail(mailOptions);
            console.log(`📩 Email sent to ${email}`);
        } catch (emailErr) {
            console.error("❌ Failed to send email:", emailErr);
            // Don't fail the request, just log it. The user might still receive it if intermittent.
            // Or return error if strict.
        }

        // OTP Logging removed for security
        if (process.env.NODE_ENV === 'development') {
            console.log(`(Dev Log) OTP for ${email}: ${otp}`);
        }

        res.json({ success: true, message: "OTP sent" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "OTP Error" });
    }
};

// Verify & Login
exports.verifyOTP = async (req, res) => {
    const { email, otp } = req.body;

    try {
        const client = await pool.connect();
        const otpRes = await client.query("SELECT * FROM otps WHERE email = $1", [email]);

        if (otpRes.rows.length === 0) {
            client.release();
            return res.status(400).json({ success: false, message: "Invalid request" });
        }

        const record = otpRes.rows[0];
        if (Date.now() > parseInt(record.expiry)) {
            client.release();
            return res.status(400).json({ success: false, message: "Expired" });
        }

        const valid = await bcrypt.compare(otp, record.otp_hash);
        if (!valid) {
            client.release();
            return res.status(400).json({ success: false, message: "Invalid code" });
        }

        await client.query("DELETE FROM otps WHERE email = $1", [email]);

        // Create/Get User
        let user;
        const uCheck = await client.query("SELECT * FROM users WHERE email = $1", [email]);

        if (uCheck.rows.length === 0) {
            // New User
            const username = email.split('@')[0] + Math.floor(Math.random() * 10000);
            const dummyPass = await bcrypt.hash('otp_login_' + Date.now(), 10);
            const myReferralCode = email.split('@')[0] + Math.floor(1000 + Math.random() * 9000); // Simple unique code

            // Check if Referred
            let referrerId = null;
            let referredByCode = null;
            const inputReferralCode = req.body.referralCode;

            if (inputReferralCode) {
                const refCheck = await client.query("SELECT id, referral_code FROM users WHERE referral_code = $1", [inputReferralCode]);
                if (refCheck.rows.length > 0) {
                    referrerId = refCheck.rows[0].id;
                    referredByCode = refCheck.rows[0].referral_code;
                }
            }

            try {
                // Insert User with Referral Info
                const newU = await client.query(`
                    INSERT INTO users (email, phone_number, username, password, phone_locked, referral_code, referred_by, is_referred) 
                    VALUES ($1, $2, $3, $4, false, $5, $6, $7) 
                    RETURNING *
                `, [email, record.phone_number, username, dummyPass, myReferralCode, referredByCode, !!referrerId]);
                user = newU.rows[0];
            } catch (insertErr) {
                console.error("❌ User Insert Failed - Trying minimal fallback:", insertErr.message);
                const newU = await client.query(`
                    INSERT INTO users (email, phone_number, referral_code) 
                    VALUES ($1, $2, $3) 
                    RETURNING *
                `, [email, record.phone_number, myReferralCode]);
                user = newU.rows[0];
            }

            // Initialize Wallets
            await client.query("INSERT INTO coin_wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING", [user.id]);
            await client.query("INSERT INTO token_wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING", [user.id]);

            // Process Referral Rewards (if applicable)
            if (referrerId && user) {
                try {
                    // 1. Link in Referrals Table
                    await client.query("INSERT INTO referrals (referrer_user_id, referred_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [referrerId, user.id]);

                    // 2. Award Referrer (500 Tokens)
                    await client.query("UPDATE token_wallets SET balance = balance + 500, lifetime = lifetime + 500 WHERE user_id = $1", [referrerId]);
                    await client.query("INSERT INTO token_earnings (user_id, source, amount) VALUES ($1, 'Referral Bonus', 500)", [referrerId]);

                    // 3. Award Referee (250 Tokens)
                    await client.query("UPDATE token_wallets SET balance = balance + 250, lifetime = lifetime + 250 WHERE user_id = $1", [user.id]);
                    await client.query("INSERT INTO token_earnings (user_id, source, amount) VALUES ($1, 'Signup Bonus (Referred)', 250)", [user.id]);

                    console.log(`🎁 Referral Success: User ${user.id} referred by ${referrerId}`);
                } catch (refErr) {
                    console.error("❌ Referral Reward Failed:", refErr);
                }
            }
        } else {
            user = uCheck.rows[0];
            // Ensure wallets exist (migration/failsafe)
            await client.query("INSERT INTO coin_wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING", [user.id]);
            await client.query("INSERT INTO token_wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING", [user.id]);
        }

        client.release();

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ success: true, token, user });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Login failed" });
    }
};

// Middleware
exports.authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: "Expired" });
        req.user = user;
        next();
    });
};

exports.getProfile = async (req, res) => {
    try {
        const client = await pool.connect();
        const user = await client.query("SELECT * FROM users WHERE id = $1", [req.user.id]);
        client.release();
        if (user.rows.length === 0) return res.status(404).json({ success: false });
        res.json({ success: true, user: user.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};

exports.getReferralCode = async (req, res) => {
    try {
        const client = await pool.connect();
        const user = await client.query("SELECT * FROM users WHERE id = $1", [req.user.id]);
        client.release();
        if (user.rows.length === 0) return res.status(404).json({ success: false });

        // Prioritize explicit referral_code column
        const u = user.rows[0];
        const code = u.referral_code || u.username || u.email.split('@')[0];

        res.json({ success: true, code });
    } catch (err) {
        console.error("Referral Code Error:", err);
        res.status(500).json({ success: false, message: "Failed to get code" });
    }
};
