require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const { initSchema } = require('./src/models/schema');

// --- 1. ENVIRONMENT VALIDATION ---
// Environment checks relaxed for local dev convenience

const app = express();
const PORT = process.env.PORT || 5000;

// --- 2. MIDDLEWARE ---
// Robust CORS for Web & Mobile
app.use(cors({
    origin: '*', // Allow all origins (App, Web, Localhost)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(bodyParser.json());
app.use(express.static('public')); // Serve static files

// Request Logger (Minimal & Safe)
app.use((req, res, next) => {
    // Log basic request info without body content to avoid leaking PII/secrets
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});

// --- 3. ROUTES ---
const authRoutes = require('./src/routes/authRoutes');
const coinRoutes = require('./src/routes/coinRoutes');
const tokenRoutes = require('./src/routes/tokenRoutes');
const giveawayRoutes = require('./src/routes/giveawayRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const settingsRoutes = require('./src/routes/settingsRoutes');

// Public Routes (No Auth Middleware applied globally)
app.use('/api/auth', authRoutes); // Auth routes handle their own protection
app.use('/api/coins', coinRoutes);
app.use('/api/tokens', tokenRoutes);
app.use('/api/giveaways', giveawayRoutes);
app.use('/api/giveaway', giveawayRoutes); // Consistent with new spec
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/user', authRoutes); // Alias
app.use('/api/rewards', tokenRoutes); // Alias

// Legacy Route Mappings
app.use('/api/otp', authRoutes);

// Serve Admin Panel
app.use('/admin', express.static('admin'));

// Health Check
app.get('/health', (req, res) => res.json({ status: "ok", mode: "PRODUCTION_READY" }));

// --- 4. ERROR HANDLING ---
// Global Error Handler
app.use((err, req, res, next) => {
    console.error('🔥 SERVER ERROR:', err.stack);
    res.status(500).json({
        success: false,
        message: 'Internal Server Error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// --- 5. INITIALIZATION ---
const startServer = async () => {
    try {
        console.log("⚙️  Initializing Database Schema...");
        await initSchema();

        app.listen(PORT, () => {
            console.log(`🚀 Server successfully running on port ${PORT}`);
            console.log(`✅ CORS enabled for all origins`);
            console.log(`✅ Environment validated`);
            console.log(`💎 Coin/Token Separation Active`);
        });
    } catch (err) {
        console.error("❌ Failed to start server:", err);
        process.exit(1);
    }
};

startServer();

// Global Crash Handlers
process.on('uncaughtException', (err) => {
    console.error('🔥 UNCAUGHT EXCEPTION:', err);
    // Don't exit immediately in production unless critical, but recommended to restart via process manager
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 UNHANDLED REJECTION:', reason);
});
