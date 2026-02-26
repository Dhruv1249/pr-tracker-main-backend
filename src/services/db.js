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

async function createRepo(data, req) {
    return dbFetch("post", "/api/repositories", data, req);
}

async function getRepoById(id, req) {
    return dbFetch("get", `/api/repositories/${id}`, null, req);
}

async function getRepoByGithubId(githubId, req) {
    return dbFetch("get", `/api/repositories/github/${githubId}`, null, req);
}

async function getRepoByFullName(fullName, req) {
    return dbFetch("get", `/api/repositories/fullname/${encodeURIComponent(fullName)}`, null, req);
}

async function getAllRepos(req) {
    return dbFetch("get", "/api/repositories", null, req);
}

async function updateRepo(githubId, data, req) {
    return dbFetch("put", `/api/repositories/github/${githubId}`, data, req);
}

async function importRepositories(repoIds, req) {
    return dbFetch("post", "/api/repositories/import", { repoIds }, req);
}

// ---- Pull Requests (proxied at /api/pullrequests) ----

async function createPR(data, req) {
    return dbFetch("post", "/api/pullrequests", data, req);
}

async function getPRById(id, req) {
    return dbFetch("get", `/api/pullrequests/${id}`, null, req);
}

async function getPRByGithubId(githubId, req) {
    return dbFetch("get", `/api/pullrequests/github/${githubId}`, null, req);
}

async function getPRsByRepository(repositoryId, req) {
    return dbFetch("get", `/api/pullrequests/repository/${repositoryId}`, null, req);
}

async function getPRsByState(state, req) {
    return dbFetch("get", `/api/pullrequests/state/${state}`, null, req);
}

async function getAllPRs(req) {
    return dbFetch("get", "/api/pullrequests", null, req);
}

async function updatePR(githubId, data, req) {
    return dbFetch("put", `/api/pullrequests/github/${githubId}`, data, req);
}

async function mergePRInDb(githubId, req) {
    return dbFetch("put", `/api/pullrequests/github/${githubId}/merge`, null, req);
}

async function closePRInDb(githubId, req) {
    return dbFetch("put", `/api/pullrequests/github/${githubId}/close`, null, req);
}

async function reopenPRInDb(githubId, req) {
    return dbFetch("put", `/api/pullrequests/github/${githubId}/reopen`, null, req);
}

// ---- Reviews (proxied at /api/reviews) ----

async function createReview(data, req) {
    return dbFetch("post", "/api/reviews", data, req);
}

async function getReviewsByPR(pullRequestId, req) {
    return dbFetch("get", `/api/reviews/pullrequest/${pullRequestId}`, null, req);
}

async function getAllReviews(req) {
    return dbFetch("get", "/api/reviews", null, req);
}

// ---- Users (proxied at /api/db/users → mongodb's /api/users) ----

async function createUser(data, req) {
    return dbFetch("post", "/api/db/users", data, req);
}

async function getUserByGithubId(githubId, req) {
    const data = {};
    return dbFetch("get", `/api/db/users/github/${githubId}`, data, req);
}

async function updateUser(githubId, data, req) {
    return dbFetch("put", `/api/db/users/github/${githubId}`, data, req);
}

module.exports = {
    createRepo,
    getRepoById,
    getRepoByGithubId,
    getRepoByFullName,
    getAllRepos,
    updateRepo,
    importRepositories,
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
