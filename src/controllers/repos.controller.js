const github = require("../services/github");
const db = require("../services/db");

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

    try {
        // Check if already tracked
        const fullName = `${owner}/${name}`;
        try {
            const existing = await db.getRepoByFullName(fullName);
            if (existing && existing.isActive) {
                return res.status(409).json({ error: "Repo already tracked" });
            }
        } catch (e) {
            // 404 = not tracked yet, continue
            if (e.status !== 404) throw e;
        }

        const ghRepo = await github.getRepo(owner, name);

        const repo = await db.createRepo({
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

        // Import all PRs
        const ghPrs = await github.listPullRequests(owner, name, "all");
        for (const ghPr of ghPrs) {
            let state = "open";
            if (ghPr.merged_at) state = "merged";
            else if (ghPr.state === "closed") state = "closed";
            else if (ghPr.draft) state = "draft";

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
        }

        res.status(201).json({ repo, prsImported: ghPrs.length });
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
        const repo = await db.getRepoById(req.params.repoId);
        if (!repo) return res.status(404).json({ error: "Repo not found" });

        const ownerLogin = repo.owner?.login || repo.fullName.split("/")[0];
        const repoName = repo.name;

        const ghPrs = await github.listPullRequests(ownerLogin, repoName, "all");
        let created = 0, updated = 0;

        for (const ghPr of ghPrs) {
            let state = "open";
            if (ghPr.merged_at) state = "merged";
            else if (ghPr.state === "closed") state = "closed";
            else if (ghPr.draft) state = "draft";

            try {
                const existing = await db.getPRByGithubId(ghPr.id);
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
