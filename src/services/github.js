// ---------------------------------------------------------------------------
// GitHub REST API helper
// All functions accept an optional `token` parameter. When provided, it's
// used as the Bearer token for GitHub API calls. This enables per-user
// authentication using the user's stored OAuth token.
// Falls back to GITHUB_TOKEN env var if no token is passed.
// ---------------------------------------------------------------------------

const BASE = "https://api.github.com";

function headers(token) {
    const h = {
        Accept: "application/vnd.github+json",
        "User-Agent": "pr-tracker-core",
    };
    const t = token || process.env.GITHUB_TOKEN;
    if (t) {
        h.Authorization = `Bearer ${t}`;
    }
    return h;
}

async function ghFetch(path, token, opts = {}) {
    const res = await fetch(`${BASE}${path}`, {
        headers: { ...headers(token), ...opts.headers },
        ...opts,
    });
    if (!res.ok) {
        const body = await res.text();
        const err = new Error(`GitHub API ${res.status}: ${body}`);
        err.status = res.status;
        throw err;
    }
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) return res.json();
    return res.text();
}

/** List repos the authenticated user has access to */
async function listUserRepos(page = 1, perPage = 30, token) {
    return ghFetch(`/user/repos?sort=updated&per_page=${perPage}&page=${page}`, token);
}

/** Get a single repo */
async function getRepo(owner, name, token) {
    return ghFetch(`/repos/${owner}/${name}`, token);
}

/** List PRs for a repo */
async function listPullRequests(owner, name, state = "all", page = 1, perPage = 30, token) {
    return ghFetch(
        `/repos/${owner}/${name}/pulls?state=${state}&per_page=${perPage}&page=${page}`,
        token
    );
}

/** Get a single PR */
async function getPullRequest(owner, name, prNumber, token) {
    return ghFetch(`/repos/${owner}/${name}/pulls/${prNumber}`, token);
}

/** Get PR diff (raw patch) */
async function getPullRequestDiff(owner, name, prNumber, token) {
    return ghFetch(`/repos/${owner}/${name}/pulls/${prNumber}`, token, {
        headers: { Accept: "application/vnd.github.diff" },
    });
}

/** List reviews for a PR */
async function listPrReviews(owner, name, prNumber, token) {
    return ghFetch(`/repos/${owner}/${name}/pulls/${prNumber}/reviews`, token);
}

/** List files changed in a PR (includes per-file patches) */
async function listPrFiles(owner, name, prNumber, token) {
    return ghFetch(`/repos/${owner}/${name}/pulls/${prNumber}/files?per_page=100`, token);
}

/** List commits in a PR */
async function listPrCommits(owner, name, prNumber, token) {
    return ghFetch(`/repos/${owner}/${name}/pulls/${prNumber}/commits?per_page=100`, token);
}

/** List issue-level comments on a PR (the general discussion thread) */
async function listPrComments(owner, name, prNumber, token) {
    return ghFetch(`/repos/${owner}/${name}/issues/${prNumber}/comments?per_page=100`, token);
}

/** List inline review comments on a PR (code-level comments) */
async function listPrReviewComments(owner, name, prNumber, token) {
    return ghFetch(`/repos/${owner}/${name}/pulls/${prNumber}/comments?per_page=100`, token);
}

/** Merge a PR */
async function mergePullRequest(owner, name, prNumber, token, commitTitle = "") {
    return ghFetch(`/repos/${owner}/${name}/pulls/${prNumber}/merge`, token, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            commit_title: commitTitle || `Merge PR #${prNumber}`,
        }),
    });
}

/** Close a PR */
async function closePullRequest(owner, name, prNumber, token) {
    return ghFetch(`/repos/${owner}/${name}/pulls/${prNumber}`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: "closed" }),
    });
}

/** Reopen a closed PR */
async function reopenPullRequest(owner, name, prNumber, token) {
    return ghFetch(`/repos/${owner}/${name}/pulls/${prNumber}`, token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: "open" }),
    });
}

/** Create a PR review */
async function createPrReview(owner, name, prNumber, event, bodyText, token) {
    return ghFetch(`/repos/${owner}/${name}/pulls/${prNumber}/reviews`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, body: bodyText }),
    });
}

/** Register a webhook on a repo for PR events */
async function createRepoWebhook(owner, name, token) {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) {
        console.warn("[github] WEBHOOK_URL not set, skipping webhook registration");
        return null;
    }

    try {
        return await ghFetch(`/repos/${owner}/${name}/hooks`, token, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "web",
                active: true,
                events: ["pull_request", "pull_request_review"],
                config: {
                    url: webhookUrl,
                    content_type: "json",
                    secret: process.env.GITHUB_WEBHOOK_SECRET || "",
                    insecure_ssl: "0",
                },
            }),
        });
    } catch (err) {
        // 422 = webhook already exists, that's fine
        if (err.status === 422) {
            console.log(`[github] Webhook already exists on ${owner}/${name}`);
            return null;
        }
        throw err;
    }
}

module.exports = {
    listUserRepos,
    getRepo,
    listPullRequests,
    getPullRequest,
    getPullRequestDiff,
    listPrReviews,
    listPrFiles,
    listPrCommits,
    listPrComments,
    listPrReviewComments,
    mergePullRequest,
    closePullRequest,
    reopenPullRequest,
    createPrReview,
    createRepoWebhook,
};
