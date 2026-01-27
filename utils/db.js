const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// JSON DB Implementation
const DB_PATH = path.join(__dirname, '../../data');
const DB_FILE = path.join(DB_PATH, 'database.json');

class JsonCollection {
    constructor(name) {
        this.name = name;
        this._ensureDb();
    }
    _ensureDb() {
        if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH, { recursive: true });
        if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], dailyUsage: [], transactions: [] }, null, 2));
    }
    _read() { return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')); }
    _write(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }

    get all() { return this._read()[this.name] || []; }

    async findOne(query) {
        const items = this.all;
        return items.find(item => {
            const criteria = query.where || query;
            for (let key in criteria) if (item[key] !== criteria[key]) return false;
            return true;
        }) || null;
    }

    async findByPk(id) {
        // Handle both integer ID and string ID match
        return this.all.find(i => String(i.id) === String(id)) || null;
    }

    async create(data) {
        const fullDb = this._read();
        const items = fullDb[this.name] || [];
        const newItem = { id: Math.floor(Math.random() * 1000000), ...data, createdAt: new Date(), updatedAt: new Date() };
        items.push(newItem);
        fullDb[this.name] = items;
        this._write(fullDb);
        return this._wrap(newItem);
    }

    _wrap(item) {
        if (!item) return null;
        const self = this;
        return {
            ...item,
            save: async function () {
                const fullDb = self._read();
                const items = fullDb[self.name];
                const idx = items.findIndex(i => String(i.id) === String(this.id));
                if (idx !== -1) {
                    const { save, ...data } = this;
                    items[idx] = { ...items[idx], ...data, updatedAt: new Date() };
                    fullDb[self.name] = items;
                    self._write(fullDb);
                }
                return this;
            }
        };
    }
}

// Global state
let sequelizeInstance = null;
let isJsonMode = false;

// Initialize Sequelize
try {
    sequelizeInstance = new Sequelize(process.env.DATABASE_URL, {
        dialect: 'postgres',
        logging: false
    });
} catch (e) {
    console.error("Sequelize Init Error:", e);
    isJsonMode = true;
}

const db = {
    Sequelize: Sequelize,
    sequelize: sequelizeInstance,
    isJson: () => isJsonMode,  // Accessor
};

// Check Connection Function
db.checkConnection = async () => {
    try {
        if (!process.env.DATABASE_URL || isJsonMode) throw new Error("Skipping Postgres");
        await sequelizeInstance.authenticate();
        console.log("✅ PostgreSQL Connected.");
        isJsonMode = false;
    } catch (err) {
        console.error(`❌ Postgres Failed: ${err.message}. Switching to JSON File DB.`);
        isJsonMode = true;
    }
};

// Hybrid Model Creator
db.defineModel = (name, schema, opts) => {
    // Return a Proxy or a structure that delegates at runtime
    // OR simply return standard Sequelize model initially, 
    // but overwrite its methods if we switch to clean JSON mode.

    // Better: Return an object that implements the interface.

    const collectionName = name === 'DailyUsage' ? 'dailyUsage' :
        name === 'WalletTransaction' ? 'transactions' :
            name === 'Referral' ? 'referrals' :
                name === 'Platform' ? 'platforms' :
                    name === 'AdminLog' ? 'adminLogs' :
                        name === 'Giveaway' ? 'giveaways' :
                            name === 'GiveawayTicket' ? 'giveawayTickets' :
                                name === 'SystemSetting' ? 'settings' :
                                    name === 'Withdrawal' ? 'withdrawals' :
                                        name === 'PlatformStat' ? 'platformStats' :
                                            name === 'EarningsLog' ? 'earningsLogs' :
                                                name === 'RevenueLog' ? 'revenueLogs' :
                                                    name === 'Task' ? 'tasks' :
                                                        name === 'UserTask' ? 'userTasks' : 'users';
    const jsonCollection = new JsonCollection(collectionName);

    // Define Sequelize Model
    let sqlModel = null;
    try {
        if (!isJsonMode && sequelizeInstance) {
            sqlModel = sequelizeInstance.define(name, schema, opts);
        }
    } catch (e) { }

    return {
        // Proxy these calls check mode at runtime
        findOne: async (q) => isJsonMode ? jsonCollection.findOne(q) : sqlModel.findOne(q),
        findByPk: async (id) => isJsonMode ? jsonCollection.findByPk(id) : sqlModel.findByPk(id),
        create: async (d) => isJsonMode ? jsonCollection.create(d) : sqlModel.create(d),
        count: async (opts) => isJsonMode ? jsonCollection.all.length : sqlModel.count(opts),
        bulkCreate: async (d) => isJsonMode ? Promise.all(d.map(i => jsonCollection.create(i))) : sqlModel.bulkCreate(d),
        findAll: async (opts) => isJsonMode ? jsonCollection.all : sqlModel.findAll(opts),
        update: async (data, opts) => !isJsonMode ? sqlModel.update(data, opts) : 0, // Incomplete JSON impl
        destroy: async (opts) => !isJsonMode ? sqlModel.destroy(opts) : 0,

        // Associations (no-op for JSON)
        belongsTo: (other, opts) => { if (!isJsonMode && sqlModel) sqlModel.belongsTo(other._sqlModel || other, opts); },
        hasOne: (other, opts) => { if (!isJsonMode && sqlModel) sqlModel.hasOne(other._sqlModel || other, opts); },
        hasMany: (other, opts) => { if (!isJsonMode && sqlModel) sqlModel.hasMany(other._sqlModel || other, opts); },

        // Expose underlying model for sync
        _sqlModel: sqlModel,

        // Add sync method for seed scripts
        sync: async (opts) => !isJsonMode && sqlModel ? sqlModel.sync(opts) : Promise.resolve()
    };
};

// Add authenticate method
db.authenticate = async () => {
    if (isJsonMode) {
        console.log('✅ JSON File DB Mode');
        return Promise.resolve();
    }
    return sequelizeInstance.authenticate();
};

// Add close method
db.close = async () => {
    if (!isJsonMode && sequelizeInstance) {
        return sequelizeInstance.close();
    }
    return Promise.resolve();
};

module.exports = db;
