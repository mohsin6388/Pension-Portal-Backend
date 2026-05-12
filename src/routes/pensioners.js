const router = require("express").Router();
const { authenticate, authorize, auditLog } = require("../middleware/auth");
const {
  listPensioners,
  // getPensioner,
  getPensionerById,
  createPensioner,
  getDepartmentPensioners,
  getAdminPendingPensioners,
  getAdminPendingPensionersByRole,
  handleAdminAllRecords,
  handleAdminAction,
  updatePensioner,
  downloadActivityLogsCSV,
  getFullApprovedPensioners,
  getDepartmentPensionersByAdmin,
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



//========= Admin wise pensioner pending  detail ===========//
router.get("/admin/pending/:role", getAdminPendingPensionersByRole);






// =========== Admin can view all pensioner records for management  =========== //
router.get("/admin/records", handleAdminAllRecords);






//============= Admin can approve or reject pensioner applications  =============//
router.post("/action", handleAdminAction);








// ============  CFO Download pensioner data in CSV format  ============//
   router.get("/activity-logs/download", downloadActivityLogsCSV);







// ===========  All FUll Approved PPO ===============================

router.get("/approved/all", getFullApprovedPensioners);



// ============ Department-wise pensioner stats for Admin Dashboard ===============================
router.get("/department/:departmentId", getDepartmentPensioners);




// ============ Department-wise pensioner stats for Admin Dashboard (Admin-only) ===============================

router.get("/admin/department/:departmentId", getDepartmentPensionersByAdmin);





























// All pensioner routes require authentication
// router.use(authenticate);

router.get("/stats", getStats);

router.put("/update/:ppo_no",
  //  authorize("admin", "clerk"), auditLog("UPDATE_PENSIONER"), 
   updatePensioner);

module.exports = router;
