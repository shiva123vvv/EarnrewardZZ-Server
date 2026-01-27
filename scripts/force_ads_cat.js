const db = require('../utils/db');
const Platform = require('../models/Platform');

async function fixCategories() {
    try {
        await db.authenticate();

        const networks = [
            'Adsterra',
            'PropellerAds',
            'Monetag',
            'HilltopAds',
            'AdMaven'
        ];

        console.log("Updating categories to 'ads'...");

        for (const name of networks) {
            const platform = await Platform.findOne({ where: { name } });
            if (platform) {
                platform.category = 'ads';
                platform.status = 'enabled'; // Ensure enabled
                // Reset notes to be sure? User provided specific notes.
                if (name === 'Adsterra') platform.notes = 'Rewarded video + interstitial (very good global fill)';
                if (name === 'PropellerAds') platform.notes = 'OnClick + rewarded formats';
                if (name === 'Monetag') platform.notes = 'Rewarded + in-page push';
                if (name === 'HilltopAds') platform.notes = 'Backup rewarded/interstitial';
                if (name === 'AdMaven') platform.notes = 'Good as fallback';

                await platform.save();
                console.log(`Updated ${name} to category 'ads'`);
            } else {
                console.log(`Warning: ${name} not found to update!`);
                // Create it if missing (Just in case, though verify_cat found Adsterra)
                await Platform.create({
                    name: name,
                    category: 'ads',
                    status: 'enabled',
                    priority: 10,
                    config: { zoneId: "", url: "" },
                    notes: name === 'Adsterra' ? 'Rewarded video + interstitial (very good global fill)' : 'Fallback ad network'
                });
                console.log(`Created ${name} as 'ads'`);
            }
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

fixCategories();
