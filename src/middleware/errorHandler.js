// ---------------------------------------------------------------------------
// Async handler wrapper — catches rejections so we don't need try/catch
// in every controller.
// ---------------------------------------------------------------------------

function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

// Express error-handling middleware (4-arg signature)
function errorHandler(err, req, res, _next) {
    console.error(`[ERROR] ${err.message}`);
    if (process.env.NODE_ENV === "development") {
        console.error(err.stack);
    }
    res.status(err.status || 500).json({
        error: err.message || "Internal server error",
    });
}

module.exports = { asyncHandler, errorHandler };
