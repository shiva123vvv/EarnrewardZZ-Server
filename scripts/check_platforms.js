const db = require('../utils/db');
const Platform = require('../models/Platform');
const { Op } = require('sequelize');

async function listPlatforms() {
    try {
        await db.authenticate();

        const platforms = await Platform.findAll({
            where: {
                name: { [Op.iLike]: '%GPA%' } // Typo fix: user said "CPAgrip" but maybe typed wrong? Or just search all.
            }
        });

        // Let's just search specific names
        const cpa = await Platform.findAll({
            where: {
                name: { [Op.like]: '%CPA%' }
            }
        });

        console.log('--- CPA Platforms ---');
        cpa.forEach(p => {
            console.log(`ID: ${p.id} | Name: ${p.name} | Category: ${p.category} | Status: ${p.status} | Created: ${p.created_at}`);
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit();
    }
}

listPlatforms();
