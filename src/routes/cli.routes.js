const { Router } = require("express");
const ctrl = require("../controllers/cli.controller");

const router = Router();

router.post("/api/cli/login", ctrl.cliLogin);
router.get("/api/cli/status", ctrl.cliStatus);
router.post("/api/cli/pr/:prId/merge", ctrl.cliMerge);
router.post("/api/cli/repos/track", ctrl.cliTrackRepo);

module.exports = router;
