const github = require("../services/github");
const db = require("../services/db");
const ai = require("../services/ai");

// GET /api/prs/:prId
exports.getPrDetails = async (req, res) => {
    try {
        const pr = await db.getPRById(req.params.prId);
        res.json(pr);
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "PR not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// GET /api/prs/:prId/conflicts
exports.checkConflicts = async (req, res) => {
    try {
        const pr = await db.getPRById(req.params.prId);
        const repo = pr.repository;
        if (!repo) return res.status(404).json({ error: "Repo not found" });

        const ownerLogin = repo.owner?.login || repo.fullName.split("/")[0];
        const ghPr = await github.getPullRequest(ownerLogin, repo.name, pr.number);
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
        const pr = await db.getPRById(req.params.prId);
        const repo = pr.repository;
        if (!repo) return res.status(404).json({ error: "Repo not found" });

        const ownerLogin = repo.owner?.login || repo.fullName.split("/")[0];
        const diff = await github.getPullRequestDiff(ownerLogin, repo.name, pr.number);
        res.type("text/plain").send(diff);
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "PR not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// POST /api/prs/:prId/merge
exports.mergePr = async (req, res) => {
    try {
        const pr = await db.getPRById(req.params.prId);
        if (pr.state === "merged") return res.status(400).json({ error: "Already merged" });
        if (pr.state === "closed") return res.status(400).json({ error: "Cannot merge closed PR" });

        const repo = pr.repository;
        if (!repo) return res.status(404).json({ error: "Repo not found" });

        const ownerLogin = repo.owner?.login || repo.fullName.split("/")[0];
        await github.mergePullRequest(ownerLogin, repo.name, pr.number);
        const updated = await db.mergePRInDb(pr.githubId);
        res.json({ message: "PR merged", pr: updated });
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "PR not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// POST /api/prs/:prId/close
exports.closePr = async (req, res) => {
    try {
        const pr = await db.getPRById(req.params.prId);
        if (pr.state === "merged") return res.status(400).json({ error: "Cannot close merged PR" });

        const repo = pr.repository;
        if (!repo) return res.status(404).json({ error: "Repo not found" });

        const ownerLogin = repo.owner?.login || repo.fullName.split("/")[0];
        await github.closePullRequest(ownerLogin, repo.name, pr.number);
        const updated = await db.closePRInDb(pr.githubId);
        res.json({ message: "PR closed", pr: updated });
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "PR not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// POST /api/prs/:prId/reopen
exports.reopenPr = async (req, res) => {
    try {
        const pr = await db.getPRById(req.params.prId);
        if (pr.state !== "closed") return res.status(400).json({ error: "Only closed PRs can be reopened" });

        const repo = pr.repository;
        if (!repo) return res.status(404).json({ error: "Repo not found" });

        const ownerLogin = repo.owner?.login || repo.fullName.split("/")[0];
        await github.reopenPullRequest(ownerLogin, repo.name, pr.number);
        const updated = await db.reopenPRInDb(pr.githubId);
        res.json({ message: "PR reopened", pr: updated });
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "PR not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// POST /api/prs/:prId/reviews
exports.submitReview = async (req, res) => {
    try {
        const pr = await db.getPRById(req.params.prId);
        const { decision, comment, reviewer } = req.body;
        const valid = ["approve", "request_changes", "comment"];
        if (!decision || !valid.includes(decision)) {
            return res.status(400).json({ error: `decision must be one of: ${valid.join(", ")}` });
        }

        const repo = pr.repository;
        if (!repo) return res.status(404).json({ error: "Repo not found" });

        let githubEvent = "COMMENT";
        if (decision === "approve") githubEvent = "APPROVE";
        if (decision === "request_changes") githubEvent = "REQUEST_CHANGES";

        const ownerLogin = repo.owner?.login || repo.fullName.split("/")[0];
        const ghReview = await github.createPrReview(ownerLogin, repo.name, pr.number, githubEvent, comment || "");

        const review = await db.createReview({
            githubId: ghReview.id,
            pullRequest: pr._id,
            pullRequestNumber: pr.number,
            user: {
                login: reviewer || "anonymous",
            },
            state: githubEvent,
            body: comment || "",
            submittedAt: new Date().toISOString(),
        });

        res.status(201).json(review);
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "PR not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// GET /api/prs/:prId/reviews
exports.listReviews = async (req, res) => {
    try {
        const pr = await db.getPRById(req.params.prId);
        const reviews = await db.getReviewsByPR(pr._id);
        res.json(reviews);
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "PR not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// POST /api/prs/:prId/tags
exports.addTag = async (req, res) => {
    try {
        const pr = await db.getPRById(req.params.prId);
        const { tag } = req.body;
        if (!tag) return res.status(400).json({ error: "tag is required" });

        const labels = pr.labels || [];
        if (!labels.some((l) => l.name === tag)) {
            labels.push({ name: tag, color: "" });
        }
        const updated = await db.updatePR(pr.githubId, { labels });
        res.json({ message: "Tag added", tags: updated.labels });
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "PR not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// DELETE /api/prs/:prId/tags/:tag
exports.removeTag = async (req, res) => {
    try {
        const pr = await db.getPRById(req.params.prId);
        const labels = (pr.labels || []).filter((l) => l.name !== req.params.tag);
        if (labels.length === (pr.labels || []).length) {
            return res.status(404).json({ error: "Tag not found" });
        }
        const updated = await db.updatePR(pr.githubId, { labels });
        res.json({ message: "Tag removed", tags: updated.labels });
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "PR not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};

// POST /api/prs/:prId/analyze — Run AI analysis on a PR and store results
exports.analyzePr = async (req, res) => {
    try {
        const pr = await db.getPRById(req.params.prId);
        const repo = pr.repository;
        if (!repo) return res.status(404).json({ error: "Repo not found" });

        const ownerLogin = repo.owner?.login || repo.fullName.split("/")[0];
        const diff = await github.getPullRequestDiff(ownerLogin, repo.name, pr.number);

        const analysis = await ai.analyzeFullPR(diff);
        const updated = await db.updatePR(pr.githubId, analysis);

        res.json({ message: "AI analysis complete", pr: updated });
    } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: "PR not found" });
        res.status(err.status || 500).json({ error: err.message });
    }
};
