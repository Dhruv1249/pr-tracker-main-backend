const { store, newId, now } = require("../store");

// POST /api/cli/login — placeholder
exports.cliLogin = (_req, res) => {
    res.json({ message: "CLI login — auth service integration pending" });
};

// GET /api/cli/status
exports.cliStatus = (_req, res) => {
    const open = store.pullRequests.filter((p) => p.status === "open");
    res.json({
        open: open.length,
        risky: open.filter((p) => p.riskLevel === "high").length,
        flagged: open.filter((p) => p.securityStatus === "flagged").length,
        trackedRepos: store.repos.filter((r) => r.isActive).length,
    });
};

// POST /api/cli/pr/:prId/merge
exports.cliMerge = (req, res) => {
    const pr = store.pullRequests.find((p) => p._id === req.params.prId);
    if (!pr) return res.status(404).json({ error: "PR not found" });
    if (pr.status === "merged") return res.status(400).json({ error: "Already merged" });
    if (pr.status === "closed") return res.status(400).json({ error: "Cannot merge closed PR" });

    pr.status = "merged";
    pr.mergedAt = now();
    pr.updatedAt = now();
    res.json({ message: "PR merged via CLI", pr });
};

// POST /api/cli/repos/track
exports.cliTrackRepo = (req, res) => {
    const { owner, name } = req.body;
    if (!owner || !name) return res.status(400).json({ error: "owner and name are required" });

    if (store.repos.find((r) => r.owner === owner && r.name === name)) {
        return res.status(409).json({ error: "Already tracked" });
    }

    const repo = {
        _id: newId(),
        owner,
        name,
        fullName: `${owner}/${name}`,
        githubRepoId: null,
        isActive: true,
        lastSyncedAt: null,
        createdAt: now(),
        updatedAt: now(),
    };
    store.repos.push(repo);
    res.status(201).json(repo);
};
