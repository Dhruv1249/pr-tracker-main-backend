const crypto = require("crypto");
const { store, newId, now } = require("../store");

// POST /api/webhooks/github
exports.handleGithubWebhook = (req, res) => {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (secret) {
        const sig = req.headers["x-hub-signature-256"];
        if (!sig) return res.status(401).json({ error: "Missing signature" });

        const hmac = crypto.createHmac("sha256", secret).update(JSON.stringify(req.body)).digest("hex");
        if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(`sha256=${hmac}`))) {
            return res.status(401).json({ error: "Invalid signature" });
        }
    }

    const event = req.headers["x-github-event"];
    const payload = req.body;

    if (event === "pull_request") {
        const ghPr = payload.pull_request;
        const repo = payload.repository;

        let trackedRepo = store.repos.find((r) => r.fullName === repo.full_name);
        if (!trackedRepo) return res.status(200).json({ received: true, ignored: "repo not tracked" });

        let status = "open";
        if (ghPr.merged) status = "merged";
        else if (ghPr.state === "closed") status = "closed";
        else if (ghPr.draft) status = "draft";

        let pr = store.pullRequests.find((p) => p.repoId === trackedRepo._id && p.githubPrId === ghPr.id);

        if (pr) {
            pr.title = ghPr.title;
            pr.status = status;
            pr.lastCommitSha = ghPr.head.sha;
            pr.updatedAt = now();
            if (status === "merged") pr.mergedAt = ghPr.merged_at || now();
        } else {
            store.pullRequests.push({
                _id: newId(),
                repoId: trackedRepo._id,
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
                createdAt: ghPr.created_at || now(),
                updatedAt: now(),
                mergedAt: status === "merged" ? ghPr.merged_at || now() : null,
            });
        }
    }

    if (event === "pull_request_review") {
        const ghReview = payload.review;
        const pr = store.pullRequests.find((p) => p.githubPrId === payload.pull_request.id);

        if (pr) {
            let decision = "comment";
            if (ghReview.state === "APPROVED") decision = "approve";
            else if (ghReview.state === "CHANGES_REQUESTED") decision = "request_changes";

            store.reviews.push({
                _id: newId(),
                prId: pr._id,
                reviewer: ghReview.user.login,
                decision,
                comment: ghReview.body || "",
                createdAt: ghReview.submitted_at || now(),
            });
        }
    }

    res.status(200).json({ received: true });
};
