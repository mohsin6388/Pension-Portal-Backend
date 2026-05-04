const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const { login, refresh, logout, getMe, changePassword } = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");

// Stricter rate-limit for login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  message: { success: false, message: "Too many login attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/login", loginLimiter, login); //complete this route only currently
router.post("/refresh", refresh);
router.post("/logout", logout);
router.get("/me", authenticate, getMe);
router.put("/change-password", authenticate, changePassword);

module.exports = router;
