const { Router } = require("express");
const ctrl = require("../controllers/dashboard.controller");

const router = Router();

router.get("/api/dashboard/stats", ctrl.getStats);
router.get("/api/dashboard/recent-prs", ctrl.getRecentPrs);

module.exports = router;
