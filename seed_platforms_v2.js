const db = require('./utils/db');
const Platform = require('./models/Platform');

const seedData = [
    // --- A) Ads (Rewarded / Video) ---
    { name: 'CPAGrip', category: 'ads', status: 'enabled', allowed_users: 'all', config: { free_limit: 20, paid_limit: 35 } },
    { name: 'AdGate Media', category: 'ads', status: 'enabled', allowed_users: 'all', config: { free_limit: 15, paid_limit: 30 } },
    { name: 'OfferToro', category: 'ads', status: 'enabled', allowed_users: 'all', config: { free_limit: 15, paid_limit: 30 } },
    { name: 'Lootably', category: 'ads', status: 'enabled', allowed_users: 'all', config: { free_limit: 10, paid_limit: 20 } },
    { name: 'Ayet Studios', category: 'ads', status: 'enabled', allowed_users: 'all', config: { free_limit: 10, paid_limit: 20 } },

    // --- B) Tasks (CPA / CPI) ---
    // --- B) Tasks (CPA / CPI) ---
    { name: 'CPAGrip', category: 'tasks', status: 'enabled', allowed_users: 'all', risk_level: 'medium', rotation_enabled: false, user_cap_free: 2.0, user_cap_paid: 4.0, config: { free_limit: 2, paid_limit: 3 } },
    { name: 'OGAds', category: 'tasks', status: 'enabled', allowed_users: 'pro', risk_level: 'high', rotation_enabled: false, cooldown_hours: 48, user_cap_free: 1.5, user_cap_paid: 3.0, config: { free_limit: 1, paid_limit: 2 } },
    { name: 'CPAlead', category: 'tasks', status: 'enabled', allowed_users: 'all', risk_level: 'low', rotation_enabled: false, user_cap_free: 2.0, user_cap_paid: 4.0, config: { free_limit: 2, paid_limit: 3 } },
    { name: 'Adscend Media', category: 'tasks', status: 'enabled', allowed_users: 'all', risk_level: 'medium', rotation_enabled: false, user_cap_free: 2.0, user_cap_paid: 4.0, config: { free_limit: 2, paid_limit: 3 } },
    { name: 'Lootably', category: 'tasks', status: 'enabled', allowed_users: 'all', risk_level: 'low', rotation_enabled: false, user_cap_free: 2.0, user_cap_paid: 4.0, config: { free_limit: 2, paid_limit: 3 } },
    { name: 'Ayet Studios', category: 'tasks', status: 'enabled', allowed_users: 'pro', risk_level: 'medium', rotation_enabled: false, user_cap_free: 2.0, user_cap_paid: 4.0, config: { free_limit: 2, paid_limit: 3 } },

    // --- C) Installs (CPI) ---
    { name: 'OfferToro', category: 'installs', status: 'enabled', allowed_users: 'all', config: { free_limit: 5, paid_limit: 10, cooldown_hours: 24, geo: ['US', 'UK', 'CA'], os: 'both' } },
    { name: 'OGAds', category: 'installs', status: 'enabled', allowed_users: 'pro', config: { free_limit: 2, paid_limit: 5, cooldown_hours: 48, geo: ['Global'], os: 'both' } },
    { name: 'Ayet Studios', category: 'installs', status: 'enabled', allowed_users: 'all', config: { free_limit: 5, paid_limit: 10, cooldown_hours: 24, geo: ['Global'], os: 'android' } },
    { name: 'Adscend Media', category: 'installs', status: 'enabled', allowed_users: 'all', config: { free_limit: 5, paid_limit: 10, cooldown_hours: 24, geo: ['Global'], os: 'both' } },

    // --- D) CPM / Display ---
    { name: 'Adsterra', category: 'cpm', status: 'enabled', allowed_users: 'all', config: { ad_type: 'banner', enabled_pages: ['dashboard', 'earn'], frequency_cap: 5 } },
    { name: 'PropellerAds', category: 'cpm', status: 'enabled', allowed_users: 'all', config: { ad_type: 'push', enabled_pages: ['all'], frequency_cap: 3 } },
    { name: 'Monetag', category: 'cpm', status: 'enabled', allowed_users: 'all', config: { ad_type: 'native', enabled_pages: ['earn'], frequency_cap: 10 } },
    { name: 'HilltopAds', category: 'cpm', status: 'disabled', allowed_users: 'all', config: { ad_type: 'banner', enabled_pages: ['dashboard'], frequency_cap: 0 } },
    { name: 'PopAds', category: 'cpm', status: 'disabled', allowed_users: 'all', config: { ad_type: 'popunder', enabled_pages: ['earn'], frequency_cap: 1 } },
    { name: 'RichAds', category: 'cpm', status: 'disabled', allowed_users: 'all', config: { ad_type: 'push', enabled_pages: ['all'], frequency_cap: 0 } },
    { name: 'AdMaven', category: 'cpm', status: 'disabled', allowed_users: 'all', config: { ad_type: 'popunder', enabled_pages: ['all'], frequency_cap: 0 } },

    // --- E) Surveys ---
    { name: 'Cint', category: 'surveys', status: 'enabled', allowed_users: 'pro', priority: 1, config: { free_limit: 2, paid_limit: 5, screen_out_reward: true } },
    { name: 'Pollfish', category: 'surveys', status: 'enabled', allowed_users: 'all', priority: 2, config: { free_limit: 2, paid_limit: 5, screen_out_reward: false } },
    { name: 'TapResearch', category: 'surveys', status: 'enabled', allowed_users: 'all', priority: 3, config: { free_limit: 2, paid_limit: 5, screen_out_reward: true } },
    { name: 'BitLabs', category: 'surveys', status: 'enabled', allowed_users: 'all', priority: 4, config: { free_limit: 2, paid_limit: 5, screen_out_reward: false } },
    { name: 'Dynata', category: 'surveys', status: 'disabled', allowed_users: 'pro', priority: 5, config: { free_limit: 2, paid_limit: 5, screen_out_reward: true } },
    { name: 'OpinionApp', category: 'surveys', status: 'disabled', allowed_users: 'all', priority: 6, config: { free_limit: 2, paid_limit: 5, screen_out_reward: false } },
];

const seed = async () => {
    try {
        await db.checkConnection();
        if (!db.isJson() && db.sequelize) {
            console.log("🔄 Syncing schema...");
            await db.sequelize.sync({ alter: true });
        } else {
            console.log("📂 Using JSON DB - Skipping schema sync.");
        }

        // Since we are changing the model structure largely (adding duplicates for categories), 
        // it might be cleaner to wipe and re-seed OR be very careful.
        // Given 'dev' environment, wiping is safest to ensure clean state matching the prompt.
        // CAUTION: This deletes existing platform configs.

        console.log("⚠️  Clearing existing platforms to ensure clean categorical split...");
        await Platform.destroy({ where: {}, truncate: true });

        console.log("🌱 Seeding new categorical platforms...");
        await Platform.bulkCreate(seedData);

        console.log("✅ Seed complete!");
    } catch (err) {
        console.error("Seed Error:", err);
    }
    process.exit();
};

seed();
