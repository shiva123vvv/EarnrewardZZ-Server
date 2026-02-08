const jwt = require('jsonwebtoken');

// Simple admin login with email/password
exports.adminLogin = async (req, res) => {
    try {
        const email = req.body.email?.trim().toLowerCase();
        const password = req.body.password?.trim();

        // Check admin credentials from environment variables
        const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'earnrewardzz@gmail.com').trim().toLowerCase();
        const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || 'admin123').trim();
        const JWT_SECRET = process.env.JWT_SECRET || 'earnrewards_premium_security_2024_!@#';

        console.log('🔐 Admin Login Attempt:');
        console.log('   Received:', { email, passwordLength: password?.length });
        console.log('   Expected:', { email: ADMIN_EMAIL, passwordLength: ADMIN_PASSWORD?.length });
        console.log('   Password Match:', password === ADMIN_PASSWORD);
        console.log('   Email Match:', email === ADMIN_EMAIL);

        if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
            // Generate JWT token
            const token = jwt.sign(
                {
                    email: ADMIN_EMAIL,
                    isAdmin: true,
                    id: 0 // Admin user ID
                },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            console.log('✅ Admin login successful');
            res.json({
                success: true,
                token,
                user: {
                    email: ADMIN_EMAIL,
                    isAdmin: true
                },
                message: 'Admin login successful'
            });
        } else {
            console.log('❌ Admin login failed - Invalid credentials');
            res.status(401).json({
                success: false,
                message: 'Invalid admin credentials'
            });
        }
    } catch (err) {
        console.error('Admin Login Error:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};
