const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');

const passwords = ['', 'postgres', 'root', 'password', '123456', 'admin'];
const dbName = 'earn_rewardz';
const user = 'postgres';
const host = 'localhost';
const port = '5432';

async function check() {
    console.log("Checking PostgreSQL credentials...");

    for (const pass of passwords) {
        const url = `postgresql://${user}:${pass}@${host}:${port}/postgres`; // Connect to default db first
        console.log(`Trying password: '${pass}' ...`);

        const sequelize = new Sequelize(url, {
            dialect: 'postgres',
            logging: false
        });

        try {
            await sequelize.authenticate();
            console.log(`SUCCESS! Found working password: '${pass}'`);

            // Generate new .env content
            const finalUrl = `postgresql://${user}:${pass}@${host}:${port}/${dbName}`;
            const envContent = `DATABASE_URL=${finalUrl}\nPORT=5000\n`;

            fs.writeFileSync(path.join(__dirname, '.env'), envContent);
            console.log("Updated .env file successfully.");

            await sequelize.close();
            process.exit(0);
        } catch (err) {
            // console.log(`Failed: ${err.message}`);
            await sequelize.close();
        }
    }

    console.error("COULD NOT GUESS SQL PASSWORD. Please update .env manually.");
    process.exit(1);
}

check();
