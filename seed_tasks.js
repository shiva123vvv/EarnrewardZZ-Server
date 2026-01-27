const Task = require('./models/Task');
const db = require('./utils/db');

// Tasks to seed
const tasks = [
    // --- ADS ---
    { title: "Watch Video: Game Trailer", provider: "CPAGrip", type: "ad", reward: 0.10, difficulty: "Easy", instructions: "Watch the full 30s trailer. Do not close tab." },
    { title: "Watch Video: Food App", provider: "AdGate", type: "ad", reward: 0.15, difficulty: "Easy", instructions: "Watch video and click learn more." },
    { title: "Visit Website: Tech News", provider: "CPAGrip", type: "ad", reward: 0.05, difficulty: "Easy", instructions: "Browse for 60 seconds." },

    // --- APPS ---
    { title: "Install TikTok", provider: "OfferToro", type: "task", reward: 1.50, difficulty: "Easy", instructions: "Install and Open the app. New users only." },
    { title: "Play Raid: Shadow Legends", provider: "OfferToro", type: "task", reward: 5.00, difficulty: "Hard", instructions: "Reach Level 10. Confirm email." },
    { title: "NordVPN Trial", provider: "CPAGrip", type: "task", reward: 8.00, difficulty: "Medium", instructions: "Start free trial. Credit card required (no charge)." },

    // --- SURVEYS ---
    { title: "Consumer Habits Survey", provider: "AdGate", type: "survey", reward: 2.50, difficulty: "Medium", instructions: "Complete all questions honestly." },
    { title: "Tech Preferences", provider: "AdGate", type: "survey", reward: 1.20, difficulty: "Easy", instructions: "Short 5-min survey." },

    // --- PREMIUM ---
    { title: "Crypto.com Deposit", provider: "Adsterra", type: "premium", reward: 25.00, difficulty: "Pro", instructions: "Deposit $10. Trade once." },
    { title: "Casino Sign Up", provider: "Adsterra", type: "premium", reward: 15.00, difficulty: "Pro", instructions: "Register and verify ID." }
];

const seedTasks = async () => {
    try {
        await db.checkConnection();
        const existing = await Task.findAll();
        if (existing.length === 0) {
            console.log("Seeding Tasks...");
            await Task.bulkCreate(tasks);
            console.log("Tasks Seeded!");
        } else {
            console.log("Tasks already exist.");
        }
    } catch (err) {
        console.error("Task Seeding Error:", err);
    }
};

seedTasks();
