const Platform = require('../models/Platform');
const Task = require('../models/Task');
const { canUserPerformTask } = require('./limitHandler');

/**
 * Priority-Based Auto-Fallback Handler
 * 
 * Logic:
 * 1. Fetch enabled providers for category, ordered by Priority ASC.
 * 2. Filter out providers blocked by Global/Platform limits.
 * 3. (Optional) Check content availability (e.g. valid tasks in DB).
 * 4. Return the first valid provider.
 * 
 * @param {number} userId - ID of the user
 * @param {string} category - ads | tasks | surveys | cpm | installs
 * @returns {Promise<{success: boolean, provider?: object, message?: string}>}
 */
const getBestProvider = async (userId, category) => {
    try {
        // 1. Fetch Candidates
        const platforms = await Platform.findAll({
            where: {
                category: category,
                status: 'enabled'
            },
            order: [['priority', 'ASC'], ['id', 'ASC']] // Fallback to ID if priorities equal
        });

        if (platforms.length === 0) {
            return { success: false, message: "NO_PROVIDERS_AVAILABLE" };
        }

        // 2. Iterate (Fallback Chain)
        for (const platform of platforms) {
            // A. Limit Check
            const permission = await canUserPerformTask(userId, platform.id);
            if (!permission.allowed) {
                console.log(`Fallback: Skipping ${platform.name} (Limit Reached: ${permission.reason})`);
                continue; // Skip to next priority
            }

            // B. Availability Check (Simulated "Fetch Ad/Task")
            // For CPA/Tasks, we can check if DB has tasks.
            if (category === 'tasks' || category === 'installs') {
                const taskCount = await Task.count({
                    where: {
                        provider: platform.name,
                        is_active: true,
                        type: category === 'tasks' ? 'task' : 'premium' // Mapping assumptions
                    }
                });

                // If strictly checking DB availability:
                // if (taskCount === 0) continue; 
                // However, user might want to redirect to provider anyway. 
                // Let's assume strict check if requested "if one provider has no ads... user sees nothing".
                // We'll skip empty providers for tasks.
                if (taskCount === 0 && (category === 'tasks' || category === 'installs')) {
                    console.log(`Fallback: Skipping ${platform.name} (No Tasks Inventory)`);
                    continue;
                }
            }

            // C. Success - Found usable provider
            return {
                success: true,
                provider: {
                    id: platform.id,
                    name: platform.name,
                    config: platform.config,
                    priority: platform.priority,
                    max_earn: platform.max_earn
                }
            };
        }

        // 3. Fallback Failed (All candidates exhausted)
        return { success: false, message: "NO_PROVIDERS_AVAILABLE_AFTER_FALLBACK" };

    } catch (err) {
        console.error("Fallback Handler Error:", err);
        return { success: false, message: "SYSTEM_ERROR" };
    }
};

module.exports = { getBestProvider };
