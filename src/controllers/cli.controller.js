const db = require("../services/db");

// POST /api/cli/login — placeholder
exports.cliLogin = (_req, res) => {
    res.json({ message: "CLI login — auth service integration pending" });
};

// GET /api/cli/status
exports.cliStatus = async (_req, res) => {
    try {
        const allPrs = await db.getAllPRs();
        const open = allPrs.filter((p) => p.state === "open");
        const allRepos = await db.getAllRepos();

        res.json({
            open: open.length,
            risky: open.filter((p) => p.riskLevel === "high").length,
            flagged: open.filter((p) => p.securityStatus === "flagged").length,
            trackedRepos: allRepos.filter((r) => r.isActive).length,
        });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// POST /api/cli/pr/:prId/merge
exports.cliMerge = async (req, res) => {
    try {
        const pr = await db.getPRById(req.params.prId);
        if (pr.state === "merged") return res.status(400).json({ error: "Already merged" });
        if (pr.state === "closed") return res.status(400).json({ error: "Cannot merge closed PR" });

        const updated = await db.mergePRInDb(pr.githubId);
        res.json({ message: "PR merged via CLI", pr: updated });
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "PR not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// POST /api/cli/repos/track
exports.cliTrackRepo = async (req, res) => {
    const { owner, name } = req.body;
    if (!owner || !name) return res.status(400).json({ error: "owner and name are required" });

    const fullName = `${owner}/${name}`;
    try {
        const existing = await db.getRepoByFullName(fullName);
        if (existing) return res.status(409).json({ error: "Already tracked" });
    } catch (e) {
        if (e.status !== 404) {
            return res.status(e.status || 500).json({ error: e.message });
        }
    }

    try {
        const repo = await db.createRepo({
            githubId: 0, // placeholder — no GitHub API call in CLI quick-track
            name,
            fullName,
            owner: { login: owner },
            isActive: true,
        });
        res.status(201).json(repo);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};
