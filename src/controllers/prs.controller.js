const github = require("../services/github");
const db = require("../services/db");
const ai = require("../services/ai");
const { resolveGithubToken } = require("../services/userToken");

// GET /api/prs/:prId
exports.getPrDetails = async (req, res) => {
    try {
        const pr = await db.getPRById(req.params.prId, req);
        res.json(pr);
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "PR not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// GET /api/prs/:prId/conflicts
exports.checkConflicts = async (req, res) => {
    try {
        const token = await resolveGithubToken(req);
        const pr = await db.getPRById(req.params.prId, req);
        const repo = pr.repository;
        if (!repo) return res.status(404).json({ error: "Repo not found" });

        const ownerLogin = repo.owner?.login || repo.fullName.split("/")[0];
        const ghPr = await github.getPullRequest(ownerLogin, repo.name, pr.number, token);
        res.json({
            mergeable: ghPr.mergeable,
            mergeable_state: ghPr.mergeable_state,
        });
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "PR not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// GET /api/prs/:prId/diff
exports.getPrDiff = async (req, res) => {
    try {
        const token = await resolveGithubToken(req);
        const pr = await db.getPRById(req.params.prId, req);
        const repo = pr.repository;
        if (!repo) return res.status(404).json({ error: "Repo not found" });

        const ownerLogin = repo.owner?.login || repo.fullName.split("/")[0];
        const diff = await github.getPullRequestDiff(ownerLogin, repo.name, pr.number, token);
        res.type("text/plain").send(diff);
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "PR not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// POST /api/prs/:prId/merge
exports.mergePr = async (req, res) => {
    try {
        const token = await resolveGithubToken(req);
        const pr = await db.getPRById(req.params.prId, req);
        if (pr.state === "merged") return res.status(400).json({ error: "Already merged" });
        if (pr.state === "closed") return res.status(400).json({ error: "Cannot merge closed PR" });

        const repo = pr.repository;
        if (!repo) return res.status(404).json({ error: "Repo not found" });

        const ownerLogin = repo.owner?.login || repo.fullName.split("/")[0];
        await github.mergePullRequest(ownerLogin, repo.name, pr.number, token);
        const updated = await db.mergePRInDb(pr.githubId, req);
        res.json({ message: "PR merged", pr: updated });
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "PR not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// POST /api/prs/:prId/close
exports.closePr = async (req, res) => {
    try {
        const token = await resolveGithubToken(req);
        const pr = await db.getPRById(req.params.prId, req);
        if (pr.state === "merged") return res.status(400).json({ error: "Cannot close merged PR" });

        const repo = pr.repository;
        if (!repo) return res.status(404).json({ error: "Repo not found" });

        const ownerLogin = repo.owner?.login || repo.fullName.split("/")[0];
        await github.closePullRequest(ownerLogin, repo.name, pr.number, token);
        const updated = await db.closePRInDb(pr.githubId, req);
        res.json({ message: "PR closed", pr: updated });
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "PR not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// POST /api/prs/:prId/reopen
exports.reopenPr = async (req, res) => {
    try {
        const token = await resolveGithubToken(req);
        const pr = await db.getPRById(req.params.prId, req);
        if (pr.state !== "closed") return res.status(400).json({ error: "Only closed PRs can be reopened" });

        const repo = pr.repository;
        if (!repo) return res.status(404).json({ error: "Repo not found" });

        const ownerLogin = repo.owner?.login || repo.fullName.split("/")[0];
        await github.reopenPullRequest(ownerLogin, repo.name, pr.number, token);
        const updated = await db.reopenPRInDb(pr.githubId, req);
        res.json({ message: "PR reopened", pr: updated });
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "PR not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// POST /api/prs/:prId/reviews
exports.submitReview = async (req, res) => {
    try {
        const token = await resolveGithubToken(req);
        const pr = await db.getPRById(req.params.prId, req);
        const { decision, comment, reviewer } = req.body;
        const valid = ["approve", "request_changes", "comment"];
        if (!decision || !valid.includes(decision)) {
            return res.status(400).json({ error: `decision must be one of: ${valid.join(", ")}` });
        }

        const repo = pr.repository;
        if (!repo) return res.status(404).json({ error: "Repo not found" });

        // Map to GitHub API event names
        let githubEvent = "COMMENT";
        if (decision === "approve") githubEvent = "APPROVE";
        if (decision === "request_changes") githubEvent = "REQUEST_CHANGES";

        // Map to Review model enum names
        let dbState = "COMMENTED";
        if (decision === "approve") dbState = "APPROVED";
        if (decision === "request_changes") dbState = "CHANGES_REQUESTED";

        const ownerLogin = repo.owner?.login || repo.fullName.split("/")[0];
        const ghReview = await github.createPrReview(ownerLogin, repo.name, pr.number, githubEvent, comment || "", token);

        const review = await db.createReview({
            githubId: ghReview.id,
            pullRequest: pr._id,
            pullRequestNumber: pr.number,
            user: {
                login: reviewer || "anonymous",
            },
            state: dbState,
            body: comment || "",
            submittedAt: new Date().toISOString(),
        }, req);

        res.status(201).json(review);
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "PR not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// GET /api/prs/:prId/reviews
exports.listReviews = async (req, res) => {
    try {
        const pr = await db.getPRById(req.params.prId, req);
        const reviews = await db.getReviewsByPR(pr._id, req);
        res.json(reviews);
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "PR not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// POST /api/prs/:prId/tags
exports.addTag = async (req, res) => {
    try {
        const pr = await db.getPRById(req.params.prId, req);
        const { tag } = req.body;
        if (!tag) return res.status(400).json({ error: "tag is required" });

        const labels = pr.labels || [];
        if (!labels.some((l) => l.name === tag)) {
            labels.push({ name: tag, color: "" });
        }
        const updated = await db.updatePR(pr.githubId, { labels }, req);
        res.json({ message: "Tag added", tags: updated.labels });
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "PR not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// DELETE /api/prs/:prId/tags/:tag
exports.removeTag = async (req, res) => {
    try {
        const pr = await db.getPRById(req.params.prId, req);
        const labels = (pr.labels || []).filter((l) => l.name !== req.params.tag);
        if (labels.length === (pr.labels || []).length) {
            return res.status(404).json({ error: "Tag not found" });
        }
        const updated = await db.updatePR(pr.githubId, { labels }, req);
        res.json({ message: "Tag removed", tags: updated.labels });
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "PR not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// POST /api/prs/:prId/analyze — Run AI analysis on a PR and store results
exports.analyzePr = async (req, res) => {
    try {
        const token = await resolveGithubToken(req);
        const pr = await db.getPRById(req.params.prId, req);
        const repo = pr.repository;
        if (!repo) return res.status(404).json({ error: "Repo not found" });

        const ownerLogin = repo.owner?.login || repo.fullName.split("/")[0];
        const diff = await github.getPullRequestDiff(ownerLogin, repo.name, pr.number, token);

        const analysis = await ai.analyzeFullPR(diff);
        const updated = await db.updatePR(pr.githubId, analysis, req);

        res.json({ message: "AI analysis complete", pr: updated });
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "PR not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};
