const router = require("express").Router();
const { authenticate, authorize, auditLog } = require("../middleware/auth");
const {
  stopPension,
  resumePension,
  closePension,
  listActions,
  approveAction,
  rejectAction,
} = require("../controllers/pensionActionController");

router.use(authenticate);

// View all actions
router.get("/", listActions);

// Clerks and admins submit actions
router.post("/stop",   authorize("admin", "clerk"), auditLog("PENSION_STOP_REQUEST"),   stopPension);
router.post("/resume", authorize("admin", "clerk"), auditLog("PENSION_RESUME_REQUEST"), resumePension);
router.post("/close",  authorize("admin", "clerk"), auditLog("PENSION_CLOSE_REQUEST"),  closePension);

// Only CFO (and admin) can approve / reject
router.put("/:actionId/approve", authorize("admin", "cfo"), auditLog("ACTION_APPROVED"), approveAction);
router.put("/:actionId/reject",  authorize("admin", "cfo"), auditLog("ACTION_REJECTED"),  rejectAction);

module.exports = router;
