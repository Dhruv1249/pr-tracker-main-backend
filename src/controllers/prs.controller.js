const { store, newId, now } = require("../store");
const github = require("../services/github");

function findPr(prId) {
    return store.pullRequests.find((p) => p._id === prId);
}

function repoForPr(pr) {
    return store.repos.find((r) => r._id === pr.repoId);
}

// GET /api/prs/:prId
exports.getPrDetails = (req, res) => {
    const pr = findPr(req.params.prId);
    if (!pr) return res.status(404).json({ error: "PR not found" });
    res.json(pr);
};

// GET /api/prs/:prId/diff
exports.getPrDiff = async (req, res) => {
    const pr = findPr(req.params.prId);
    if (!pr) return res.status(404).json({ error: "PR not found" });

    const repo = repoForPr(pr);
    if (!repo) return res.status(404).json({ error: "Repo not found" });

    try {
        const diff = await github.getPullRequestDiff(repo.owner, repo.name, pr.number);
        res.type("text/plain").send(diff);
    } catch (err) {
        res.status(err.status || 500).json({ error: err.message });
    }
};

// GET /api/prs/:prId/timeline
exports.getPrTimeline = (req, res) => {
    const pr = findPr(req.params.prId);
    if (!pr) return res.status(404).json({ error: "PR not found" });

    const reviews = store.reviews
        .filter((r) => r.prId === pr._id)
        .map((r) => ({
            type: "review",
            actor: r.reviewer,
            action: r.decision,
            comment: r.comment,
            createdAt: r.createdAt,
        }));

    res.json({ prId: pr._id, timeline: reviews });
};

// POST /api/prs/:prId/merge
exports.mergePr = (req, res) => {
    const pr = findPr(req.params.prId);
    if (!pr) return res.status(404).json({ error: "PR not found" });
    if (pr.status === "merged") return res.status(400).json({ error: "Already merged" });
    if (pr.status === "closed") return res.status(400).json({ error: "Cannot merge closed PR" });

    pr.status = "merged";
    pr.mergedAt = now();
    pr.updatedAt = now();
    res.json({ message: "PR merged", pr });
};

// POST /api/prs/:prId/close
exports.closePr = (req, res) => {
    const pr = findPr(req.params.prId);
    if (!pr) return res.status(404).json({ error: "PR not found" });
    if (pr.status === "merged") return res.status(400).json({ error: "Cannot close merged PR" });

    pr.status = "closed";
    pr.updatedAt = now();
    res.json({ message: "PR closed", pr });
};

// POST /api/prs/:prId/reopen
exports.reopenPr = (req, res) => {
    const pr = findPr(req.params.prId);
    if (!pr) return res.status(404).json({ error: "PR not found" });
    if (pr.status !== "closed") return res.status(400).json({ error: "Only closed PRs can be reopened" });

    pr.status = "open";
    pr.updatedAt = now();
    res.json({ message: "PR reopened", pr });
};

// POST /api/prs/:prId/reviews
exports.submitReview = (req, res) => {
    const pr = findPr(req.params.prId);
    if (!pr) return res.status(404).json({ error: "PR not found" });

    const { decision, comment, reviewer } = req.body;
    const valid = ["approve", "request_changes", "comment"];
    if (!decision || !valid.includes(decision)) {
        return res.status(400).json({ error: `decision must be one of: ${valid.join(", ")}` });
    }

    const review = {
        _id: newId(),
        prId: pr._id,
        reviewer: reviewer || "anonymous",
        decision,
        comment: comment || "",
        createdAt: now(),
    };
    store.reviews.push(review);
    res.status(201).json(review);
};

// GET /api/prs/:prId/reviews
exports.listReviews = (req, res) => {
    const pr = findPr(req.params.prId);
    if (!pr) return res.status(404).json({ error: "PR not found" });
    res.json(store.reviews.filter((r) => r.prId === pr._id));
};

// POST /api/prs/:prId/tags
exports.addTag = (req, res) => {
    const pr = findPr(req.params.prId);
    if (!pr) return res.status(404).json({ error: "PR not found" });

    const { tag } = req.body;
    if (!tag) return res.status(400).json({ error: "tag is required" });

    if (!pr.tags.includes(tag)) {
        pr.tags.push(tag);
        pr.updatedAt = now();
    }
    res.json({ message: "Tag added", tags: pr.tags });
};

// DELETE /api/prs/:prId/tags/:tag
exports.removeTag = (req, res) => {
    const pr = findPr(req.params.prId);
    if (!pr) return res.status(404).json({ error: "PR not found" });

    const idx = pr.tags.indexOf(req.params.tag);
    if (idx === -1) return res.status(404).json({ error: "Tag not found" });

    pr.tags.splice(idx, 1);
    pr.updatedAt = now();
    res.json({ message: "Tag removed", tags: pr.tags });
};
