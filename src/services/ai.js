// ---------------------------------------------------------------------------
// AI Agent HTTP client — calls the AI agent via the service-router gateway
// ---------------------------------------------------------------------------

const axios = require("axios");

const PROXY = process.env.PROXY_URL || "http://localhost:5003";

const aiClient = axios.create({
    baseURL: PROXY,
    headers: { "Content-Type": "application/json" },
    timeout: 60000, // AI calls can be slow
});

/**
 * Send a diff to the AI agent for code review.
 * Returns the review text string.
 */
async function getAIReview(diff) {
    const { data } = await aiClient.post("/api/ai/review", { content: diff });
    // data.review is now a structured JSON object: { summary, bugs, codeQuality, performance, inlineFeedback }
    return data.review;
}

/**
 * Send a diff to the AI agent for risk assessment.
 * Returns { riskLevel: "low"|"medium"|"high", reason: string }
 */
async function getAIRisk(diff) {
    const { data } = await aiClient.post("/api/ai/risk", { content: diff });
    return data; // { riskLevel, reason }
}

/**
 * Send a diff to the AI agent for security detection.
 * Returns { status: "clean"|"flagged", flags: string[] }
 */
async function getAISecurity(diff) {
    const { data } = await aiClient.post("/api/ai/security", { content: diff });
    return data; // { status, flags }
}

/**
 * Run full AI analysis (review + risk + security) on a PR diff.
 * Returns an object with all results.
 */
async function analyzeFullPR(diff) {
    const [review, risk, security] = await Promise.allSettled([
        getAIReview(diff),
        getAIRisk(diff),
        getAISecurity(diff),
    ]);

    return {
        aiReview: review.status === "fulfilled" ? review.value : null,
        riskLevel: risk.status === "fulfilled" ? risk.value.riskLevel : null,
        riskReason: risk.status === "fulfilled" ? risk.value.reason : null,
        securityStatus: security.status === "fulfilled" ? security.value.status : null,
        securityFlags: security.status === "fulfilled" ? security.value.flags : [],
        aiAnalyzedAt: new Date().toISOString(),
    };
}

module.exports = {
    getAIReview,
    getAIRisk,
    getAISecurity,
    analyzeFullPR,
};
