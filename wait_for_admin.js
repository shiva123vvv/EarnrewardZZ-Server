const db = require('./utils/db');
const User = require('./models/User');
require('dotenv').config();

const waitForAdmin = async () => {
    console.log("Waiting for user 'earnrewardzz@gmail.com' to sign up...");

    await db.checkConnection();

    // Poll every 3 seconds
    const interval = setInterval(async () => {
        try {
            const user = await User.findOne({ where: { email: 'earnrewardzz@gmail.com' } });

            if (user) {
                if (user.role === 'admin') {
                    console.log("User is already ADMIN. Stopping monitor.");
                    clearInterval(interval);
                    process.exit(0);
                } else {
                    console.log(`User found! Promoting ${user.email} to ADMIN...`);
                    user.role = 'admin';
                    user.plan_type = 'pro';
                    await user.save();
                    console.log("✅ Promotion Successful! Please refresh your dashboard.");
                    clearInterval(interval);
                    process.exit(0);
                }
            } else {
                process.stdout.write("."); // heartbeat
            }
        } catch (err) {
            console.error(err);
        }
    }, 3000);
};

waitForAdmin();
