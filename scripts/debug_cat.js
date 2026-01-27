const db = require('../utils/db');
const Platform = require('../models/Platform');

async function checkOfferToro() {
    try {
        await db.authenticate();
        const p = await Platform.findOne({ where: { name: 'OfferToro' } });
        if (p) {
            console.log(`OfferToro Category: ${p.category}`);
        } else {
            console.log('OfferToro not found');
        }

        const adsterra = await Platform.findOne({ where: { name: 'Adsterra' } });
        if (adsterra) {
            console.log(`Adsterra Category: ${adsterra.category}`);
        } else {
            console.log('Adsterra not found (Check insert!)');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

checkOfferToro();
