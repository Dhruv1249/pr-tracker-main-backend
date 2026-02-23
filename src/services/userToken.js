// ---------------------------------------------------------------------------
// Extracts the user's GitHub token from JWT → MongoDB → decrypt.
// Attaches `req.githubToken` for use by controllers.
// Falls back to env GITHUB_TOKEN if no JWT is present (dev/CLI mode).
// ---------------------------------------------------------------------------

const jwt = require("jsonwebtoken");
const db = require("./db");
const { decrypt } = require("./decrypt");

const JWT_SECRET = process.env.JWT_SECRET;

async function resolveGithubToken(req) {
    // 1. Try JWT from Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
            const token = authHeader.split(" ")[1];
            const decoded = jwt.verify(token, JWT_SECRET);

            if (decoded.githubId) {
                const user = await db.getUserByGithubId(decoded.githubId);
                if (user && user.accessTokenEncrypted) {
                    return decrypt(user.accessTokenEncrypted);
                }
            }
        } catch (err) {
            console.warn("[resolveGithubToken] JWT decode failed, falling back to env token:", err.message);
        }
    }

    // 2. Fallback to env token (for dev/CLI/webhook use)
    if (process.env.GITHUB_TOKEN) {
        return process.env.GITHUB_TOKEN;
    }

    return null;
}

module.exports = { resolveGithubToken };
