require("dotenv").config();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
// const { getCollections } = require("../config/database");
// const { pool } = require("../config/database");
const generateToken = require("../middleware/authToken");

const { Pool } = require("pg");

const pool = new Pool({
  connectionString:
    "postgresql://pension_system_user:wHeVesZgDg7wgkzYA3lQvDPwzThXYjt4@dpg-d7sej9navr4c73ame5dg-a.oregon-postgres.render.com/pension_system",
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on("connect", () => {
  console.log("✅ Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("❌ Unexpected error on idle client", err);
  process.exit(-1);
});

// ── Token Helpers ─────────────────────────────────────────────────────────────
function signAccessToken(user) {
  return jwt.sign(
    {
      id: user.$loki,
      username: user.username,
      role: user.role,
      fullName: user.fullName,
      department: user.department,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "15m" },
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { id: user.$loki, username: user.username },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d" },
  );
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────
// async function login(req, res) {
//   try {
//     const { username, password } = req.body;
//     if (!username || !password) {
//       return res.status(400).json({ success: false, message: "Username and password required" });
//     }

//     const { users, refreshTokens, auditLogs } = getCollections();
//     const user = users.findOne({ username: username.toLowerCase().trim() });

//     if (!user || !user.isActive) {
//       auditLogs.insert({ action: "LOGIN_FAILED", username, ip: req.ip, timestamp: new Date().toISOString(), reason: user ? "Account inactive" : "User not found" });
//       return res.status(401).json({ success: false, message: "Invalid credentials" });
//     }

//     const valid = await bcrypt.compare(password, user.passwordHash);
//     if (!valid) {
//       auditLogs.insert({ action: "LOGIN_FAILED", username, ip: req.ip, timestamp: new Date().toISOString(), reason: "Wrong password" });
//       return res.status(401).json({ success: false, message: "Invalid credentials" });
//     }

//     const accessToken = signAccessToken(user);
//     const refreshToken = signRefreshToken(user);
//     const jti = uuidv4();

//     // Store refresh token
//     refreshTokens.insert({
//       jti,
//       token: refreshToken,
//       userId: user.$loki,
//       username: user.username,
//       createdAt: new Date().toISOString(),
//       expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
//       revoked: false,
//     });

//     // Update last login
//     user.lastLogin = new Date().toISOString();
//     users.update(user);

//     auditLogs.insert({ action: "LOGIN_SUCCESS", userId: user.$loki, username: user.username, role: user.role, ip: req.ip, timestamp: new Date().toISOString() });

//     res.json({
//       success: true,
//       message: "Login successful",
//       data: {
//         accessToken,
//         refreshToken,
//         user: {
//           id: user.$loki,
//           username: user.username,
//           fullName: user.fullName,
//           role: user.role,
//           department: user.department,
//           email: user.email,
//         },
//       },
//     });
//   } catch (err) {
//     console.error("Login error:", err);
//     res.status(500).json({ success: false, message: "Internal server error" });
//   }
// }

//  ---- POST /api/auth/login ────────────────────────────────────────────────────














async function login(req, res, next) {

  console.log("Login attempt:", req.body);
  try {
    let { username, password, role } = req.body;

    const email = String(username || "").trim();
    const password_hash = String(password || "").trim();
    const user_role = String(role || "").trim();

    const result = await pool.query(
      `SELECT id, email, password_hash, is_active, role
       FROM users WHERE email = $1 AND role = $2`,
      [email, user_role],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ message: "Account is deactivated" });
    }

    // update last login
    await pool.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [
      user.id,
    ]);

    const token = generateToken(user.id);


    //======================================
    // Activity Log
    //======================================

    await pool.query(
      `
  INSERT INTO activity_logs (
    user_id,
    user_role,
    action,
    module,
    target_id,
    message,
    ip_address,
    user_agent
  )
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
  `,
      [
        user.id,

        user.role,

        "LOGIN",

        "AUTH",

        user.id,

        `${user.role} logged into the system`,

        req.ip,

        req.headers["user-agent"],
      ],
    );




    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}



















// ── POST /api/auth/refresh ────────────────────────────────────────────────────
function refresh(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken)
    return res
      .status(400)
      .json({ success: false, message: "Refresh token required" });

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const { refreshTokens, users } = getCollections();

    const stored = refreshTokens.findOne({
      token: refreshToken,
      revoked: false,
    });
    if (!stored)
      return res
        .status(401)
        .json({ success: false, message: "Invalid or revoked refresh token" });

    if (new Date(stored.expiresAt) < new Date()) {
      stored.revoked = true;
      refreshTokens.update(stored);
      return res
        .status(401)
        .json({ success: false, message: "Refresh token expired" });
    }

    const user = users.get(decoded.id);
    if (!user || !user.isActive)
      return res
        .status(401)
        .json({ success: false, message: "User not found or inactive" });

    const newAccessToken = signAccessToken(user);
    res.json({ success: true, data: { accessToken: newAccessToken } });
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid refresh token" });
  }
}

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
function logout(req, res) {
  const { refreshToken } = req.body;
  if (refreshToken) {
    const { refreshTokens } = getCollections();
    const stored = refreshTokens.findOne({ token: refreshToken });
    if (stored) {
      stored.revoked = true;
      refreshTokens.update(stored);
    }
  }
  res.json({ success: true, message: "Logged out successfully" });
}

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
function getMe(req, res) {
  const { users } = getCollections();
  const user = users.get(req.user.id);
  if (!user)
    return res.status(404).json({ success: false, message: "User not found" });

  res.json({
    success: true,
    data: {
      id: user.$loki,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      department: user.department,
      email: user.email,
      lastLogin: user.lastLogin,
    },
  });
}

// ── POST /api/auth/change-password ────────────────────────────────────────────
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({
        success: false,
        message: "Both current and new password required",
      });
  }
  if (newPassword.length < 8) {
    return res
      .status(400)
      .json({
        success: false,
        message: "New password must be at least 8 characters",
      });
  }

  const { users } = getCollections();
  const user = users.get(req.user.id);
  if (!user)
    return res.status(404).json({ success: false, message: "User not found" });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid)
    return res
      .status(401)
      .json({ success: false, message: "Current password is incorrect" });

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.updatedAt = new Date().toISOString();
  users.update(user);

  res.json({ success: true, message: "Password changed successfully" });
}

module.exports = { login, refresh, logout, getMe, changePassword };
