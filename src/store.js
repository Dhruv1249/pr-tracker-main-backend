const crypto = require("crypto");

const store = {
    repos: [],
    pullRequests: [],
    reviews: [],
};

function newId() {
    return crypto.randomUUID();
}

function now() {
    return new Date().toISOString();
}

module.exports = { store, newId, now };
