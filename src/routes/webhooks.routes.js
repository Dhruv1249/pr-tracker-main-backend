const { Router } = require("express");
const ctrl = require("../controllers/webhooks.controller");

const router = Router();

router.post("/api/webhooks/github", ctrl.handleGithubWebhook);

module.exports = router;
