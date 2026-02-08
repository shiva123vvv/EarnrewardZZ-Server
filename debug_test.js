const path = require('path');
console.log("Debug Script Started");

try {
    const EarningsLogPath = path.join(__dirname, 'models/EarningsLog.js');
    console.log("EarningsLog Path:", EarningsLogPath);

    const EarningsLog = require(EarningsLogPath);
    console.log("EarningsLog Model:", EarningsLog ? "DEFINED" : "UNDEFINED");

    if (EarningsLog) {
        console.log("EarningsLog Keys:", Object.keys(EarningsLog));
    }

    const userService = require('./services/userService');
    console.log("UserService loaded successfully");

} catch (err) {
    console.error("CRITICAL IMPORT ERROR:", err);
}
