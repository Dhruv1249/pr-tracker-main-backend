const crypto = require("crypto");
const db = require("../services/db");

// POST /api/webhooks/github
exports.handleGithubWebhook = async (req, res) => {
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

    try {
        if (event === "pull_request") {
            const ghPr = payload.pull_request;
            const ghRepo = payload.repository;

            // Find tracked repo by fullName
            let trackedRepo;
            try {
                trackedRepo = await db.getRepoByFullName(ghRepo.full_name);
            } catch (e) {
                if (e.status === 404) {
                    return res.status(200).json({ received: true, ignored: "repo not tracked" });
                }
                throw e;
            }

            let state = "open";
            if (ghPr.merged) state = "merged";
            else if (ghPr.state === "closed") state = "closed";
            else if (ghPr.draft) state = "draft";

            // Try to find existing PR
            let existingPr = null;
            try {
                existingPr = await db.getPRByGithubId(ghPr.id);
            } catch (e) {
                if (e.status !== 404) throw e;
            }

            if (existingPr) {
                await db.updatePR(ghPr.id, {
                    title: ghPr.title,
                    state,
                    updatedAtGithub: new Date().toISOString(),
                    mergedAt: state === "merged" ? ghPr.merged_at || new Date().toISOString() : undefined,
                });
            } else {
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
                    repository: trackedRepo._id,
                    repositoryFullName: ghRepo.full_name,
                    baseBranch: ghPr.base.ref,
                    headBranch: ghPr.head.ref,
                    url: ghPr.html_url,
                    createdAtGithub: ghPr.created_at || new Date().toISOString(),
                    updatedAtGithub: new Date().toISOString(),
                    mergedAt: state === "merged" ? ghPr.merged_at || new Date().toISOString() : null,
                });
            }
        }

        if (event === "pull_request_review") {
            const ghReview = payload.review;
            let pr = null;
            try {
                pr = await db.getPRByGithubId(payload.pull_request.id);
            } catch (e) {
                // PR not tracked, ignore
            }

            if (pr) {
                await db.createReview({
                    githubId: ghReview.id,
                    pullRequest: pr._id,
                    pullRequestNumber: pr.number,
                    user: {
                        login: ghReview.user.login,
                        avatarUrl: ghReview.user.avatar_url,
                        githubId: ghReview.user.id,
                    },
                    state: ghReview.state.toUpperCase(),
                    body: ghReview.body || "",
                    submittedAt: ghReview.submitted_at || new Date().toISOString(),
                });
            }
        }

        res.status(200).json({ received: true });
    } catch (err) {
        console.error("[Webhook Error]", err.message);
        res.status(500).json({ error: err.message });
    }
};
