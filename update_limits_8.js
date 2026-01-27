const db = require('./utils/db');
const GlobalLimit = require('./models/GlobalLimit');

const updateLimits = async () => {
    try {
        await db.checkConnection();
        // Force update the single row
        const limit = await GlobalLimit.findOne();
        if (limit) {
            limit.limit_tasks_free = 8;
            limit.limit_tasks_paid = 8;
            await limit.save();
            console.log("Updated Global Limits for Tasks: Free=8, Pro=8");
        } else {
            console.log("No GlobalLimit row found, creating one...");
            await GlobalLimit.create({
                limit_tasks_free: 8,
                limit_tasks_paid: 8
            });
        }
    } catch (err) {
        console.error("Error updating limits:", err);
    }
};

updateLimits();
