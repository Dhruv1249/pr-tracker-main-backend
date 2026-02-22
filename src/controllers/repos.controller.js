const { store, newId, now } = require("../store");
const github = require("../services/github");

// GET /api/repos
exports.listRepos = async (req, res) => {
    try {
        const repos = await github.listUserRepos(Number(req.query.page) || 1);
        res.json(
            repos.map((r) => ({
                githubRepoId: r.id,
                owner: r.owner.login,
                name: r.name,
                fullName: r.full_name,
                private: r.private,
                description: r.description,
                url: r.html_url,
                language: r.language,
                updatedAt: r.updated_at,
            }))
        );
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// GET /api/repos/:owner/:name
exports.getRepoDetails = async (req, res) => {
    try {
        const repo = await github.getRepo(req.params.owner, req.params.name);
        res.json({
            githubRepoId: repo.id,
            owner: repo.owner.login,
            name: repo.name,
            fullName: repo.full_name,
            description: repo.description,
            url: repo.html_url,
            language: repo.language,
            defaultBranch: repo.default_branch,
            updatedAt: repo.updated_at,
        });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// POST /api/repos/track
exports.trackRepo = async (req, res) => {
    const { owner, name } = req.body;
    if (!owner || !name) return res.status(400).json({ error: "owner and name are required" });

    if (store.repos.find((r) => r.owner === owner && r.name === name)) {
        return res.status(409).json({ error: "Repo already tracked" });
    }

    try {
        const ghRepo = await github.getRepo(owner, name);
        const repo = {
            _id: newId(),
            owner: ghRepo.owner.login,
            name: ghRepo.name,
            fullName: ghRepo.full_name,
            githubRepoId: ghRepo.id,
            isActive: true,
            lastSyncedAt: now(),
            createdAt: now(),
            updatedAt: now(),
        };
        store.repos.push(repo);

        // Import all PRs (open and closed)
        const ghPrs = await github.listPullRequests(owner, name, "all");
        for (const ghPr of ghPrs) {
            let status = "open";
            if (ghPr.merged_at) status = "merged";
            else if (ghPr.state === "closed") status = "closed";
            else if (ghPr.draft) status = "draft";

            store.pullRequests.push({
                _id: newId(),
                repoId: repo._id,
                githubPrId: ghPr.id,
                number: ghPr.number,
                title: ghPr.title,
                author: ghPr.user.login,
                status: status,
                url: ghPr.html_url,
                baseBranch: ghPr.base.ref,
                headBranch: ghPr.head.ref,
                riskLevel: "low",
                securityStatus: "pending",
                tags: [],
                lastCommitSha: ghPr.head.sha,
                createdAt: ghPr.created_at,
                updatedAt: ghPr.updated_at,
                mergedAt: ghPr.merged_at || null,
            });
        }

        res.status(201).json({ repo, prsImported: ghPrs.length });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// DELETE /api/repos/track/:repoId
exports.untrackRepo = (req, res) => {
    const repo = store.repos.find((r) => r._id === req.params.repoId);
    if (!repo) return res.status(404).json({ error: "Repo not found" });

    repo.isActive = false;
    repo.updatedAt = now();
    res.json({ message: "Repo untracked", repo });
};

// GET /api/repos/tracked
exports.listTrackedRepos = (req, res) => {
    res.json(store.repos.filter((r) => r.isActive));
};

// POST /api/repos/:repoId/sync
exports.syncRepo = async (req, res) => {
    const repo = store.repos.find((r) => r._id === req.params.repoId);
    if (!repo) return res.status(404).json({ error: "Repo not found" });

    try {
        const ghPrs = await github.listPullRequests(repo.owner, repo.name, "all");
        let created = 0, updated = 0;

        for (const ghPr of ghPrs) {
            let status = "open";
            if (ghPr.merged_at) status = "merged";
            else if (ghPr.state === "closed") status = "closed";
            else if (ghPr.draft) status = "draft";

            const existing = store.pullRequests.find(
                (p) => p.repoId === repo._id && p.githubPrId === ghPr.id
            );

            if (existing) {
                existing.title = ghPr.title;
                existing.status = status;
                existing.lastCommitSha = ghPr.head.sha;
                existing.updatedAt = ghPr.updated_at;
                if (status === "merged") existing.mergedAt = ghPr.merged_at;
                updated++;
            } else {
                store.pullRequests.push({
                    _id: newId(),
                    repoId: repo._id,
                    githubPrId: ghPr.id,
                    number: ghPr.number,
                    title: ghPr.title,
                    author: ghPr.user.login,
                    status,
                    url: ghPr.html_url,
                    baseBranch: ghPr.base.ref,
                    headBranch: ghPr.head.ref,
                    riskLevel: "low",
                    securityStatus: "pending",
                    tags: [],
                    lastCommitSha: ghPr.head.sha,
                    createdAt: ghPr.created_at,
                    updatedAt: ghPr.updated_at,
                    mergedAt: ghPr.merged_at || null,
                });
                created++;
            }
        }

        repo.lastSyncedAt = now();
        repo.updatedAt = now();
        res.json({ message: "Sync complete", created, updated });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// GET /api/repos/:repoId/prs
exports.listPrsForRepo = (req, res) => {
    const repo = store.repos.find((r) => r._id === req.params.repoId);
    if (!repo) return res.status(404).json({ error: "Repo not found" });
    res.json(store.pullRequests.filter((pr) => pr.repoId === repo._id));
};
