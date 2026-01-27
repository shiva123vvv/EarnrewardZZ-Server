const db = require('./utils/db');
const Platform = require('./models/Platform');

const seedNewPlatforms = async () => {
    try {
        await db.checkConnection();
        console.log("Seeding New Platforms...");

        const newPlatforms = [
            {
                name: 'AdGem',
                category: 'tasks',
                status: 'disabled',
                config: {
                    platformType: 'offerwall',
                    integrationType: 'sdk',
                    rewardMultiplier: 1.0,
                    minPayout: 2.0
                },
                notes: 'New Offerwall Integration'
            },
            {
                name: 'Monlix',
                category: 'tasks',
                status: 'disabled',
                config: {
                    platformType: 'offerwall',
                    integrationType: 'api',
                    rewardMultiplier: 1.0,
                    minPayout: 1.0
                },
                notes: 'New Offerwall Integration'
            },
            {
                name: 'TimeWall',
                category: 'tasks', // Taking tasks as category
                status: 'disabled',
                config: {
                    platformType: 'offerwall',
                    integrationType: 'iframe',
                    rewardMultiplier: 0.9,
                    minPayout: 0.5
                },
                notes: 'Micro-task wall'
            },
            {
                name: 'WallAds',
                category: 'tasks',
                status: 'disabled',
                config: {
                    platformType: 'offerwall',
                    integrationType: 'api',
                    rewardMultiplier: 1.0,
                    minPayout: 2.5
                },
                notes: 'New Offerwall'
            },
            {
                name: 'Notik',
                category: 'cpm', // Push/Display
                status: 'disabled',
                config: {
                    platformType: 'push',
                    integrationType: 'push',
                    rewardMultiplier: 1.0,
                    minPayout: 5.0
                },
                notes: 'Push Notification Monetization'
            }
        ];

        for (const p of newPlatforms) {
            const exists = await Platform.findOne({ where: { name: p.name } });
            if (!exists) {
                await Platform.create(p);
                console.log(`Created: ${p.name}`);
            } else {
                console.log(`Skipped (Exists): ${p.name}`);
            }
        }

        console.log("Seeding Complete.");
        process.exit(0);
    } catch (err) {
        console.error("Seeding Error:", err);
        process.exit(1);
    }
};

seedNewPlatforms();
