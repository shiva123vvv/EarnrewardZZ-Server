const LIMITS = {
    free: {
        incentive_tasks: 2,
        rewarded_ads: 20,
        surveys: 2,
        premium_cpa: 0,
        daily_earning_cap: 4,
    },
    pro: {
        incentive_tasks: 3,
        rewarded_ads: 35,
        surveys: 3,
        premium_cpa: 1,
        daily_earning_cap: 10,
    }
};

const PLAN_DETAILS = {
    pro: {
        price: 20,
        duration_days: 30
    }
};

module.exports = { LIMITS, PLAN_DETAILS };
