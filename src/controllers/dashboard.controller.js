const db = require("../services/db");

// GET /api/dashboard/stats
exports.getStats = async (req, res) => {
    try {
        const allPrs = await db.getAllPRs(req);
        const open = allPrs.filter((p) => p.state === "open");

        const allReviews = await db.getAllReviews(req);

        res.json({
            openPrs: open.length,
            needingReview: open.filter(
                (p) => !allReviews.some((r) => String(r.pullRequest?._id || r.pullRequest) === String(p._id))
            ).length,
            highRisk: open.filter((p) => p.riskLevel === "high").length,
            securityAlerts: open.filter((p) => p.securityStatus === "flagged").length,
        });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// GET /api/dashboard/recent-prs
exports.getRecentPrs = async (req, res) => {
    try {
        const allPrs = await db.getAllPRs(req);
        const recent = allPrs.slice(0, 10); // already sorted by createdAt desc
        res.json(recent);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};
