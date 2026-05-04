const router = require("express").Router();
const { authenticate, authorize } = require("../middleware/auth");
const { uploadDocument, listDocuments } = require("../controllers/documentController");

router.use(authenticate);

router.post("/upload/:ppo", authorize("admin", "clerk"), uploadDocument);
router.get("/:ppo", listDocuments);

module.exports = router;
