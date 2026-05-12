const router = require("express").Router();
const { authenticate, authorize, auditLog } = require("../middleware/auth");
const {
  listPensioners,
  // getPensioner,
  getPensionerById,
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



//======= Operator create the employee pension details  ========//
// router.post("/", authorize("admin", "clerk"), auditLog("CREATE_PENSIONER"), createPensioner);
router.post("/",  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "signature", maxCount: 1 },
    { name: "salarySlip", maxCount: 1 },
    { name: "deathCertificate", maxCount: 1 },
  ]), createPensioner);





// ========== Operator View List the employee pension details  ========== //
router.get("/", listPensioners);





// =========== Operator, Admin, and CFO can view particular employee pension details  =========== //
router.get("/:id",  authenticate,

  // authorize("operator", "super_admin_1", "super_admin_2"), 
  getPensionerById);





// =========== Admin can view pending pensioners for approval  =========== //
router.get("/admin/pending", getAdminPendingPensioners);






// =========== Admin can view all pensioner records for management  =========== //
router.get("/admin/records", handleAdminAllRecords);






//============= Admin can approve or reject pensioner applications  =============//
router.post("/action", handleAdminAction);































// All pensioner routes require authentication
// router.use(authenticate);

router.get("/stats", getStats);

router.get("/department/:departmentId", getDepartmentPensioners);

router.put("/update/:ppo_no",
  //  authorize("admin", "clerk"), auditLog("UPDATE_PENSIONER"), 
   updatePensioner);

module.exports = router;
