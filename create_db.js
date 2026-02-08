const { Client } = require('pg');
require('dotenv').config();

const dbName = 'earn_rewardz';
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432';

// Parse base connection string (remove db name if present to connect to default)
// For simplicity, assuming standard format or just connecting to 'postgres' db to create new one.
// Actually, let's just try to connect to the postgres database to create the new one.
const baseConnectionString = connectionString.replace(`/${dbName}`, '/postgres');

const client = new Client({
    connectionString: baseConnectionString,
});

async function createDb() {
    try {
        await client.connect();
        const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = '${dbName}'`);
        if (res.rowCount === 0) {
            console.log(`Database ${dbName} not found. Creating...`);
            await client.query(`CREATE DATABASE "${dbName}"`);
            console.log(`Database ${dbName} created successfully.`);
        } else {
            console.log(`Database ${dbName} already exists.`);
        }
    } catch (err) {
        // If we can't connect to 'postgres' db, maybe we are already in the target db or user has differnet setup
        console.error('Error checking/creating database:', err.message);
    } finally {
        await client.end();
    }
}

createDb();
