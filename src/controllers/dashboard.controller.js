const { store } = require("../store");

// GET /api/dashboard/stats — 4 stat cards from temp.txt
exports.getStats = (req, res) => {
    const open = store.pullRequests.filter((p) => p.status === "open");

    res.json({
        openPrs: open.length,
        needingReview: open.filter(
            (p) => !store.reviews.some((r) => r.prId === p._id)
        ).length,
        highRisk: open.filter((p) => p.riskLevel === "high").length,
        securityAlerts: open.filter((p) => p.securityStatus === "flagged").length,
    });
};

// GET /api/dashboard/recent-prs — Last 10 PRs
exports.getRecentPrs = (req, res) => {
    const recent = [...store.pullRequests]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 10);
    res.json(recent);
};

// GET /api/dashboard/risk-snapshot — Top 3 risky open PRs
exports.getRiskSnapshot = (req, res) => {
    const risky = store.pullRequests
        .filter((p) => p.status === "open" && p.riskLevel === "high")
        .slice(0, 3);
    res.json(risky);
};

// GET /api/dashboard/security-snapshot — Top 3 flagged open PRs
exports.getSecuritySnapshot = (req, res) => {
    const flagged = store.pullRequests
        .filter((p) => p.status === "open" && p.securityStatus === "flagged")
        .slice(0, 3);
    res.json(flagged);
};
