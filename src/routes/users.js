const router = require("express").Router();
const { authenticate, authorize } = require("../middleware/auth");
const { listUsers, createUser, toggleUserActive } = require("../controllers/userController");

router.use(authenticate);
router.use(authorize("admin")); // Only admin can manage users

router.get("/", listUsers);
router.post("/", createUser);
router.put("/:id/toggle-active", toggleUserActive);

module.exports = router;
