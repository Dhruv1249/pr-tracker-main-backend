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
    // 1. Extract JWT from Authorization header or cookie
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
    }
    if (!token && req.cookies?.token) {
        token = req.cookies.token;
    }

    console.log("token in core:", token ? "present" : "missing");

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            console.log("decoded JWT:", decoded);

            if (decoded.githubId) {
                console.log("running query..")
                const user = await db.getUserByGithubId(decoded.githubId, req);
                console.log("db user:", user ? "found" : "not found");
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
