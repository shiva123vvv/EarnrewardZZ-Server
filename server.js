const express = require('express');
const cors = require('cors');
const db = require('./utils/db');
require('dotenv').config();

// Initialize Models
const User = require('./models/User');
const DailyUsage = require('./models/DailyUsage');
const WalletTransaction = require('./models/WalletTransaction');
const Platform = require('./models/Platform');
const AdminLog = require('./models/AdminLog');
const Referral = require('./models/Referral');
const Withdrawal = require('./models/Withdrawal');
const SystemSetting = require('./models/SystemSetting');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-firebase-uid', 'x-user-email', 'x-user-name', 'x-referral-code']
}));
app.use(express.json());

// Routes
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin'); // New

// Health Check (Public)
app.get('/health', (req, res) => res.status(200).send('OK'));

app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes); // Mount admin routes

// --- Database Sync & Seed ---
const syncAndSeed = async () => {
    try {
        await db.checkConnection();
        // Sync models (Using alter: true to safe-update schemas with new columns like 'role')
        if (!db.isJson()) {
            await db.sequelize.sync({ alter: true });
            console.log("DB Synced (Schema Altered)");
        }

        // Seed Platforms if they don't exist
        const count = await Platform.count();
        if (count === 0 && !db.isJson()) {
            console.log("Seeding Platforms...");
            const platforms = [
                { name: 'CPAGrip', category: 'ads', status: 'enabled', allowed_users: 'all' },
                { name: 'AdGate Media', category: 'tasks', status: 'enabled', allowed_users: 'all' },
                { name: 'OfferToro', category: 'installs', status: 'enabled', allowed_users: 'all' },
                { name: 'Adsterra', category: 'cpm', status: 'enabled', allowed_users: 'all' },
                { name: 'Pollfish', category: 'surveys', status: 'enabled', allowed_users: 'all' },
                { name: 'BitLabs', category: 'surveys', status: 'disabled', allowed_users: 'pro' }, // Premium only
                { name: 'OGAds', category: 'installs', status: 'enabled', allowed_users: 'all' }
            ];
            await Platform.bulkCreate(platforms);
        }

    } catch (err) {
        console.error("Sync/Seed Error:", err);
    }
};

app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    // Trigger Restart: Timestamp 1706400000
    await syncAndSeed();
});
