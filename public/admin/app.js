// Configuration
const API_URL = 'https://earnrewardzz-server-1.onrender.com/api/admin';
const AUTH_URL = 'https://earnrewardzz-server-1.onrender.com/api/auth';
const REFRESH_INTERVAL = 10000; // 10 seconds

// State
let state = {
    token: localStorage.getItem('adminToken') || localStorage.getItem('userToken'),
    user: null,
    currentPage: 'dashboard',
    currentFilter: 'all',
    userPage: 1,
    searchQuery: '',
    charts: {},
    refreshIntervals: []
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupNavigation();
});


// Authentication
async function checkAuth() {
    if (!state.token) {
        await showLoginPrompt();
        return;
    }

    try {
        const res = await fetch(`${AUTH_URL}/me`, {
            headers: { 'Authorization': `Bearer ${state.token}` }
        });

        if (res.ok) {
            const data = await res.json();
            state.user = data.user;
            document.getElementById('adminEmail').textContent = data.user.email;
            updateStatus('online', 'Connected');
            loadDashboard();
        } else {
            console.error('Auth check failed:', res.status);
            localStorage.removeItem('adminToken');
            localStorage.removeItem('userToken');
            state.token = null;
            await showLoginPrompt();
        }
    } catch (err) {
        console.error('Auth error:', err);
        updateStatus('offline', 'Auth Error');
    }
}

async function showLoginPrompt() {
    // Create login modal
    const loginHTML = `
        <div id="loginModal" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000;">
            <div style="background: white; padding: 40px; border-radius: 15px; max-width: 400px; width: 90%;">
                <h2 style="margin: 0 0 20px 0; color: #667eea; text-align: center;">🔐 Admin Login</h2>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #475569;">Email:</label>
                    <input type="email" id="loginEmail" value="earnrewardzz@gmail.com" style="width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600; color: #475569;">Password:</label>
                    <input type="password" id="loginPassword" placeholder="Enter password" style="width: 100%; padding: 12px; border: 2px solid #e2e8f0; border-radius: 8px; font-size: 14px; box-sizing: border-box;">
                </div>
                <button onclick="doLogin()" style="width: 100%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; padding: 14px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 16px;">
                    Login to Admin Panel
                </button>
                <div id="loginError" style="margin-top: 15px; color: #ef4444; font-size: 14px; text-align: center;"></div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', loginHTML);

    // Focus password field
    setTimeout(() => {
        document.getElementById('loginPassword').focus();
    }, 100);

    // Allow Enter key to submit
    document.getElementById('loginPassword').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') doLogin();
    });
    document.getElementById('loginEmail').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('loginPassword').focus();
    });
}

async function doLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const errorDiv = document.getElementById('loginError');

    if (!email || !password) {
        errorDiv.textContent = '⚠️ Please enter email and password';
        return;
    }

    try {
        updateStatus('loading', 'Logging in...');
        errorDiv.textContent = '⏳ Authenticating...';

        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (data.success && data.token) {
            state.token = data.token;
            localStorage.setItem('adminToken', data.token);
            localStorage.setItem('userToken', data.token);
            state.user = data.user;

            // Remove login modal
            const modal = document.getElementById('loginModal');
            if (modal) modal.remove();

            document.getElementById('adminEmail').textContent = data.user.email;
            updateStatus('online', 'Connected');
            loadDashboard();
        } else {
            errorDiv.textContent = '❌ ' + (data.message || 'Invalid credentials');
            updateStatus('offline', 'Login Failed');
        }
    } catch (err) {
        errorDiv.textContent = '❌ Login error: ' + err.message;
        updateStatus('offline', 'Login Failed');
    }
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('adminToken');
        localStorage.removeItem('userToken');
        location.reload();
    }
}

// Navigation
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            switchPage(page);

            // Auto-close sidebar on mobile
            if (window.innerWidth <= 1024) {
                toggleSidebar();
            }
        });

    });
}

function switchPage(page) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    document.querySelectorAll('.page').forEach(p => {
        p.classList.toggle('active', p.id === `${page}-page`);
    });

    const titles = {
        dashboard: 'Dashboard',
        users: 'User Management',
        withdrawals: 'Withdrawal Management',
        analytics: 'Analytics & Reports',
        activity: 'Activity Feed',
        referrals: 'Referral Management',
        settings: 'Settings'
    };
    document.getElementById('pageTitle').textContent = titles[page];


    state.currentPage = page;
    loadPageData(page);
}

function loadPageData(page) {
    switch (page) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'users':
            loadUsers();
            break;
        case 'withdrawals':
            loadWithdrawals();
            break;
        case 'analytics':
            loadAnalytics();
            break;
        case 'activity':
            loadActivity();
            break;
        case 'referrals':
            loadReferrals();
            break;
        case 'settings':
            loadSettings();
            break;
    }
}



// API Helper
async function apiCall(endpoint, options = {}) {
    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`,
                ...options.headers
            }
        });

        if (res.status === 401 || res.status === 403) {
            localStorage.removeItem('adminToken');
            localStorage.removeItem('userToken');
            state.token = null;
            await showLoginPrompt();
            throw new Error('Session expired');
        }

        return await res.json();
    } catch (err) {
        console.error('API Error:', err);
        throw err;
    }
}

// Dashboard
async function loadDashboard() {
    try {
        updateStatus('loading', 'Loading...');
        const data = await apiCall('/dashboard');

        if (data.success) {
            updateDashboardStats(data);
            loadDashboardActivity();
            updateStatus('online', 'Connected');
        }
    } catch (err) {
        console.error('Dashboard load error:', err);
        updateStatus('offline', 'Connection Error');
    }
}

function updateDashboardStats(data) {
    document.getElementById('totalUsers').textContent = formatNumber(data.users.total_users);
    document.getElementById('newToday').textContent = data.users.new_today;

    const coinsCirculating = parseInt(data.coins.total_circulating);
    document.getElementById('coinsCirculating').textContent = formatNumber(coinsCirculating);
    document.getElementById('coinsUSD').textContent = (coinsCirculating / 500).toFixed(2);

    document.getElementById('tokensCirculating').textContent = formatNumber(data.tokens.total_circulating);
    document.getElementById('tokensLifetime').textContent = formatNumber(data.tokens.total_generated);

    document.getElementById('pendingWithdrawals').textContent = data.withdrawals.pending_count;
    document.getElementById('pendingAmount').textContent = parseFloat(data.withdrawals.pending_usd || 0).toFixed(2);
    document.getElementById('totalPaid').textContent = '$' + parseFloat(data.withdrawals.total_paid_usd || 0).toFixed(2);
    document.getElementById('paidCount').textContent = data.withdrawals.paid_count;
    document.getElementById('pendingBadge').textContent = data.withdrawals.pending_count;

    document.getElementById('todayCoins').textContent = formatNumber(data.todayEarnings.coins);
    document.getElementById('todayTokens').textContent = formatNumber(data.todayEarnings.tokens);

    document.getElementById('dashTotalReferrals').textContent = formatNumber(data.referrals.total_referred_users);
}


async function loadDashboardActivity() {
    try {
        const data = await apiCall('/analytics/activity?limit=10');

        if (data.success) {
            const container = document.getElementById('dashboardActivity');
            container.innerHTML = '';

            if (data.activities.length === 0) {
                container.innerHTML = '<div class="activity-item">No recent activity</div>';
                return;
            }

            data.activities.slice(0, 10).forEach(activity => {
                const item = document.createElement('div');
                item.className = 'activity-item';
                item.innerHTML = `
                    <div><strong>${activity.email}</strong> - ${activity.type.toUpperCase()}</div>
                    <div>Source: ${activity.source} | Amount: ${activity.amount}</div>
                    <div class="activity-time">${formatTime(activity.created_at)}</div>
                `;
                container.appendChild(item);
            });
        }
    } catch (err) {
        console.error('Activity load error:', err);
    }
}

// Users
async function loadUsers(page = 1, search = '') {
    try {
        document.getElementById('users-loading').style.display = 'block';
        document.getElementById('users-content').style.display = 'none';

        const data = await apiCall(`/users?page=${page}&limit=50&search=${encodeURIComponent(search)}`);

        if (data.success) {
            document.getElementById('users-loading').style.display = 'none';
            document.getElementById('users-content').style.display = 'block';

            const tbody = document.getElementById('usersBody');
            tbody.innerHTML = '';

            if (data.users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px;">No users found</td></tr>';
                return;
            }

            data.users.forEach(user => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${user.id}</td>
                    <td>${user.email}</td>
                    <td>${user.phone_number || '-'}</td>
                    <td>${formatNumber(user.coin_balance)}<br><small>$${(user.coin_balance / 500).toFixed(2)}</small></td>
                    <td>${formatNumber(user.token_balance)}</td>
                    <td><code>${user.referral_code || '-'}</code></td>
                    <td>${formatDate(user.created_at)}</td>
                    <td>
                        <button class="action-btn view" onclick="viewUser(${user.id})">View</button>
                    </td>
                `;
                tbody.appendChild(row);
            });

            if (data.pagination) {
                renderPagination('usersPagination', data.pagination, (p) => loadUsers(p, search));
            }
        }
    } catch (err) {
        console.error('Users load error:', err);
        document.getElementById('users-loading').innerHTML = '<p style="color: red;">Error loading users</p>';
    }
}

function searchUsers() {
    clearTimeout(state.searchTimeout);
    state.searchTimeout = setTimeout(() => {
        const search = document.getElementById('userSearch').value;
        loadUsers(1, search);
    }, 500);
}

function viewUser(userId) {
    alert(`View user ${userId}\n\nTODO: Implement user detail modal`);
}

function exportUsers() {
    alert('Export users\n\nTODO: Implement CSV export');
}

// Withdrawals
async function loadWithdrawals(status = 'all') {
    try {
        document.getElementById('withdrawals-loading').style.display = 'block';
        document.getElementById('withdrawals-content').style.display = 'none';

        const data = await apiCall(`/withdrawals?status=${status}`);

        if (data.success) {
            document.getElementById('withdrawals-loading').style.display = 'none';
            document.getElementById('withdrawals-content').style.display = 'block';

            const tbody = document.getElementById('withdrawalsBody');
            tbody.innerHTML = '';

            if (data.withdrawals.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px;">No withdrawals found</td></tr>';
                return;
            }

            data.withdrawals.forEach(w => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${w.id}</td>
                    <td>${w.email}<br><small>${w.phone_number || '-'}</small></td>
                    <td>
                        <strong>$${parseFloat(w.amount_usd).toFixed(2)}</strong><br>
                        <small>${formatNumber(w.coins_requested)} coins</small>
                    </td>
                    <td>${w.payment_method}</td>
                    <td><small>${w.payment_address}</small></td>
                    <td><span class="badge ${w.status}">${w.status.toUpperCase()}</span></td>
                    <td>${formatDate(w.created_at)}</td>
                    <td>
                        ${w.status === 'pending' ? `
                            <button class="action-btn approve" onclick="processWithdrawal(${w.id}, 'paid')">✓ Approve</button>
                            <button class="action-btn reject" onclick="processWithdrawal(${w.id}, 'rejected')">✗ Reject</button>
                        ` : '-'}
                    </td>
                `;
                tbody.appendChild(row);
            });
        }
    } catch (err) {
        console.error('Withdrawals load error:', err);
        document.getElementById('withdrawals-loading').innerHTML = '<p style="color: red;">Error loading withdrawals</p>';
    }
}

function filterWithdrawals(status) {
    state.currentFilter = status;
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.classList.toggle('active', tab.textContent.toLowerCase() === status);
    });
    loadWithdrawals(status);
}

async function processWithdrawal(id, status) {
    const action = status === 'paid' ? 'approve' : 'reject';
    if (!confirm(`Are you sure you want to ${action} this withdrawal?`)) return;

    try {
        const data = await apiCall('/withdrawals/process', {
            method: 'POST',
            body: JSON.stringify({ id, status })
        });

        if (data.success) {
            alert(`Withdrawal ${action}d successfully!`);
            loadWithdrawals(state.currentFilter);
            loadDashboard();
        } else {
            alert('Error: ' + (data.message || 'Unknown error'));
        }
    } catch (err) {
        alert('Error processing withdrawal');
        console.error(err);
    }
}

function exportWithdrawals() {
    alert('Export withdrawals\n\nTODO: Implement CSV export');
}

// Analytics
async function loadAnalytics() {
    try {
        const days = document.getElementById('trendDays')?.value || 30;
        const data = await apiCall(`/analytics/earnings?days=${days}`);

        if (data.success) {
            renderCoinSourcesChart(data.coinsBySource);
            renderTokenSourcesChart(data.tokensBySource);
            renderTrendChart(data.dailyTrend);
        }
    } catch (err) {
        console.error('Analytics load error:', err);
    }
}

function renderCoinSourcesChart(data) {
    const ctx = document.getElementById('coinSourcesChart');
    if (!ctx) return;

    if (state.charts.coinSources) state.charts.coinSources.destroy();

    if (data.length === 0) {
        ctx.parentElement.innerHTML = '<p style="text-align: center; padding: 40px;">No data</p>';
        return;
    }

    state.charts.coinSources = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.source.toUpperCase().replace('_', ' ')),
            datasets: [{
                data: data.map(d => parseInt(d.total)),
                backgroundColor: ['#667eea', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

function renderTokenSourcesChart(data) {
    const ctx = document.getElementById('tokenSourcesChart');
    if (!ctx) return;

    if (state.charts.tokenSources) state.charts.tokenSources.destroy();

    if (data.length === 0) {
        ctx.parentElement.innerHTML = '<p style="text-align: center; padding: 40px;">No data</p>';
        return;
    }

    state.charts.tokenSources = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.source.toUpperCase().replace('_', ' ')),
            datasets: [{
                data: data.map(d => parseInt(d.total)),
                backgroundColor: ['#764ba2', '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#a855f7']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

function renderTrendChart(data) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;

    if (state.charts.trend) state.charts.trend.destroy();

    if (data.length === 0) {
        ctx.parentElement.innerHTML = '<p style="text-align: center; padding: 40px;">No data</p>';
        return;
    }

    state.charts.trend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => formatDate(d.date)),
            datasets: [{
                label: 'Daily Coins Earned',
                data: data.map(d => parseInt(d.coins)),
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

// Activity
async function loadActivity() {
    try {
        const container = document.getElementById('activityFeed');
        container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading...</p></div>';

        const data = await apiCall('/analytics/activity?limit=100');

        if (data.success) {
            container.innerHTML = '';

            if (data.activities.length === 0) {
                container.innerHTML = '<div class="activity-item">No recent activity</div>';
                return;
            }

            data.activities.forEach(activity => {
                const item = document.createElement('div');
                item.className = 'activity-item';
                item.innerHTML = `
                    <div><strong>${activity.email}</strong> - ${activity.type.toUpperCase()}</div>
                    <div>Source: ${activity.source} | Amount: ${activity.amount}</div>
                    <div class="activity-time">${formatTime(activity.created_at)}</div>
                `;
                container.appendChild(item);
            });
        }
    } catch (err) {
        console.error('Activity load error:', err);
        document.getElementById('activityFeed').innerHTML = '<p style="color: red; text-align: center; padding: 40px;">Error loading activity</p>';
    }
}

function filterActivity(type) {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase() === type);
    });
    loadActivity();
}

// Referrals
async function loadReferrals(page = 1, search = '') {
    try {
        document.getElementById('referrals-loading').style.display = 'block';
        document.getElementById('referrals-content').style.display = 'none';

        // Load Stats
        const statsRes = await apiCall('/referrals/stats');
        if (statsRes.success) {
            document.getElementById('totalReferrals').textContent = formatNumber(statsRes.stats.total_referrals);
            document.getElementById('referralsToday').textContent = statsRes.stats.referrals_today;
            document.getElementById('activeReferrers').textContent = formatNumber(statsRes.stats.total_referrers);
            document.getElementById('referralsWeek').textContent = formatNumber(statsRes.stats.referrals_this_week);
        }

        // Load List
        const listRes = await apiCall(`/referrals/list?page=${page}&limit=50&search=${encodeURIComponent(search)}`);

        if (listRes.success) {
            document.getElementById('referrals-loading').style.display = 'none';
            document.getElementById('referrals-content').style.display = 'block';

            const tbody = document.getElementById('referralsBody');
            tbody.innerHTML = '';

            if (listRes.referrers.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px;">No referral data found</td></tr>';
                return;
            }

            listRes.referrers.forEach(ref => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${ref.referrer_email}</td>
                    <td><code>${ref.referral_code}</code></td>
                    <td><strong>${ref.referral_count}</strong> users joined</td>
                    <td>${formatDate(ref.last_referral_at)}</td>
                    <td>
                        <button class="action-btn view" onclick="viewReferrerDetails('${ref.referral_code}')">View Users</button>
                    </td>
                `;
                tbody.appendChild(row);
            });

            if (listRes.pagination) {
                renderPagination('referralsPagination', listRes.pagination, (p) => loadReferrals(p, search));
            }
        }
    } catch (err) {
        console.error('Referrals load error:', err);
        document.getElementById('referrals-loading').innerHTML = '<p style="color: red;">Error loading referrals</p>';
    }
}

function searchReferrals() {
    clearTimeout(state.referralSearchTimeout);
    state.referralSearchTimeout = setTimeout(() => {
        const search = document.getElementById('referralSearch').value;
        loadReferrals(1, search);
    }, 500);
}

function viewReferrerDetails(code) {
    alert(`Referral details for code: ${code}\n\nTODO: Show list of specific users who joined using this code`);
}

// Utilities

function updateStatus(status, text) {
    const dot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    if (dot) {
        dot.className = 'status-dot';
        if (status === 'online') dot.classList.add('online');
    }

    if (statusText) statusText.textContent = text;
}

function formatNumber(num) {
    return new Intl.NumberFormat().format(num || 0);
}

function formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatTime(date) {
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

    return formatDate(date);
}

function renderPagination(containerId, pagination, callback) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    const maxPages = Math.min(pagination.pages, 10);

    for (let i = 1; i <= maxPages; i++) {
        const btn = document.createElement('button');
        btn.className = 'page-btn';
        if (i === pagination.page) btn.classList.add('active');
        btn.textContent = i;
        btn.onclick = () => callback(i);
        container.appendChild(btn);
    }

    if (pagination.pages > 10) {
        const more = document.createElement('span');
        more.textContent = '...';
        more.style.padding = '0 10px';
        container.appendChild(more);
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('active');

    // Add/remove overlay for mobile
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.addEventListener('click', toggleSidebar);
        document.body.appendChild(overlay);
    }
    overlay.classList.toggle('active');

    // Prevent body scroll when sidebar is open on mobile
    if (window.innerWidth <= 1024) {
        document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
    }
}

// Global Manual Refresh
async function manualRefresh() {
    const btn = document.getElementById('globalRefreshBtn');
    if (!btn || btn.disabled) return;

    try {
        btn.disabled = true;
        btn.classList.add('loading');
        btn.querySelector('.text').textContent = 'Refreshing...';

        // Load only the current page's data
        await loadPageData(state.currentPage);

        // Brief success feedback
        btn.querySelector('.text').textContent = 'Updated!';
        setTimeout(() => {
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('loading');
                btn.querySelector('.text').textContent = 'Refresh';
            }
        }, 2000); // 2-second cooldown

    } catch (err) {
        console.error('Refresh error:', err);
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.querySelector('.text').textContent = 'Refresh';
    }
}


// Settings Functions
async function loadSettings() {
    try {
        const res = await apiCall('/settings');
        if (res.success) {
            const settings = res.settings;

            // Populate form fields
            document.getElementById('minWithdrawalInput').value = settings.min_withdrawal_usd?.value || '5.00';
            document.getElementById('coinRateInput').value = settings.coin_to_usd_rate?.value || '500';
            document.getElementById('adLimitInput').value = settings.daily_ad_limit?.value || '20';

            // Update rate preview
            updateRatePreview();

            // Add input listener for rate preview
            document.getElementById('coinRateInput').addEventListener('input', updateRatePreview);
        }
    } catch (err) {
        console.error('Load settings error:', err);
    }
}

function updateRatePreview() {
    const rate = document.getElementById('coinRateInput').value;
    document.getElementById('ratePreview').textContent = `${rate} coins = $1.00`;
}

async function saveSettings() {
    try {
        const minWithdrawal = parseFloat(document.getElementById('minWithdrawalInput').value);
        const coinRate = parseInt(document.getElementById('coinRateInput').value);
        const adLimit = parseInt(document.getElementById('adLimitInput').value);

        // Validation
        if (minWithdrawal < 1) {
            alert('Minimum withdrawal must be at least $1.00');
            return;
        }

        if (coinRate < 1) {
            alert('Coin rate must be at least 1');
            return;
        }

        if (adLimit < 1 || adLimit > 100) {
            alert('Daily ad limit must be between 1 and 100');
            return;
        }

        updateStatus('loading', 'Saving settings...');

        const res = await apiCall('/settings', {
            method: 'PUT',
            body: JSON.stringify({
                min_withdrawal_usd: minWithdrawal,
                coin_to_usd_rate: coinRate,
                daily_ad_limit: adLimit
            })
        });

        if (res.success) {
            updateStatus('online', 'Settings saved!');

            // Show success message
            const statusDiv = document.getElementById('settingsSaveStatus');
            statusDiv.style.display = 'block';
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 3000);

            console.log('✅ Settings updated successfully');
        } else {
            throw new Error(res.message || 'Failed to save settings');
        }
    } catch (err) {
        console.error('Save settings error:', err);
        alert('Failed to save settings: ' + err.message);
        updateStatus('offline', 'Save failed');
    }
}




// Cleanup
window.addEventListener('beforeunload', () => {
    state.refreshIntervals.forEach(id => clearInterval(id));
});
