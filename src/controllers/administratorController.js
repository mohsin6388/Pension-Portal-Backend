require("dotenv").config();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
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






async function administatorLogin(req, res, next) {
  console.log("Login attempt:", req.body);

  try {
    const { username, password } = req.body;

    console.log({ username, password });

    const user_name = String(username).trim();
    const user_password = String(password).trim();

    // User find karo
    const result = await pool.query(
      `
      SELECT 
        id,
        username,
        password,
        is_active
      FROM administrators_users
      WHERE username = $1
      `,
      [user_name],
    );

    // User nahi mila
    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Yes, Invalid credentials",
      });
    }

    const user = result.rows[0];

    // Account inactive
    if (!user.is_active) {
      return res.status(403).json({
        message: "Account is deactivated",
      });
    }

    // Password check
    // Agar bcrypt use kar rahe ho:
    // const isMatch = await bcrypt.compare(user_password, user.password);

    // Temporary direct match
    const isMatch = user_password === user.password;

    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    // Last login update
    // await pool.query(
    //   `
    //   UPDATE administrators_users
    //   SET last_login = NOW()
    //   WHERE id = $1
    //   `,
    //   [user.id],
    // );

    // Token generate
    const token = generateToken(user.id);

    //======================================
    // Activity Log
    //======================================

    await pool.query(
      `
      INSERT INTO activity_logs (
        user_id,
        action,
        module,
        target_id,
        message,
        ip_address,
        user_agent
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      `,
      [
        user.id,

        "LOGIN",

        "AUTH",

        user.id,

        `Administrator logged into the system`,

        req.ip,

        req.headers["user-agent"],
      ],
    );

    // Response
    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}


//=============================================
//            User Logins
//=============================================


// async function handleCreateLogin(req, res) {
//   try {
//     const { department_id, user_id, password } = req.body;

//     if (!department_id || !user_id || !password) {
//       return res.status(400).json({
//         success: false,
//         message: "Department, User ID and Password are required",
//       });
//     }

//     const existingUser = await pool.query(
//       `
//       SELECT id
//       FROM users
//       WHERE email = $1
//       `,
//       [user_id],
//     );

//     if (existingUser.rows.length > 0) {
//       return res.status(409).json({
//         success: false,
//         message: "User ID already exists",
//       });
//     }

//     const result = await pool.query(
//       `
//       INSERT INTO users
//       (
//         email,
//         password_hash,
//         role
//       )
//       VALUES ($1, $2, $3)
//       RETURNING id, email, role, is_active
//       `,
//       [
//         user_id.trim(),
//         password, // Direct save
//         department_id,
//       ],
//     );

//     return res.status(201).json({
//       success: true,
//       message: "Login created successfully",
//       data: result.rows[0],
//     });
//   } catch (error) {
//     console.error("Create Login Error:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Internal server error",
//     });
//   }
// }

async function handleCreateLogin(req, res) {
  try {
    const { department_id, user_id, password } = req.body;

    if (!department_id || !user_id || !password) {
      return res.status(400).json({
        success: false,
        message: "Department, User ID and Password are required",
      });
    }

    // Check department exists
    const departmentResult = await pool.query(
      `
      SELECT department_name
      FROM departments
      WHERE id = $1
      `,
      [department_id],
    );

    if (departmentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    const departmentName = departmentResult.rows[0].department_name;

    // Check duplicate user
    const existingUser = await pool.query(
      `
      SELECT id
      FROM users
      WHERE email = $1
      `,
      [user_id],
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "User ID already exists",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO users
      (
        email,
        password_hash,
        role
      )
      VALUES ($1, $2, $3)
      RETURNING id, email, role, is_active
      `,
      [
        user_id.trim(),
        password,
        departmentName, // save department name
      ],
    );

    return res.status(201).json({
      success: true,
      message: "Login created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Create Login Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}


async function handleGetLogins(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        id,
        email AS user_id,
        role AS department,
        is_active,
        last_login
      FROM users
      ORDER BY id DESC
    `);

    return res.status(200).json({
      success: true,
      message: "Logins fetched successfully",
      data: result.rows,
    });
  } catch (error) {
    console.error("Get Logins Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}



async function handleUpdatePassword(req, res) {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required",
      });
    }

    const user = await pool.query(
      `
      SELECT id
      FROM users
      WHERE id = $1
      `,
      [id],
    );

    if (user.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await pool.query(
      `
      UPDATE users
      SET password_hash = $1
      WHERE id = $2
      `,
      [password, id],
    );

    return res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("Update Password Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

async function handleDeleteLogin(req, res) {
  try {
    const { id } = req.params;

    const user = await pool.query(
      `
      SELECT id
      FROM users
      WHERE id = $1
      `,
      [id]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Login not found",
      });
    }

    await pool.query(
      `
      DELETE FROM users
      WHERE id = $1
      `,
      [id]
    );

    return res.status(200).json({
      success: true,
      message: "Login deleted successfully",
    });
  } catch (error) {
    console.error("Delete Login Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}







//=============================================
//             DEPARTMENT
//=============================================


async function handleGetDepartments(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        id,
        department_name,
        created_at
      FROM departments
      ORDER BY department_name ASC
    `);

    return res.status(200).json({
      success: true,
      message: "Departments fetched successfully",
      data: result.rows,
    });
  } catch (error) {
    console.error("Get Departments Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}


async function handleCreateDepartment(req, res) {
  try {
    const { department_name } = req.body;

    if (!department_name || !department_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Department name is required",
      });
    }

    // Check duplicate
    const existingDepartment = await pool.query(
      `
      SELECT id
      FROM departments
      WHERE LOWER(department_name) = LOWER($1)
      `,
      [department_name.trim()]
    );

    if (existingDepartment.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Department already exists",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO departments (department_name)
      VALUES ($1)
      RETURNING id, department_name, created_at
      `,
      [department_name.trim()]
    );

    return res.status(201).json({
      success: true,
      message: "Department created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Create Department Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}


async function handleDeleteDepartment(req, res) {
  try {
    const { id } = req.params;

    const department = await pool.query(
      `
      SELECT id
      FROM departments
      WHERE id = $1
      `,
      [id],
    );

    if (department.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Department not found",
      });
    }

    await pool.query(
      `
      DELETE FROM departments
      WHERE id = $1
      `,
      [id],
    );

    return res.status(200).json({
      success: true,
      message: "Department deleted successfully",
    });
  } catch (error) {
    console.error("Delete Department Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}








//============================================
//           DESIGNATIONS
//============================================

async function handleCreateDesignation(req, res) {

 console.log("I am reachable")

  try {

    console.log(req.body);
    const designation_name = req.body.designation_name;

    if (!designation_name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Designation name is required",
      });
    }

    // Check duplicate
    const existingDesignation = await pool.query(
      `SELECT id FROM designations 
       WHERE LOWER(designation_name) = LOWER($1)`,
      [designation_name.trim()],
    );

    if (existingDesignation.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Designation already exists",
      });
    }

    const result = await pool.query(
      `INSERT INTO designations (designation_name)
       VALUES ($1)
       RETURNING *`,
      [designation_name.trim()],
    );

    return res.status(201).json({
      success: true,
      message: "Designation created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Create Designation Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }

}


async function handleGetDesignations(req, res) {
  try {
    console.log("It is wokring-------")
    const result = await pool.query(`
      SELECT
        id,
        designation_name,
        created_at
      FROM designations
      ORDER BY designation_name ASC
    `);

    return res.status(200).json({
      success: true,
      message: "Designations fetched successfully",
      data: result.rows,
    });
  } catch (error) {
    console.error("Get Designations Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}








//============================================
//            SUB DEPARTMENTS
//============================================


async function handleCreateSubDepartment(req, res) {
  try {
    const { department_id, sub_department_name } = req.body;

    if (!department_id || !sub_department_name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Department and Sub Department Name are required",
      });
    }

    // Check duplicate
    const existing = await pool.query(
      `
      SELECT id
      FROM sub_departments
      WHERE department_id = $1
      AND LOWER(sub_department_name) = LOWER($2)
      `,
      [department_id, sub_department_name.trim()],
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Sub Department already exists",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO sub_departments
      (
        department_id,
        sub_department_name
      )
      VALUES ($1, $2)
      RETURNING *
      `,
      [department_id, sub_department_name.trim()],
    );

    return res.status(201).json({
      success: true,
      message: "Sub Department created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Create Sub Department Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}



async function handleGetSubDepartments(req, res) {
  try {
    const result = await pool.query(`
      SELECT
        sd.id,
        sd.department_id,
        sd.sub_department_name,
        sd.created_at,
        d.department_name
      FROM sub_departments sd
      LEFT JOIN departments d
      ON d.id = sd.department_id
      ORDER BY sd.id DESC
    `);

    return res.status(200).json({
      success: true,
      message: "Sub Departments fetched successfully",
      data: result.rows,
    });
  } catch (error) {
    console.error("Get Sub Departments Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}



async function handleDeleteSubDepartment(req, res) {
  try {
    const { id } = req.params;

    const existing = await pool.query(
      `
      SELECT id
      FROM sub_departments
      WHERE id = $1
      `,
      [id],
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Sub Department not found",
      });
    }

    await pool.query(
      `
      DELETE FROM sub_departments
      WHERE id = $1
      `,
      [id],
    );

    return res.status(200).json({
      success: true,
      message: "Sub Department deleted successfully",
    });
  } catch (error) {
    console.error("Delete Sub Department Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}































//=============================================================================================
//=============================================================================================
//=============================================================================================



// ── Token Helpers ─────────────────────────────────────────────────────────────
// function signAccessToken(user) {
//   return jwt.sign(
//     {
//       id: user.$loki,
//       username: user.username,
//       role: user.role,
//       fullName: user.fullName,
//       department: user.department,
//     },
//     process.env.JWT_SECRET,
//     { expiresIn: process.env.JWT_EXPIRES_IN || "15m" },
//   );
// }

// function signRefreshToken(user) {
//   return jwt.sign(
//     { id: user.$loki, username: user.username },
//     process.env.JWT_REFRESH_SECRET,
//     { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d" },
//   );
// }



// async function login(req, res, next) {

//   console.log("Login attempt:", req.body);
//   try {
//     let { username, password, role } = req.body;

//     const email = String(username || "").trim();
//     const password_hash = String(password || "").trim();
//     const user_role = String(role || "").trim();

//     const result = await pool.query(
//       `SELECT id, email, password_hash, is_active, role
//        FROM users WHERE email = $1 AND role = $2`,
//       [email, user_role],
//     );

//     if (result.rows.length === 0) {
//       return res.status(401).json({ message: "Invalid credentials" });
//     }

//     const user = result.rows[0];

//     if (!user.is_active) {
//       return res.status(403).json({ message: "Account is deactivated" });
//     }

//     // update last login
//     await pool.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [
//       user.id,
//     ]);

//     const token = generateToken(user.id);


//     //======================================
//     // Activity Log
//     //======================================

//     await pool.query(
//       `
//   INSERT INTO activity_logs (
//     user_id,
//     user_role,
//     action,
//     module,
//     target_id,
//     message,
//     ip_address,
//     user_agent
//   )
//   VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
//   `,
//       [
//         user.id,

//         user.role,

//         "LOGIN",

//         "AUTH",

//         user.id,

//         `${user.role} logged into the system`,

//         req.ip,

//         req.headers["user-agent"],
//       ],
//     );




//     res.json({
//       success: true,
//       data: {
//         token,
//         user: {
//           id: user.id,
//           email: user.email,
//           role: user.role,
//         },
//       },
//     });
//   } catch (err) {
//     next(err);
//   }
// }










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
// function getMe(req, res) {
//   const { users } = getCollections();
//   const user = users.get(req.user.id);
//   if (!user)
//     return res.status(404).json({ success: false, message: "User not found" });

//   res.json({
//     success: true,
//     data: {
//       id: user.$loki,
//       username: user.username,
//       fullName: user.fullName,
//       role: user.role,
//       department: user.department,
//       email: user.email,
//       lastLogin: user.lastLogin,
//     },
//   });
// }

// // ── POST /api/auth/change-password ────────────────────────────────────────────
// async function changePassword(req, res) {
//   const { currentPassword, newPassword } = req.body;
//   if (!currentPassword || !newPassword) {
//     return res
//       .status(400)
//       .json({
//         success: false,
//         message: "Both current and new password required",
//       });
//   }
//   if (newPassword.length < 8) {
//     return res
//       .status(400)
//       .json({
//         success: false,
//         message: "New password must be at least 8 characters",
//       });
//   }

//   const { users } = getCollections();
//   const user = users.get(req.user.id);
//   if (!user)
//     return res.status(404).json({ success: false, message: "User not found" });

//   const valid = await bcrypt.compare(currentPassword, user.passwordHash);
//   if (!valid)
//     return res
//       .status(401)
//       .json({ success: false, message: "Current password is incorrect" });

//   user.passwordHash = await bcrypt.hash(newPassword, 10);
//   user.updatedAt = new Date().toISOString();
//   users.update(user);

//   res.json({ success: true, message: "Password changed successfully" });
// }

module.exports = {
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
  // refresh, logout, getMe, changePassword
};
