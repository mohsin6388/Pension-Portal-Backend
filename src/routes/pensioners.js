const router = require("express").Router();
const { authenticate, authorize, auditLog } = require("../middleware/auth");
const {
  listPensioners,
  getPensioner,
  createPensioner,
  getDepartmentPensioners,
  getAdminPendingPensioners,
  handleAdminAllRecords,
  handleAdminAction,
  updatePensioner,
  getStats,
} = require("../controllers/pensionerController");
const multer = require("multer");
const upload = require("../middleware/upload");
// const upload = multer(); 

// All pensioner routes require authentication
// router.use(authenticate);

router.get("/stats", getStats);
router.get("/", listPensioners);
router.get("/:id", getPensioner);

// Clerks and admins can create/update

router.get("/admin/pending", getAdminPendingPensioners);

router.post("/action", handleAdminAction);
router.get("/admin/records", handleAdminAllRecords)


// router.post("/", authorize("admin", "clerk"), auditLog("CREATE_PENSIONER"), createPensioner);
router.post("/",  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "signature", maxCount: 1 },
    { name: "salarySlip", maxCount: 1 },
    { name: "deathCertificate", maxCount: 1 },
  ]), createPensioner);

router.get("/department/:departmentId", getDepartmentPensioners);
router.put("/:id", authorize("admin", "clerk"), auditLog("UPDATE_PENSIONER"), updatePensioner);

module.exports = router;
