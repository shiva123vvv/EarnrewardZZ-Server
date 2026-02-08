const db = require('./utils/db');
require('dotenv').config();

const fixSchema = async () => {
    try {
        await db.checkConnection();
        // Since we are using Sequelize, we can force a more aggressive sync if needed,
        // OR we can manually add the column via raw query if Sequelize sync is being stubborn.

        console.log("Attempting to add missing 'email' column...");

        // Raw query for Postgres
        try {
            await db.sequelize.query('ALTER TABLE "Users" ADD COLUMN "email" VARCHAR(255);');
            console.log("Column 'email' added successfully via raw query.");
        } catch (e) {
            console.log("Raw query might have failed (maybe column exists?):", e.message);
        }

        try {
            await db.sequelize.query('ALTER TABLE "Users" ADD COLUMN "role" VARCHAR(255) DEFAULT \'user\';');
            console.log("Column 'role' added successfully via raw query.");
        } catch (e) {
            console.log("Raw query role might have failed:", e.message);
        }

        try {
            await db.sequelize.query('ALTER TABLE "Users" ADD COLUMN "status" VARCHAR(255) DEFAULT \'active\';');
            console.log("Column 'status' added successfully via raw query.");
        } catch (e) {
            console.log("Raw query status might have failed:", e.message);
        }

    } catch (err) {
        console.error("Fix Schema Error:", err);
    }
    process.exit();
};

fixSchema();
