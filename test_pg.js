require('dotenv').config();
console.log("DB_URL:", process.env.DATABASE_URL); // Debug print

const { Sequelize } = require('sequelize');

if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL is missing!");
    process.exit(1);
}

try {
    const sequelize = new Sequelize(process.env.DATABASE_URL, {
        dialect: 'postgres',
        logging: false
    });

    sequelize.authenticate()
        .then(() => console.log('✅ Connected'))
        .catch(err => console.log('❌ Error:', err.message));
} catch (e) {
    console.log("Init Error:", e);
}
