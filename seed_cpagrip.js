require('dotenv').config();
const Platform = require('./models/Platform');
const db = require('./utils/db');

async function seedCPAGrip() {
    try {
        await db.authenticate();
        console.log('✅ Database connected');

        // Sync the model to ensure table exists
        await Platform.sync();

        // 1. Update/Create CPAGrip (The "now available thing") -> Limit 12
        const cpaGrip = await Platform.findOne({ where: { name: 'CPAGrip' } });
        const cpaConfig = {
            type: 'external_iframe',
            script_id: '1870790',
            script_url: 'https://ridefiles.net/script_include.php?id=1870790',
            route: 'cpagrip',
            free_limit: 12, // User requested limit 12
            paid_limit: 12
        };

        if (cpaGrip) {
            console.log('⚠️  CPAGrip platform already exists. Updating...');
            await cpaGrip.update({
                category: 'tasks',
                status: 'enabled',
                priority: 1,
                max_earn: 10.00,
                notes: 'CPAGrip Offerwall - External iframe integration',
                config: cpaConfig
            });
            console.log('✅ CPAGrip platform updated successfully');
        } else {
            await Platform.create({
                name: 'CPAGrip',
                category: 'tasks',
                status: 'enabled',
                priority: 1,
                max_earn: 10.00,
                notes: 'CPAGrip Offerwall - External iframe integration',
                config: cpaConfig
            });
            console.log('✅ CPAGrip platform created successfully');
        }

        // 2. Create "Unity Ads" (The "one more same like that") -> Limit 8, Code 6034363
        const unityAds = await Platform.findOne({ where: { name: 'Unity Ads' } });
        const unityConfig = {
            type: 'unity_sdk', // implied type
            game_id: '6034363',
            free_limit: 8,
            paid_limit: 8
        };

        if (unityAds) {
            console.log('⚠️  Unity Ads platform already exists. Updating...');
            await unityAds.update({
                category: 'tasks', // "Same like that" (CPAGrip is tasks)
                status: 'enabled',
                priority: 2,
                max_earn: 5.00, // Reasonable default
                notes: 'Unity Ads - Mobile SDK Integration',
                config: unityConfig
            });
            console.log('✅ Unity Ads platform updated successfully');
        } else {
            await Platform.create({
                name: 'Unity Ads',
                category: 'tasks', // "Same like that"
                status: 'enabled',
                priority: 2,
                max_earn: 5.00,
                notes: 'Unity Ads - Mobile SDK Integration',
                config: unityConfig
            });
            console.log('✅ Unity Ads platform created successfully');
        }

        await db.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding platforms:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

seedCPAGrip();
