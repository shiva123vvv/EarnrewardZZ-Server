const db = require('./utils/db');
const User = require('./models/User');
require('dotenv').config();

const promote = async () => {
    try {
        await db.checkConnection();

        const targetEmail = 'earnrewardzz@gmail.com';

        // We might not have the firebase_uid if the user just signed up and hasn't hit our API yet.
        // But usually auth middleware creates them. 
        // We can search by email if we stored it?
        // My User model has 'email'.

        let user = await User.findOne({ where: { email: targetEmail } });

        // If searching by email fails (maybe email not synced yet?), try to search by a known UID if provided
        // or just list all users to see.

        if (!user) {
            console.log(`User with email ${targetEmail} not found in SQL DB.`);
            console.log("Please SIGN UP in the app first, then refresh the dashboard so the backend creates the user record.");

            // Fallback: list recent users
            const recent = await User.findAll({ limit: 5, order: [['createdAt', 'DESC']] });
            console.log("Recent users found:", recent.map(u => u.email || u.firebase_uid));
        } else {
            console.log(`User found: ${user.email} (${user.firebase_uid})`);
            console.log(`Current Role: ${user.role}`);

            user.role = 'admin';
            user.plan_type = 'pro';
            await user.save();

            console.log(`SUCCESS! ${targetEmail} is now an ADMIN.`);
        }
    } catch (err) {
        console.error(err);
    }
    process.exit();
};

promote();
