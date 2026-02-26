// ---------------------------------------------------------------------------
// HTTP client for the pr-tracker-mongodb data service.
// All calls go through the service-router gateway (PROXY_URL).
// ---------------------------------------------------------------------------

const axios = require("axios");

const PROXY = process.env.PROXY_URL;

const client = axios.create({
    baseURL: PROXY,
});

async function dbFetch(method, path, data, req) {
    try {
        // Only forward auth-related headers, not the entire browser header set
        // (forwarding host, content-length, origin etc. breaks service-to-service calls)
        const forwardHeaders = {};
        if (req?.headers?.authorization) {
            forwardHeaders.authorization = req.headers.authorization;
        }
        if (req?.headers?.cookie) {
            forwardHeaders.cookie = req.headers.cookie;
        }

        const config = {
            method,
            url: path,
            headers: forwardHeaders,
        };

        // Only include body for methods that support it (not GET/DELETE)
        if (data && !["get", "delete", "head"].includes(method.toLowerCase())) {
            config.data = data;
        }

        const res = await client(config);

        return res.data.data ?? res.data;
    } catch (err) {
        const status = err.response?.status || 500;
        const message = err.response?.data?.error || err.message;
        console.error(`[dbFetch] ${method.toUpperCase()} ${path} → ${status}: ${message}`);
        const error = new Error(message);
        error.status = status;
        throw error;
    }
}

// ---- Repositories (proxied at /api/repositories) ----

async function createRepo(data) {
    return dbFetch("post", "/api/repositories", data);
}

async function getRepoById(id) {
    return dbFetch("get", `/api/repositories/${id}`);
}

async function getRepoByGithubId(githubId) {
    return dbFetch("get", `/api/repositories/github/${githubId}`);
}

async function getRepoByFullName(fullName) {
    return dbFetch("get", `/api/repositories/fullname/${encodeURIComponent(fullName)}`);
}

async function getAllRepos() {
    return dbFetch("get", "/api/repositories");
}

async function updateRepo(githubId, data) {
    return dbFetch("put", `/api/repositories/github/${githubId}`, data);
}

// ---- Pull Requests (proxied at /api/pullrequests) ----

async function createPR(data) {
    return dbFetch("post", "/api/pullrequests", data);
}

async function getPRById(id) {
    return dbFetch("get", `/api/pullrequests/${id}`);
}

async function getPRByGithubId(githubId) {
    return dbFetch("get", `/api/pullrequests/github/${githubId}`);
}

async function getPRsByRepository(repositoryId) {
    return dbFetch("get", `/api/pullrequests/repository/${repositoryId}`);
}

async function getPRsByState(state) {
    return dbFetch("get", `/api/pullrequests/state/${state}`);
}

async function getAllPRs() {
    return dbFetch("get", "/api/pullrequests");
}

async function updatePR(githubId, data) {
    return dbFetch("put", `/api/pullrequests/github/${githubId}`, data);
}

async function mergePRInDb(githubId) {
    return dbFetch("put", `/api/pullrequests/github/${githubId}/merge`);
}

async function closePRInDb(githubId) {
    return dbFetch("put", `/api/pullrequests/github/${githubId}/close`);
}

async function reopenPRInDb(githubId) {
    return dbFetch("put", `/api/pullrequests/github/${githubId}/reopen`);
}

// ---- Reviews (proxied at /api/reviews) ----

async function createReview(data) {
    return dbFetch("post", "/api/reviews", data);
}

async function getReviewsByPR(pullRequestId) {
    return dbFetch("get", `/api/reviews/pullrequest/${pullRequestId}`);
}

async function getAllReviews() {
    return dbFetch("get", "/api/reviews");
}

// ---- Users (proxied at /api/db/users → mongodb's /api/users) ----

async function createUser(data) {
    return dbFetch("post", "/api/db/users", data);
}

async function getUserByGithubId(githubId, req) {
    const data = {};
    return dbFetch("get", `/api/db/users/github/${githubId}`, data, req);
}

async function updateUser(githubId, data) {
    return dbFetch("put", `/api/db/users/github/${githubId}`, data);
}

module.exports = {
    createRepo,
    getRepoById,
    getRepoByGithubId,
    getRepoByFullName,
    getAllRepos,
    updateRepo,
    createPR,
    getPRById,
    getPRByGithubId,
    getPRsByRepository,
    getPRsByState,
    getAllPRs,
    updatePR,
    mergePRInDb,
    closePRInDb,
    reopenPRInDb,
    createReview,
    getReviewsByPR,
    getAllReviews,
    createUser,
    getUserByGithubId,
    updateUser,
};
