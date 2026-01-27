const { DataTypes } = require('sequelize');
const db = require('../utils/db');

const schema = {
    key: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false
    },
    value: {
        type: DataTypes.TEXT, // Using TEXT to store JSON stringified data
        allowNull: false,
        get() {
            const rawValue = this.getDataValue('value');
            try {
                return JSON.parse(rawValue);
            } catch (e) {
                return rawValue;
            }
        },
        set(val) {
            this.setDataValue('value', JSON.stringify(val));
        }
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true
    }
};

const SystemSetting = db.defineModel('SystemSetting', schema, { timestamps: true });

module.exports = SystemSetting;
