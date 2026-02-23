const github = require("../services/github");
const db = require("../services/db");
const { resolveGithubToken } = require("../services/userToken");

// GET /api/repos
exports.listRepos = async (req, res) => {
    try {
        const token = await resolveGithubToken(req);
        const repos = await github.listUserRepos(Number(req.query.page) || 1, 30, token);
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
        const token = await resolveGithubToken(req);
        const repo = await github.getRepo(req.params.owner, req.params.name, token);
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

    try {
        const token = await resolveGithubToken(req);
        const fullName = `${owner}/${name}`;

        // Check if already tracked
        let existing = null;
        try {
            existing = await db.getRepoByFullName(fullName);
        } catch (e) {
            if (e.status !== 404) throw e;
        }

        if (existing && existing.isActive) {
            return res.status(409).json({ error: "Repo already tracked" });
        }

        const ghRepo = await github.getRepo(owner, name, token);

        let repo;
        if (existing) {
            // Re-activate previously untracked repo
            repo = await db.updateRepo(existing.githubId, { isActive: true });
        } else {
            // Also check by githubId to handle renames
            let existingById = null;
            try {
                existingById = await db.getRepoByGithubId(ghRepo.id);
            } catch (e) {
                if (e.status !== 404) throw e;
            }

            if (existingById) {
                repo = await db.updateRepo(ghRepo.id, {
                    fullName: ghRepo.full_name,
                    name: ghRepo.name,
                    isActive: true,
                });
            } else {
                repo = await db.createRepo({
                    githubId: ghRepo.id,
                    name: ghRepo.name,
                    fullName: ghRepo.full_name,
                    owner: {
                        login: ghRepo.owner.login,
                        avatarUrl: ghRepo.owner.avatar_url,
                        githubId: ghRepo.owner.id,
                    },
                    description: ghRepo.description,
                    url: ghRepo.html_url,
                    private: ghRepo.private,
                    language: ghRepo.language,
                    defaultBranch: ghRepo.default_branch,
                    isActive: true,
                });
            }
        }

        // Register webhook for real-time updates
        try {
            await github.createRepoWebhook(owner, name, token);
        } catch (err) {
            console.warn(`[trackRepo] Webhook registration failed: ${err.message}`);
        }

        // Import all PRs
        const ghPrs = await github.listPullRequests(owner, name, "all", 1, 100, token);
        let imported = 0;
        for (const ghPr of ghPrs) {
            let state = "open";
            if (ghPr.merged_at) state = "merged";
            else if (ghPr.state === "closed") state = "closed";
            else if (ghPr.draft) state = "draft";

            // Check if PR already exists
            try {
                await db.getPRByGithubId(ghPr.id);
                // Already exists, update it
                await db.updatePR(ghPr.id, {
                    title: ghPr.title,
                    state,
                    updatedAtGithub: ghPr.updated_at,
                    mergedAt: ghPr.merged_at || null,
                });
            } catch (e) {
                if (e.status === 404) {
                    await db.createPR({
                        githubId: ghPr.id,
                        number: ghPr.number,
                        title: ghPr.title,
                        description: ghPr.body || "",
                        state,
                        author: {
                            login: ghPr.user.login,
                            avatarUrl: ghPr.user.avatar_url,
                            githubId: ghPr.user.id,
                        },
                        repository: repo._id,
                        repositoryFullName: ghRepo.full_name,
                        baseBranch: ghPr.base.ref,
                        headBranch: ghPr.head.ref,
                        url: ghPr.html_url,
                        createdAtGithub: ghPr.created_at,
                        updatedAtGithub: ghPr.updated_at,
                        mergedAt: ghPr.merged_at || null,
                    });
                    imported++;
                } else {
                    throw e;
                }
            }
        }

        res.status(201).json({ repo, prsImported: imported });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// DELETE /api/repos/track/:repoId
exports.untrackRepo = async (req, res) => {
    try {
        const repo = await db.getRepoById(req.params.repoId);
        if (!repo) return res.status(404).json({ error: "Repo not found" });

        const updated = await db.updateRepo(repo.githubId, { isActive: false });
        res.json({ message: "Repo untracked", repo: updated });
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "Repo not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// GET /api/repos/tracked
exports.listTrackedRepos = async (req, res) => {
    try {
        const repos = await db.getAllRepos();
        res.json(repos.filter((r) => r.isActive));
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// POST /api/repos/:repoId/sync
exports.syncRepo = async (req, res) => {
    try {
        const token = await resolveGithubToken(req);
        const repo = await db.getRepoById(req.params.repoId);
        if (!repo) return res.status(404).json({ error: "Repo not found" });

        const ownerLogin = repo.owner?.login || repo.fullName.split("/")[0];
        const repoName = repo.name;

        const ghPrs = await github.listPullRequests(ownerLogin, repoName, "all", 1, 100, token);
        let created = 0, updated = 0;

        for (const ghPr of ghPrs) {
            let state = "open";
            if (ghPr.merged_at) state = "merged";
            else if (ghPr.state === "closed") state = "closed";
            else if (ghPr.draft) state = "draft";

            try {
                await db.getPRByGithubId(ghPr.id);
                await db.updatePR(ghPr.id, {
                    title: ghPr.title,
                    state,
                    updatedAtGithub: ghPr.updated_at,
                    mergedAt: state === "merged" ? ghPr.merged_at : undefined,
                });
                updated++;
            } catch (e) {
                if (e.status === 404) {
                    await db.createPR({
                        githubId: ghPr.id,
                        number: ghPr.number,
                        title: ghPr.title,
                        description: ghPr.body || "",
                        state,
                        author: {
                            login: ghPr.user.login,
                            avatarUrl: ghPr.user.avatar_url,
                            githubId: ghPr.user.id,
                        },
                        repository: repo._id,
                        repositoryFullName: repo.fullName,
                        baseBranch: ghPr.base.ref,
                        headBranch: ghPr.head.ref,
                        url: ghPr.html_url,
                        createdAtGithub: ghPr.created_at,
                        updatedAtGithub: ghPr.updated_at,
                        mergedAt: ghPr.merged_at || null,
                    });
                    created++;
                } else {
                    throw e;
                }
            }
        }

        await db.updateRepo(repo.githubId, { lastSyncedAt: new Date().toISOString() });
        res.json({ message: "Sync complete", created, updated });
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "Repo not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// GET /api/repos/:repoId/prs
exports.listPrsForRepo = async (req, res) => {
    try {
        const repo = await db.getRepoById(req.params.repoId);
        if (!repo) return res.status(404).json({ error: "Repo not found" });
        const prs = await db.getPRsByRepository(repo._id);
        res.json(prs);
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "Repo not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};
