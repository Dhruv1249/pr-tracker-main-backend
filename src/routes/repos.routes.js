const { Router } = require("express");
const ctrl = require("../controllers/repos.controller");

const router = Router();

router.get("/api/repos", ctrl.listRepos);
router.get("/api/repos/tracked", ctrl.listTrackedRepos);
router.post("/api/repos/track", ctrl.trackRepo);
router.delete("/api/repos/track/:repoId", ctrl.untrackRepo);
router.get("/api/repos/:repoId/prs", ctrl.listPrsForRepo);
router.post("/api/repos/:repoId/sync", ctrl.syncRepo);
// Must be before /:owner/:name to match correctly
router.get("/api/repos/:owner/:name/pulls/:number/files", ctrl.listPrFilesByNumber);
router.get("/api/repos/:owner/:name/pulls/:number/commits", ctrl.listPrCommitsByNumber);
router.get("/api/repos/:owner/:name/pulls/:number/comments", ctrl.listPrCommentsByNumber);
router.get("/api/repos/:owner/:name/pulls/:number", ctrl.getPrByNumber);
router.post("/api/repos/:owner/:name/pulls/:number/analyze", ctrl.analyzePrByNumber);
router.get("/api/repos/:owner/:name/pulls", ctrl.listRepoPulls);
router.get("/api/repos/:owner/:name", ctrl.getRepoDetails);

module.exports = router;


module.exports = router;

