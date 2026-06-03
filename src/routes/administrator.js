const router = require("express").Router();
const rateLimit = require("express-rate-limit");

const {
  administatorLogin,
  handleCreateDesignation,
  handleGetDesignations,
  handleCreateSubDepartment,
  handleGetSubDepartments,
  handleDeleteSubDepartment,
  handleGetDepartments,
  handleCreateDepartment,
  handleDeleteDepartment,
  handleCreateLogin,
  handleGetLogins,
  handleUpdatePassword,
  handleDeleteLogin,
} = require("../controllers/administratorController");
const { authenticate } = require("../middleware/auth");

// Stricter rate-limit for login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  message: { success: false, message: "Too many login attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/login", loginLimiter, administatorLogin); //complete this route only currently

router.get("/departments", handleGetDepartments);

router.post("/departments", handleCreateDepartment);

router.delete("/departments/:id", handleDeleteDepartment);

router.post("/designations", handleCreateDesignation)

router.get("/designations", handleGetDesignations);

router.post("/sub-departments", handleCreateSubDepartment);

router.get("/sub-departments", handleGetSubDepartments);

router.delete("/sub-departments/:id", handleDeleteSubDepartment);

router.post("/department-login", handleCreateLogin);

router.get("/department-login", handleGetLogins);

router.put("/department-login/:id", handleUpdatePassword);

router.delete("/department-login/:id", handleDeleteLogin);




// router.post("/refresh", refresh);
// router.post("/logout", logout);

module.exports = router;