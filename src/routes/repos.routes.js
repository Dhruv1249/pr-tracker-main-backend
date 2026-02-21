const { Router } = require("express");
const ctrl = require("../controllers/repos.controller");

const router = Router();

router.get("/api/repos", ctrl.listRepos);
router.get("/api/repos/tracked", ctrl.listTrackedRepos);
router.post("/api/repos/track", ctrl.trackRepo);
router.delete("/api/repos/track/:repoId", ctrl.untrackRepo);
router.get("/api/repos/:repoId/prs", ctrl.listPrsForRepo);
router.post("/api/repos/:repoId/sync", ctrl.syncRepo);
router.get("/api/repos/:owner/:name", ctrl.getRepoDetails);

module.exports = router;
