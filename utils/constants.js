const LIMITS = {
    free: {
        incentive_tasks: 10,
        rewarded_ads: 8,
        surveys: 5,
        premium_cpa: 2,
        daily_earning_cap: 0.1,
    },
    pro: {
        incentive_tasks: 20,
        rewarded_ads: 16,
        surveys: 10,
        premium_cpa: 5,
        daily_earning_cap: 0.2,
    }
};

const PLAN_DETAILS = {
    pro: {
        price: 20,
        duration_days: 30
    }
};

module.exports = { LIMITS, PLAN_DETAILS };
