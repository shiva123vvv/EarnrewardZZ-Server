require('dotenv').config();
const Platform = require('./models/Platform');
const db = require('./utils/db');

async function seedCPAGrip() {
    try {
        await db.authenticate();
        console.log('✅ Database connected');

        // Sync the model to ensure table exists
        await Platform.sync();

        // Check if CPAGrip already exists
        const existing = await Platform.findOne({ where: { name: 'CPAGrip' } });

        if (existing) {
            console.log('⚠️  CPAGrip platform already exists. Updating...');
            await existing.update({
                category: 'tasks',
                status: 'enabled',
                priority: 1,
                max_earn: 10.00,
                notes: 'CPAGrip Offerwall - External iframe integration',
                config: {
                    type: 'external_iframe',
                    script_id: '1870790',
                    script_url: 'https://ridefiles.net/script_include.php?id=1870790',
                    route: 'cpagrip'
                }
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
                config: {
                    type: 'external_iframe',
                    script_id: '1870790',
                    script_url: 'https://ridefiles.net/script_include.php?id=1870790',
                    route: 'cpagrip'
                }
            });
            console.log('✅ CPAGrip platform created successfully');
        }

        await db.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding CPAGrip:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

seedCPAGrip();
