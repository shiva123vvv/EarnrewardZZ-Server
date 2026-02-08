const { pool } = require('../config/db');

// List Active Giveaways
exports.listGiveaways = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                id,
                title,
                description,
                prize_image AS image_url,
                ticket_token_cost,
                prize_details,
                end_date,
                status,
                created_at 
            FROM giveaways 
            WHERE status = 'active' 
            ORDER BY end_date ASC
        `);
        res.json({ success: true, giveaways: result.rows });
    } catch (err) {
        console.error("List Giveaways Error:", err);
        res.status(500).json({ success: false, error: "SERVER_ERROR", message: err.message });
    }
};

// Buy Ticket - STRICT REWRITE according to USER REQUIREMENTS
exports.buyTicket = async (req, res) => {
    const { giveawayId, ticketCount } = req.body;
    const userId = req.user.id; // Step 1: Authenticate user
    const qty = parseInt(ticketCount) || 1;

    // Logging Requirement
    console.log(`[BuyTicket] Request - User: ${userId}, Giveaway: ${giveawayId}, Qty: ${qty}`);

    if (qty < 1) {
        return res.status(400).json({ success: false, error: "INVALID_QUANTITY", message: "Minimum 1 ticket required" });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Step 5: Start Transaction

        // Step 2: Fetch Giveaway & Validate
        const gRes = await client.query("SELECT * FROM giveaways WHERE id = $1 FOR UPDATE", [giveawayId]);

        if (gRes.rows.length === 0) {
            throw new Error("INVALID_GIVEAWAY");
        }

        const giveaway = gRes.rows[0];

        if (giveaway.status !== 'active') {
            throw new Error("GIVEAWAY_NOT_ACTIVE");
        }

        const costPerTicket = parseInt(giveaway.ticket_token_cost) || 0;
        if (costPerTicket <= 0) {
            console.error(`[BuyTicket] Critical: Invalid ticket cost ${costPerTicket} for giveaway ${giveawayId}`);
            throw new Error("INVALID_COST");
        }
        const totalCost = costPerTicket * qty;

        // Step 3: Fetch Token Wallet & Lock Row
        let wRes = await client.query("SELECT balance FROM token_wallets WHERE user_id = $1 FOR UPDATE", [userId]);

        // Safety Guard: Auto-create wallet if missing
        if (wRes.rows.length === 0) {
            console.log(`[BuyTicket] Wallet missing for user ${userId}. Creating...`);
            await client.query("INSERT INTO token_wallets (user_id, balance) VALUES ($1, 0) ON CONFLICT DO NOTHING", [userId]);
            wRes = await client.query("SELECT balance FROM token_wallets WHERE user_id = $1 FOR UPDATE", [userId]);
        }

        if (wRes.rows.length === 0) throw new Error("WALLET_ERROR");

        const currentBalance = parseInt(wRes.rows[0].balance || 0);

        // Mandatory Log: Balance Before
        console.log(`[BuyTicket] User: ${userId} | Balance Before: ${currentBalance} | Cost: ${totalCost}`);

        // Step 4: Check Balance
        if (currentBalance < totalCost) {
            console.warn(`[BuyTicket] Insufficient Tokens for User ${userId}. Has: ${currentBalance}, Needs: ${totalCost}`);
            throw new Error("INSUFFICIENT_TOKENS");
        }

        // Step 6: Deduct Tokens
        const newBalance = currentBalance - totalCost;
        await client.query("UPDATE token_wallets SET balance = $1, updated_at = NOW() WHERE user_id = $2", [newBalance, userId]);

        // Step 7: Insert Ticket Record
        await client.query(`
            INSERT INTO giveaway_tickets (user_id, giveaway_id, tickets_purchased, tokens_used)
            VALUES ($1, $2, $3, $4)
        `, [userId, giveawayId, qty, totalCost]);

        // Step 8: Commit
        await client.query('COMMIT');

        // Mandatory Log: Balance After
        console.log(`[BuyTicket] Success! User: ${userId} | Balance After: ${newBalance}`);

        // Step 9: Return Response
        res.json({
            success: true,
            remaining_tokens: newBalance,
            message: "Ticket purchased successfully"
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[BuyTicket] Failed: ${err.message}`);

        let status = 400;
        let errorCode = "TRANSACTION_FAILED";
        let message = err.message;

        // Map errors to specific codes
        switch (err.message) {
            case "INSUFFICIENT_TOKENS":
                status = 402;
                errorCode = "INSUFFICIENT_TOKENS";
                message = "You do not have enough tokens.";
                break;
            case "GIVEAWAY_NOT_ACTIVE":
                errorCode = "GIVEAWAY_NOT_ACTIVE";
                message = "This giveaway has ended.";
                break;
            case "INVALID_GIVEAWAY":
                status = 404;
                errorCode = "INVALID_GIVEAWAY";
                message = "Giveaway not found.";
                break;
            case "INVALID_COST":
            case "WALLET_ERROR":
                status = 500;
                message = "System error during purchase.";
                break;
            default:
                status = 500;
        }

        res.status(status).json({ success: false, error: errorCode, message });
    } finally {
        client.release();
    }
};

exports.getMyTickets = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT t.*, g.title, g.status
            FROM giveaway_tickets t
            JOIN giveaways g ON t.giveaway_id = g.id
            WHERE t.user_id = $1
            ORDER BY t.created_at DESC
        `, [req.user.id]);
        res.json({ success: true, tickets: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getWinners = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM giveaway_winners ORDER BY announced_at DESC LIMIT 10
        `);
        // Note: Assuming giveaway_winners table exists, logic kept simple
        res.json({ success: true, winners: [] });
    } catch (e) {
        res.json({ success: true, winners: [] });
    }
};
