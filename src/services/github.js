// ---------------------------------------------------------------------------
// GitHub REST API helper
// Uses native fetch (Node 18+). If a GITHUB_TOKEN is set it's sent as a
// Bearer token — this raises rate limits from 60 → 5 000 req/hr and lets
// us access private repos the token has access to.
// ---------------------------------------------------------------------------

const BASE = "https://api.github.com";

function headers() {
    const h = {
        Accept: "application/vnd.github+json",
        "User-Agent": "pr-tracker-core",
    };
    if (process.env.GITHUB_TOKEN) {
        h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    return h;
}

async function ghFetch(path) {
    const res = await fetch(`${BASE}${path}`, { headers: headers() });
    if (!res.ok) {
        const body = await res.text();
        const err = new Error(`GitHub API ${res.status}: ${body}`);
        err.status = res.status;
        throw err;
    }
    return res.json();
}

/** List repos the authenticated user has access to (needs token) */
async function listUserRepos(page = 1, perPage = 30) {
    return ghFetch(`/user/repos?sort=updated&per_page=${perPage}&page=${page}`);
}

/** Get a single repo */
async function getRepo(owner, name) {
    return ghFetch(`/repos/${owner}/${name}`);
}

/** List open PRs for a repo */
async function listPullRequests(owner, name, state = "open", page = 1, perPage = 30) {
    return ghFetch(
        `/repos/${owner}/${name}/pulls?state=${state}&per_page=${perPage}&page=${page}`
    );
}

/** Get a single PR */
async function getPullRequest(owner, name, prNumber) {
    return ghFetch(`/repos/${owner}/${name}/pulls/${prNumber}`);
}

/** Get PR diff (raw patch) */
async function getPullRequestDiff(owner, name, prNumber) {
    const res = await fetch(
        `${BASE}/repos/${owner}/${name}/pulls/${prNumber}`,
        {
            headers: {
                ...headers(),
                Accept: "application/vnd.github.diff",
            },
        }
    );
    if (!res.ok) {
        const body = await res.text();
        const err = new Error(`GitHub API ${res.status}: ${body}`);
        err.status = res.status;
        throw err;
    }
    return res.text();
}

/** List reviews for a PR */
async function listPrReviews(owner, name, prNumber) {
    return ghFetch(`/repos/${owner}/${name}/pulls/${prNumber}/reviews`);
}

module.exports = {
    listUserRepos,
    getRepo,
    listPullRequests,
    getPullRequest,
    getPullRequestDiff,
    listPrReviews,
};
