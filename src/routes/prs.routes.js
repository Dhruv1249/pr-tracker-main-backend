const { Router } = require("express");
const ctrl = require("../controllers/prs.controller");

const router = Router();

// Details
router.get("/api/prs/:prId", ctrl.getPrDetails);
router.get("/api/prs/:prId/diff", ctrl.getPrDiff);

router.get("/api/prs/:prId/conflicts", ctrl.checkConflicts);

// Lifecycle
router.post("/api/prs/:prId/merge", ctrl.mergePr);
router.post("/api/prs/:prId/close", ctrl.closePr);
router.post("/api/prs/:prId/reopen", ctrl.reopenPr);

// Reviews
router.post("/api/prs/:prId/reviews", ctrl.submitReview);
router.get("/api/prs/:prId/reviews", ctrl.listReviews);

// Tags
router.post("/api/prs/:prId/tags", ctrl.addTag);
router.delete("/api/prs/:prId/tags/:tag", ctrl.removeTag);

// AI Analysis
router.post("/api/prs/:prId/analyze", ctrl.analyzePr);

module.exports = router;
