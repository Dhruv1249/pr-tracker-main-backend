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
                openPrs: r.open_issues_count ?? 0,
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
            existing = await db.getRepoByFullName(fullName, req);
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
            repo = await db.updateRepo(existing.githubId, { isActive: true }, req);
        } else {
            // Also check by githubId to handle renames
            let existingById = null;
            try {
                existingById = await db.getRepoByGithubId(ghRepo.id, req);
            } catch (e) {
                if (e.status !== 404) throw e;
            }

            if (existingById) {
                repo = await db.updateRepo(ghRepo.id, {
                    fullName: ghRepo.full_name,
                    name: ghRepo.name,
                    isActive: true,
                }, req);
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
                }, req);
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
                await db.getPRByGithubId(ghPr.id, req);
                // Already exists, update it
                await db.updatePR(ghPr.id, {
                    title: ghPr.title,
                    state,
                    updatedAtGithub: ghPr.updated_at,
                    mergedAt: ghPr.merged_at || null,
                }, req);
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
                    }, req);
                    imported++;
                } else {
                    throw e;
                }
            }
        }

        // Link the repo to the current user
        try {
            await db.importRepositories([ghRepo.id], req);
        } catch (err) {
            console.warn(`[trackRepo] Failed to link repo to user: ${err.message}`);
        }

        res.status(201).json({ repo, prsImported: imported });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// DELETE /api/repos/track/:repoId
exports.untrackRepo = async (req, res) => {
    try {
        const repo = await db.getRepoById(req.params.repoId, req);
        if (!repo) return res.status(404).json({ error: "Repo not found" });

        const updated = await db.updateRepo(repo.githubId, { isActive: false }, req);
        res.json({ message: "Repo untracked", repo: updated });
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "Repo not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// GET /api/repos/tracked
exports.listTrackedRepos = async (req, res) => {
    try {
        const repos = await db.getAllRepos(req);
        res.json(repos.filter((r) => r.isActive));
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// POST /api/repos/:repoId/sync
exports.syncRepo = async (req, res) => {
    try {
        const token = await resolveGithubToken(req);
        const repo = await db.getRepoById(req.params.repoId, req);
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
                await db.getPRByGithubId(ghPr.id, req);
                await db.updatePR(ghPr.id, {
                    title: ghPr.title,
                    state,
                    updatedAtGithub: ghPr.updated_at,
                    mergedAt: state === "merged" ? ghPr.merged_at : undefined,
                }, req);
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
                    }, req);
                    created++;
                } else {
                    throw e;
                }
            }
        }

        await db.updateRepo(repo.githubId, { lastSyncedAt: new Date().toISOString() }, req);
        res.json({ message: "Sync complete", created, updated });
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "Repo not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// GET /api/repos/:repoId/prs
exports.listPrsForRepo = async (req, res) => {
    try {
        const repo = await db.getRepoById(req.params.repoId, req);
        if (!repo) return res.status(404).json({ error: "Repo not found" });
        const prs = await db.getPRsByRepository(repo._id, req);
        res.json(prs);
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "Repo not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// GET /api/repos/:owner/:name/pulls
exports.listRepoPulls = async (req, res) => {
    try {
        const token = await resolveGithubToken(req);
        const { owner, name } = req.params;
        const state = req.query.state || "open";
        const page = Number(req.query.page) || 1;
        const perPage = Number(req.query.per_page) || 20;

        const prs = await github.listPullRequests(owner, name, state, page, perPage, token);

        // Normalize to a clean shape the frontend can consume
        const mapped = prs.map((pr) => ({
            id: pr.id,
            number: pr.number,
            title: pr.title,
            state: pr.state,
            draft: pr.draft,
            merged_at: pr.merged_at,
            user: { login: pr.user.login, avatar_url: pr.user.avatar_url },
            head: { ref: pr.head.ref },
            base: { ref: pr.base.ref, repo: { full_name: pr.base.repo?.full_name } },
            labels: pr.labels || [],
            html_url: pr.html_url,
            created_at: pr.created_at,
            updated_at: pr.updated_at,
            comments: pr.comments,
        }));

        res.json({
            data: mapped,
            page,
            perPage,
            hasNextPage: mapped.length === perPage,
        });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// GET /api/repos/:owner/:name/pulls/:number — single PR from GitHub
exports.getPrByNumber = async (req, res) => {
    try {
        const token = await resolveGithubToken(req);
        const { owner, name, number } = req.params;
        const pr = await github.getPullRequest(owner, name, Number(number), token);
        res.json({
            id: pr.id,
            number: pr.number,
            title: pr.title,
            body: pr.body || "",
            state: pr.state,
            draft: pr.draft,
            merged_at: pr.merged_at,
            user: { login: pr.user.login, avatar_url: pr.user.avatar_url },
            head: { ref: pr.head.ref },
            base: { ref: pr.base.ref, repo: { full_name: pr.base.repo?.full_name } },
            labels: pr.labels || [],
            html_url: pr.html_url,
            created_at: pr.created_at,
            updated_at: pr.updated_at,
            comments: pr.comments,
            mergeable: pr.mergeable,
        });
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// GET /api/repos/:owner/:name/pulls/:number/files — changed files with patches
exports.listPrFilesByNumber = async (req, res) => {
    try {
        const token = await resolveGithubToken(req);
        const { owner, name, number } = req.params;
        const files = await github.listPrFiles(owner, name, Number(number), token);
        const mapped = files.map((f) => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            changes: f.changes,
            patch: f.patch || null, // may be absent for binary files
        }));
        res.json(mapped);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// GET /api/repos/:owner/:name/pulls/:number/commits — commit list
exports.listPrCommitsByNumber = async (req, res) => {
    try {
        const token = await resolveGithubToken(req);
        const { owner, name, number } = req.params;
        const commits = await github.listPrCommits(owner, name, Number(number), token);
        const mapped = commits.map((c) => ({
            sha: c.sha,
            message: c.commit.message,
            author: c.commit.author.name,
            authorLogin: c.author?.login || "",
            avatarUrl: c.author?.avatar_url || "",
            date: c.commit.author.date,
            url: c.html_url,
        }));
        res.json(mapped);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// GET /api/repos/:owner/:name/pulls/:number/comments — issue + review comments
exports.listPrCommentsByNumber = async (req, res) => {
    try {
        const token = await resolveGithubToken(req);
        const { owner, name, number } = req.params;

        const [issueComments, reviewComments] = await Promise.all([
            github.listPrComments(owner, name, Number(number), token),
            github.listPrReviewComments(owner, name, Number(number), token),
        ]);

        const mapComment = (c, type) => ({
            id: c.id,
            type,                          // "issue" | "review"
            body: c.body,
            createdAt: c.created_at,
            updatedAt: c.updated_at,
            author: { login: c.user?.login || "", avatarUrl: c.user?.avatar_url || "" },
            // review-comment extras
            path: c.path || null,
            line: c.line || c.original_line || null,
            diffHunk: c.diff_hunk || null,
            inReplyToId: c.in_reply_to_id || null,
            pullRequestReviewId: c.pull_request_review_id || null,
            url: c.html_url,
        });

        const all = [
            ...issueComments.map((c) => mapComment(c, "issue")),
            ...reviewComments.map((c) => mapComment(c, "review")),
        ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        res.json(all);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// POST /api/repos/:owner/:name/pulls/:number/analyze
exports.analyzePrByNumber = async (req, res) => {
    try {
        const token = await resolveGithubToken(req);
        const { owner, name, number } = req.params;

        // 1. Get raw diff from GitHub
        const diff = await github.getPullRequestDiff(owner, name, Number(number), token);
        if (!diff) {
            return res.status(400).json({ error: "Could not fetch PR diff" });
        }

        // 2. Run AI Analysis
        // We import the AI service here to avoid circular deps if they exist, or at top of file
        const aiService = require("../services/ai");
        const analysis = await aiService.analyzeFullPR(diff);

        // 3. Save to database using the existing prService/db functions if possible,
        // or just return to client directly.
        // For now, we'll try to update the PR record in the DB if it exists.
        const fullName = `${owner}/${name}`;
        try {
            // Find PR by repo full name and number to attach the analysis
            // We use raw mongodb query or db.js helper
            const repo = await db.getRepoByFullName(fullName, req);
            if (repo) {
                const PR = require("../models/PullRequest");
                await PR.findOneAndUpdate(
                    { repository: repo._id, number: Number(number) },
                    { $set: { aiAnalysis: analysis } }
                );
            }
        } catch (dbErr) {
            console.warn("Could not save AI analysis to DB:", dbErr.message);
        }

        res.json({ message: "Analysis complete", data: analysis });
    } catch (err) {
        console.error("AI Analysis Error:", err);
        res.status(err.status || 500).json({ error: err.message });
    }
};

