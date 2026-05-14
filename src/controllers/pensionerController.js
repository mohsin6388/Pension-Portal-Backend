require("dotenv").config();
const cloudinary = require("../config/cloudinary");
const { Pool } = require("pg");
const createActivityLog = require("../utils/activityLogger");
const { Parser } = require("json2csv");

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






// Create Employee by Operator =================================
// ===== api/pensioners/ ============ 

async function createPensioner(req, res) {
  const client = await pool.connect();

  //  console.log("ROLE =>", req.headers["x-user-role"]);

  //  console.log("USER ID =>", req.headers["x-user-id"]);

  console.log(req.body)

  try {
    const body = req.body;

    // =========================
    // ✅ Basic validation
    // =========================
    // if (
    //   !body.employeeId ||
    //   !body.department ||
    //   !body.designation ||
    //   !body.employeeName
    // ) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Missing required fields",
    //   });
    // }

    await client.query("BEGIN");

    // =========================
    // 1️⃣ Get department_id
    // =========================
    const deptRes = await client.query(
      "SELECT id FROM departments WHERE department_name = $1",
      [body.department],
    );

    if (deptRes.rows.length === 0) {
      throw new Error("Invalid department");
    }

    const departmentId = deptRes.rows[0].id;

    // =========================
    // 2️⃣ Get designation_id
    // =========================
    const desigRes = await client.query(
      "SELECT id FROM designations WHERE designation_name = $1",
      [body.designation],
    );

    if (desigRes.rows.length === 0) {
      throw new Error("Invalid designation");
    }

    const designationId = desigRes.rows[0].id;

    let oldPpo = body.ppoNo || null;

    // =========================
    // 3️⃣ Auto Generate PPO
    // =========================

    const year = new Date().getFullYear();

    const countRes = await client.query(
      "SELECT COUNT(*) FROM employee_pensioner",
    );

    const count = parseInt(countRes.rows[0].count) + 1;

    const ppoNo = `100${year}${String(count).padStart(5, "0")}`;

    // =========================
    // 4️⃣ Insert Employee
    // =========================

    const empInsert = await client.query(
      `
    INSERT INTO employee_pensioner (
      employee_id,
      ppo_no,
      old_ppo,
      employee_name,
      relation,
      relation_name,
      department_id,
      sub_department,
      designation_id,
      aadhaar_no,
      pan_no,
      date_of_birth,
      date_of_joining,
      retirement_date,
      date_of_death,
      gender,
      grade_pay,
      last_salary_drawn,
      basic_salary,
      pay_commission,
      caste_category,
      mobile_no,
      family_mobile_no
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
      $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
      $21,$22,$23
    )
    RETURNING id
    `,
      [
        body.employeeId,
        ppoNo,
        oldPpo,
        body.employeeName,
        body.relation || null,
        body.relationName || null,
        departmentId,
        body.subDepartment || null,
        designationId,
        body.aadhaar,
        body.pan,
        body.dob,
        body.doj || null,
        body.retirementDate || null,
        body.dod || null,
        body.gender,
        Number(body.gradePay),
        Number(body.lastSalary || 0),
        Number(body.basicSalary || 0),
        body.payCommission,
        body.caste,
        body.mobile,
        body.familyMobile,
      ],
    );

    const employeeId = empInsert.rows[0].id;

    // =========================
    // 5️⃣ Upload Documents
    // =========================

    const photoUrl = req.files?.photo?.[0]?.path || null;
    const signatureUrl = req.files?.signature?.[0]?.path || null;
    const salarySlipUrl = req.files?.salarySlip?.[0]?.path || null;
    const deathCertificateUrl = req.files?.deathCertificate?.[0]?.path || null;

    await client.query(
      `
    INSERT INTO employee_documents (
      employee_id,
      photo_path,
      signature_path,
      salary_slip_path,
      death_certificate_path
    )
    VALUES ($1,$2,$3,$4,$5)
    `,
      [employeeId, photoUrl, signatureUrl, salarySlipUrl, deathCertificateUrl],
    );

    // =========================
    // 6️⃣ Pension Category
    // =========================

    await client.query(
      `
    INSERT INTO pension_category (
      employee_id,
      category_type,
      acp,
      acp1,
      acp2,
      acp3,
      notional_increment,
      pfms
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `,
      [
        employeeId,
        body.categoryType,
        body.acp,
        body.acp1,
        body.acp2,
        body.acp3,
        body.notionalIncrement,
        body.pfms,
      ],
    );

    // =========================
    // 7️⃣ Bank Details
    // =========================

    await client.query(
      `
    INSERT INTO bank_details (
      employee_id,
      bank_name,
      ifsc_code,
      micr,
      bank_ac_no,
      ac_type
    )
    VALUES ($1,$2,$3,$4,$5,$6)
    `,
      [employeeId, body.bankName, body.ifsc, body.micr, body.acNo, body.acType],
    );

    // =========================
    // 8️⃣ Address
    // =========================

    await client.query(
      `
    INSERT INTO employee_address (
      employee_id,
      permanent_address,
      correspondence_address,
      pin_code
    )
    VALUES ($1,$2,$3,$4)
    `,
      [employeeId, body.permAddress, body.corrAddress || null, body.pinCode],
    );

    // =========================
    // 9️⃣ Activity Log
    // =========================

    await createActivityLog(client, {
      userId: req.headers["x-user-id"],

      userRole: req.headers["x-user-role"],

      action: "CREATE",

      module: "employee_pensioner",

      targetId: employeeId,

      changes: {
        employee_name: body.employeeName,
        employee_id: body.employeeId,
        ppo_no: ppoNo,
        department: body.department,
      },

      message: `Operator created pensioner ${body.employeeName}`,

      req,
    });

    // =========================
    // ✅ COMMIT
    // =========================

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Pensioner created successfully",
      employeeId,
    });
  } catch (err) {
    await client.query("ROLLBACK");

    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  } finally {
    client.release();
  }

  // try {
  //   const body = req.body;

  //   // =========================
  //   // ✅ Basic validation
  //   // =========================
  //   if (
  //     !body.employeeId ||
  //     !body.department ||
  //     !body.designation ||
  //     !body.retirementDate ||
  //     !body.employeeName
  //   ) {
  //     return res.status(400).json({
  //       success: false,
  //       message: "Missing required fields",
  //     });
  //   }

  //   await client.query("BEGIN");

  //   // =========================
  //   // 1️⃣ Get department_id
  //   // =========================
  //   const deptRes = await client.query(
  //     "SELECT id FROM departments WHERE department_name = $1",
  //     [body.department],
  //   );

  //   if (deptRes.rows.length === 0) {
  //     throw new Error("Invalid department");
  //   }

  //   const departmentId = deptRes.rows[0].id;

  //   // =========================
  //   // 2️⃣ Get designation_id
  //   // =========================
  //   const desigRes = await client.query(
  //     "SELECT id FROM designations WHERE designation_name = $1",
  //     [body.designation],
  //   );

  //   if (desigRes.rows.length === 0) {
  //     throw new Error("Invalid designation");
  //   }

  //   const designationId = desigRes.rows[0].id;

  //   let oldPpo = body.ppoNo || null;

  //   // Always auto-generate PPO
  //   const year = new Date().getFullYear();

  //   const countRes = await client.query(
  //     "SELECT COUNT(*) FROM employee_pensioner",
  //   );

  //   const count = parseInt(countRes.rows[0].count) + 1;

  //   // Format => 100202600001
  //   // 100 + year + 5 digit running number

  //   const ppoNo = `100${year}${String(count).padStart(5, "0")}`;
  //   const empInsert = await client.query(
  //     `INSERT INTO employee_pensioner (
  //   employee_id,
  //   ppo_no,
  //   old_ppo,
  //   department_id,
  //   designation_id,
  //   aadhaar_no,
  //   pan_no,
  //   date_of_birth,
  //   date_of_joining,
  //   retirement_date,
  //   date_of_death,
  //   gender,
  //   grade_pay,
  //   last_salary_drawn,
  //   caste_category,
  //   relation,
  //   relation_name,
  //   mobile_no,
  //   family_mobile_no,
  //   employee_name
  // )
  // VALUES (
  //   $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
  //   $11,$12,$13,$14,$15,$16,$17,$18,$19,$20
  // )
  // RETURNING id`,
  //     [
  //       body.employeeId,
  //       ppoNo,
  //       oldPpo,
  //       departmentId,
  //       designationId,
  //       body.aadhaar,
  //       body.pan,
  //       body.dob,
  //       body.doj || null,
  //       body.retirementDate,
  //       body.dod || null,
  //       body.gender,
  //       Number(body.gradePay),
  //       Number(body.lastSalary),
  //       body.caste,
  //       body.relation,
  //       body.relationName,
  //       body.mobile,
  //       body.familyMobile,
  //       body.employeeName,
  //     ],
  //   );

  //   const employeeId = empInsert.rows[0].id;

  //   // =========================
  //   // 5️⃣ Upload Documents (AFTER employeeId exists)
  //   // =========================

  //   const photoUrl = req.files?.photo?.[0]?.path || null;
  //   const signatureUrl = req.files?.signature?.[0]?.path || null;
  //   const salarySlipUrl = req.files?.salarySlip?.[0]?.path || null;
  //   const deathCertificateUrl = req.files?.deathCertificate?.[0]?.path || null;

  //   await client.query(
  //     `INSERT INTO employee_documents (
  //       employee_id,
  //       photo_path,
  //       signature_path,
  //       salary_slip_path,
  //       death_certificate_path
  //     )
  //     VALUES ($1,$2,$3,$4,$5)`,
  //     [employeeId, photoUrl, signatureUrl, salarySlipUrl, deathCertificateUrl],
  //   );

  //   // =========================
  //   // 6️⃣ Pension Category
  //   // =========================
  //   await client.query(
  //     `INSERT INTO pension_category (
  //       employee_id, category_type, 
  //       acp, notional_increment, pfms
  //     )
  //     VALUES ($1,$2,$3,$4,$5)`,
  //     [
  //       employeeId,
  //       body.categoryType,
  //       // Number(body.categoryPct),
  //       body.acp === "Y",
  //       body.notionalIncrement === "Y",
  //       body.pfms,
  //     ],
  //   );

  //   // =========================
  //   // 7️⃣ Bank Details
  //   // =========================
  //   await client.query(
  //     `INSERT INTO bank_details (
  //       employee_id, bank_name, ifsc_code, micr,
  //       bank_ac_no, ac_type
  //     )
  //     VALUES ($1,$2,$3,$4,$5,$6)`,
  //     [employeeId, body.bankName, body.ifsc, body.micr, body.acNo, body.acType],
  //   );

  //   // =========================
  //   // 8️⃣ Address
  //   // =========================
  //   await client.query(
  //     `INSERT INTO employee_address (
  //       employee_id, permanent_address, correspondence_address, pin_code
  //     )
  //     VALUES ($1,$2,$3,$4)`,
  //     [employeeId, body.permAddress, body.corrAddress || null, body.pinCode],
  //   );

  //   // =========================
  //   // 9️⃣ Activity Log
  //   // =========================

  //   await createActivityLog(client, {
  //     userId: req.headers["x-user-id"],
  //     userRole: req.headers["x-user-role"],

  //     action: "CREATE",

  //     module: "employee_pensioner",

  //     targetId: employeeId,

  //     changes: {
  //       employee_name: body.employeeName,
  //       employee_id: body.employeeId,
  //       ppo_no: ppoNo,
  //       department: body.department,
  //     },

  //     message: `Operator created pensioner ${body.employeeName}`,

  //     req,
  //   });

  //   // =========================
  //   // ✅ COMMIT
  //   // =========================
  //   await client.query("COMMIT");

  //   res.status(201).json({
  //     success: true,
  //     message: "Pensioner created successfully",
  //     employeeId,
  //   });
  // } catch (err) {
  //   await client.query("ROLLBACK");

  //   console.error(err);

  //   res.status(500).json({
  //     success: false,
  //     message: err.message || "Server error",
  //   });
  // } finally {
  //   client.release();
  // }
}




// ── GET /api/pensioners ───────────────────────────────────────────────────────

function listPensioners(req, res) {
  try {
    const { pensioners } = getCollections();
    const { status, search, page = 1, limit = 20 } = req.query;

    let results = pensioners.find();

    if (status && status !== "All") {
      results = results.filter((p) => p.status === status);
    }

    if (search) {
      const q = search.toLowerCase();
      results = results.filter(
        (p) =>
          p.ppoNumber?.toLowerCase().includes(q) ||
          p.name?.toLowerCase().includes(q) ||
          p.employeeId?.toLowerCase().includes(q),
      );
    }

    const total = results.length;
    const pageNum = parseInt(page);
    const pageSize = parseInt(limit);
    const paginated = results.slice(
      (pageNum - 1) * pageSize,
      pageNum * pageSize,
    );

    const stats = {
      total: pensioners.count(),
      active: pensioners.find({ status: "Active" }).length,
      stopped: pensioners.find({ status: "Stopped" }).length,
      closed: pensioners.find({ status: "Closed" }).length,
      pending: pensioners.find({ status: "Pending" }).length,
    };

    res.json({
      success: true,
      data: {
        pensioners: paginated.map(sanitizePensioner),
        stats,
        pagination: {
          total,
          page: pageNum,
          limit: pageSize,
          pages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}





// GET Pension Detail Paticular Employee By ID =============================================================

async function getPensionerById(req, res) {
  const { id } = req.params;

  //  console.log("ROLE =>", req.headers["x-user-role"]);

  //  console.log("USER ID =>", req.headers["x-user-id"]);

  try {
    const query = `
      SELECT 
        ep.*,

        d.department_name AS department,
        des.designation_name AS designation,

        -- DOCUMENTS
        ed.photo_path,
        ed.signature_path,
        ed.salary_slip_path,
        ed.death_certificate_path,

        -- PENSION CATEGORY
        pc.category_type,
        pc.acp,
        pc.notional_increment,
        pc.pfms,

        -- BANK DETAILS
        bd.bank_name,
        bd.ifsc_code,
        bd.micr,
        bd.bank_ac_no,
        bd.ac_type,

        -- ADDRESS
        ea.permanent_address,
        ea.correspondence_address,
        ea.pin_code

      FROM employee_pensioner ep

      LEFT JOIN departments d
        ON ep.department_id = d.id

      LEFT JOIN designations des
        ON ep.designation_id = des.id

      LEFT JOIN employee_documents ed
        ON ep.id = ed.employee_id

      LEFT JOIN pension_category pc
        ON ep.id = pc.employee_id

      LEFT JOIN bank_details bd
        ON ep.id = bd.employee_id

      LEFT JOIN employee_address ea
        ON ep.id = ea.employee_id

      WHERE ep.id = $1
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pensioner not found",
      });
    }



    //================================
    //   Activity Log - View Action
    //================================

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
        req.headers["x-user-id"],
        req.headers["x-user-role"],

        "VIEW_DETAILS",

        "employee_pensioner",

        id,

        `${req.headers["x-user-role"]} viewed pensioner details`,

        req.ip,

        req.headers["user-agent"],
      ],
    );



    res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
}





//===================================== Admin, Super Admin Routes =======================================================
async function handleAdminAction(req, res) {
  const { ppo_no, action, remark, user } = req.body;

  console.log(req.body);


  const logRole =
    user.role === "super_admin_1"
      ? "Accountant"
      : user.role === "super_admin_2"
        ? "CFO"
        : user.role;


  if (!ppo_no || !action) {
    return res.status(400).json({
      success: false,
      message: "ppo_no and action are required",
    });
  }

  const oldDataRes = await pool.query(
    `
  SELECT id, employee_name, status
  FROM employee_pensioner
  WHERE ppo_no = $1
  `,
    [ppo_no],
  );

  if (oldDataRes.rows.length === 0) {
    return res.status(404).json({
      success: false,
      message: "PPO not found",
    });
  }
  
  const oldData = oldDataRes.rows[0];

  let status;
  let remarkColumn;

  try {
    // if (user.role === "super_admin_1") {
    //   status =
    //     action === "approve"
    //       ? "Admin Approved"
    //       : action === "reject"
    //         ? "Admin Rejected"
    //         : null;
    // } else {
    //   status =
    //     action === "approve"
    //       ? "Full Approved"
    //       : action === "reject"
    //         ? "Full Rejected"
    //         : null;
    // }

    // if (!status) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Invalid action",
    //   });
    // }

    // // 🔥 update using PPO number
    // const result = await pool.query(
    //   `UPDATE employee_pensioner
    //    SET status = $1
    //    WHERE ppo_no = $2
    //    RETURNING ppo_no, status`,
    //   [status, ppo_no],
    // );

    // if (result.rowCount === 0) {
    //   return res.status(404).json({
    //     success: false,
    //     message: "PPO not found",
    //   });
    // }

    // ✅ role based status + remark column
    if (user.role === "super_admin_1") {
      status =
        action === "approve"
          ? "Admin Approved"
          : action === "reject"
            ? "Admin Rejected"
            : null;

      remarkColumn = "accountant_remark";
    } else if (user.role === "super_admin_2") {
      status =
        action === "approve"
          ? "Full Approved"
          : action === "reject"
            ? "Full Rejected"
            : null;

      remarkColumn = "cfo_remark";
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Invalid action",
      });
    }

    // ✅ update status + dynamic remark column
    const result = await pool.query(
      `
    UPDATE employee_pensioner
    SET status = $1,
        ${remarkColumn} = $2
    WHERE ppo_no = $3
    RETURNING ppo_no, status, ${remarkColumn}
    `,
      [status, remark || null, ppo_no],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "PPO not found",
      });
    }

    // ==================================
    //  Activity Log - Approve/Reject Action
    // ==================================

    await pool.query(
      `
  INSERT INTO activity_logs (
    user_id,
    user_role,
    action,
    module,
    target_id,
    changes,
    message,
    ip_address,
    user_agent
  )
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
  `,
      [
        user.id,

        logRole,

        action === "approve" ? "APPROVE" : "REJECT",

        "employee_pensioner",

        oldData.id,

        JSON.stringify({
          status: {
            old: oldData.status,
            new: status,
          },
          remark: remark || null,
        }),

        `${logRole} ${action}ed pensioner ${oldData.employee_name}`,

        req.ip,

        req.headers["user-agent"],
      ],
    );

    // ==================================
    //  Activity Log - Approve/Reject Action
    //              END
    // ==================================

    res.json({
      success: true,
      message: `Pension ${status}`,
      data: result.rows[0],
    });
  } catch (err) {
    console.error("ACTION ERROR:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
}




//============================= Update Pensioner By PPO Number (Admin and Super Admin Edit) ============================
async function updatePensioner(req, res) {
  const client = await pool.connect();

  try {
    const ppo_no = req.params.ppo_no?.trim();

    console.log("Update Pensioner called with PPO:", ppo_no);
    console.log("Request body:", req.body);

    const body = req.body;


    // =========================================
    // ROLE
    // =========================================

    const updatedUser = body.updatedUser || {};

    const editedByRole = updatedUser.role || "Unknown";

    // Dynamic column
    const editedColumn =
      editedByRole === "super_admin_1" ? "edited_by_role" : "edited_by_cfo";

    //=========================================
    //    Activity Log Role Variable
    //=========================================

    const frontendRole = updatedUser.role || "Unknown";

    const logRole =
      frontendRole === "super_admin_1"
        ? "Accountant"
        : frontendRole === "super_admin_2"
          ? "CFO"
          : frontendRole;




    await client.query("BEGIN");

    // =========================================
    // FIND EMPLOYEE
    // =========================================

    const empRes = await client.query(
      `
      SELECT id
      FROM employee_pensioner
      WHERE TRIM(ppo_no) = $1
      `,
      [ppo_no],
    );

    if (empRes.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Pensioner not found",
      });
    }

    const employeeId = empRes.rows[0].id;

    console.log("EMPLOYEE ID =>", employeeId);

    // =========================================
    // OLD DATA FOR LOGS
    // =========================================

    const oldDataRes = await client.query(
      `
      SELECT *
      FROM employee_pensioner
      WHERE id = $1
      `,
      [employeeId],
    );

    const oldData = oldDataRes.rows[0];

    // =========================================
    // GET DEPARTMENT ID
    // =========================================

    let departmentId = null;

    if (body.department_name) {
      const deptRes = await client.query(
        `
        SELECT id
        FROM departments
        WHERE department_name = $1
        `,
        [body.department_name],
      );

      if (deptRes.rows.length > 0) {
        departmentId = deptRes.rows[0].id;
      }
    }

    // =========================================
    // GET DESIGNATION ID
    // =========================================

    let designationId = null;

    if (body.designation_name) {
      const desigRes = await client.query(
        `
        SELECT id
        FROM designations
        WHERE designation_name = $1
        `,
        [body.designation_name],
      );

      if (desigRes.rows.length > 0) {
        designationId = desigRes.rows[0].id;
      }
    }

    // =========================================
    // UPDATE employee_pensioner
    // =========================================

    console.log("Updating employee_pensioner");

    await client.query(
      `
      UPDATE employee_pensioner
      SET
        employee_id = $1,
        employee_name = $2,
        aadhaar_no = $3,
        pan_no = $4,
        date_of_birth = $5,
        date_of_joining = $6,
        retirement_date = $7,
        date_of_death = $8,
        gender = $9,
        grade_pay = $10,
        last_salary_drawn = $11,
        caste_category = $12,
        relation = $13,
        relation_name = $14,
        mobile_no = $15,
        family_mobile_no = $16,
        department_id = $17,
        designation_id = $18,
        status = $19,
        ${editedColumn} = $20,
        edited_at = NOW()
      WHERE id = $21
      `,
      [
        body.employee_id,
        body.employee_name,
        body.aadhaar_no,
        body.pan_no,
        body.date_of_birth,
        body.date_of_joining,
        body.retirement_date,
        body.date_of_death,
        body.gender,
        body.grade_pay,
        body.last_salary_drawn,
        body.caste_category,
        body.relation,
        body.relation_name,
        body.mobile_no,
        body.family_mobile_no,
        departmentId,
        designationId,
        body.status,
        editedByRole,
        employeeId,
      ],
    );

    // =========================================
    // UPDATE employee_documents
    // =========================================

    console.log("Updating employee_documents");

    await client.query(
      `
      UPDATE employee_documents
      SET
        photo_path = $1,
        signature_path = $2,
        salary_slip_path = $3,
        death_certificate_path = $4
      WHERE employee_id = $5
      `,
      [
        body.photo_path,
        body.signature_path,
        body.salary_slip_path,
        body.death_certificate_path,
        employeeId,
      ],
    );

    // =========================================
    // UPDATE pension_category
    // =========================================

    console.log("Updating pension_category");

    await client.query(
      `
      UPDATE pension_category
      SET
        category_type = $1,
        acp = $2,
        notional_increment = $3,
        pfms = $4
      WHERE employee_id = $5
      `,
      [
        body.category_type,
        body.acp,
        body.notional_increment,
        body.pfms,
        employeeId,
      ],
    );

    // =========================================
    // UPDATE bank_details
    // =========================================

    console.log("Updating bank_details");

    await client.query(
      `
      UPDATE bank_details
      SET
        bank_name = $1,
        ifsc_code = $2,
        bank_ac_no = $3,
        ac_type = $4
      WHERE employee_id = $5
      `,
      [
        body.bank_name,
        body.ifsc_code,
        body.bank_ac_no,
        body.ac_type,
        employeeId,
      ],
    );

    // =========================================
    // UPDATE employee_address
    // =========================================

    console.log("Updating employee_address");

    await client.query(
      `
      UPDATE employee_address
      SET
        permanent_address = $1,
        correspondence_address = $2,
        pin_code = $3
      WHERE employee_id = $4
      `,
      [
        body.permanent_address,
        body.correspondence_address,
        body.pin_code,
        employeeId,
      ],
    );

    // =========================================
    // CREATE CHANGES OBJECT
    // =========================================

    const changes = {};

    if (oldData.employee_name !== body.employee_name) {
      changes.employee_name = {
        old: oldData.employee_name,
        new: body.employee_name,
      };
    }

    if (oldData.mobile_no !== body.mobile_no) {
      changes.mobile_no = {
        old: oldData.mobile_no,
        new: body.mobile_no,
      };
    }

    if (oldData.family_mobile_no !== body.family_mobile_no) {
      changes.family_mobile_no = {
        old: oldData.family_mobile_no,
        new: body.family_mobile_no,
      };
    }

    if (oldData.status !== body.status) {
      changes.status = {
        old: oldData.status,
        new: body.status,
      };
    }

    if (oldData.relation_name !== body.relation_name) {
      changes.relation_name = {
        old: oldData.relation_name,
        new: body.relation_name,
      };
    }

    if (oldData.grade_pay !== body.grade_pay) {
      changes.grade_pay = {
        old: oldData.grade_pay,
        new: body.grade_pay,
      };
    }

    // =========================================
    // SAVE ACTIVITY LOG
    // =========================================

    if (Object.keys(changes).length > 0) {
      await client.query(
        `
        INSERT INTO activity_logs (
          user_id,
          user_role,
          action,
          module,
          target_id,
          changes,
          message,
          ip_address,
          user_agent
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        `,
        [
          updatedUser.id || null,

          logRole,

          "UPDATE",

          "employee_pensioner",

          employeeId,

          JSON.stringify(changes),

          `${logRole} updated pensioner ${body.employee_name}`,

          req.ip,

          req.headers["user-agent"],
        ],
      );
    }

    // =========================================
    // COMMIT
    // =========================================

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Pensioner updated successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("UPDATE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  } finally {
    client.release();
  }
}



//========================== Download Activity Logs (Super Admin) ============================

async function downloadActivityLogsCSV(req, res) {

  console.log("your download btn api uninng .....................")
  try {
    // =========================================
    // GET ACTIVITY LOGS + EMPLOYEE DETAILS
    // =========================================

    const result = await pool.query(`
      SELECT
        al.id,
        al.user_id,
        al.user_role,
        al.action,
        al.module,
        al.target_id,
        al.changes,
        al.message,
        al.ip_address,
        al.created_at,

        ep.ppo_no,
        ep.employee_id,
        ep.employee_name

      FROM activity_logs al

      LEFT JOIN employee_pensioner ep
        ON ep.id = al.target_id

      ORDER BY al.created_at DESC
    `);

    const logs = result.rows;

    // =========================================
    // FORMAT DATA FOR CSV
    // =========================================

    const formattedLogs = logs.map((log) => ({
      Log_ID: log.id,

      PPO_No: log.ppo_no || "-",

      Employee_ID: log.employee_id || "-",

      Employee_Name: log.employee_name || "-",

      User_ID: log.user_id || "-",

      User_Role: log.user_role || "-",

      Action: log.action || "-",

      Module: log.module || "-",

      Target_ID: log.target_id || "-",

      Message: log.message || "-",

      IP_Address: log.ip_address || "-",

      Changes: log.changes ? JSON.stringify(log.changes) : "-",

      Created_At: log.created_at,
    }));

    // =========================================
    // CONVERT TO CSV
    // =========================================

    const json2csvParser = new Parser();

    const csv = json2csvParser.parse(formattedLogs);

    // =========================================
    // RESPONSE HEADERS
    // =========================================

    res.header("Content-Type", "text/csv");

    res.attachment(`activity_logs_${Date.now()}.csv`);

    // =========================================
    // SEND CSV
    // =========================================

    return res.send(csv);
  } catch (error) {
    console.error("CSV DOWNLOAD ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to download CSV",
    });
  }
}





//=================== Get ALL Full Approved PPO for CFO and Accountant =======================

async function getFullApprovedPensioners(req, res) {  
  const client = await pool.connect();
  try {
    // Optionally add pagination, search, etc. (same as listPensioners but pre-filtered)
    const { page = 1, limit = 50, search = '' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT 
        ep.id,
        ep.employee_id AS "employeeId",
        ep.ppo_no AS "ppoNo",
        ep.old_ppo AS "oldPpo",
        ep.employee_name AS "employeeName",
        ep.date_of_birth AS "dob",
        ep.date_of_joining AS "doj",
        ep.retirement_date AS "retirementDate",
        ep.gender,
        ep.grade_pay AS "gradePay",
        ep.last_salary_drawn AS "lastSalary",
        ep.caste_category AS "caste",
        ep.relation,
        ep.relation_name AS "relationName",
        ep.mobile_no AS "mobile",
        ep.family_mobile_no AS "familyMobile",
        ep.aadhaar_no AS "aadhaar",
        ep.pan_no AS "pan",
        ep.created_at AS "createdAt",
        ep.updated_at AS "updatedAt",
        ep.status,   -- important: 'approved', 'pending', etc.
        d.department_name AS "department",
        ds.designation_name AS "designation",
        bd.bank_name AS "bankName",
        bd.ifsc_code AS "ifsc",
        bd.micr,
        bd.bank_ac_no AS "acNo",
        bd.ac_type AS "acType",
        addr.permanent_address AS "permAddress",
        addr.correspondence_address AS "corrAddress",
        addr.pin_code AS "pinCode",
        pc.category_type AS "categoryType",
        pc.acp,
        pc.notional_increment AS "notionalIncrement",
        pc.pfms
      FROM employee_pensioner ep
      LEFT JOIN departments d ON ep.department_id = d.id
      LEFT JOIN designations ds ON ep.designation_id = ds.id
      LEFT JOIN bank_details bd ON ep.id = bd.employee_id
      LEFT JOIN employee_address addr ON ep.id = addr.employee_id
      LEFT JOIN pension_category pc ON ep.id = pc.employee_id
      WHERE ep.status = 'approved'
    `;

    const queryParams = [];
    // Optional search filter
    if (search) {
      query += ` AND (ep.employee_name ILIKE $${queryParams.length + 1} 
                  OR ep.ppo_no ILIKE $${queryParams.length + 1}
                  OR ep.employee_id ILIKE $${queryParams.length + 1})`;
      queryParams.push(`%${search}%`);
    }

    // Add ordering (most recent first)
    query += ` ORDER BY ep.id DESC`;

    // Add pagination
    query += ` LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(parseInt(limit), offset);

    const result = await client.query(query, queryParams);

    // Also get total count for pagination (without LIMIT/OFFSET)
    let countQuery = `SELECT COUNT(*) FROM employee_pensioner WHERE status = 'approved'`;
    if (search) {
      countQuery += ` AND (employee_name ILIKE $1 OR ppo_no ILIKE $1 OR employee_id ILIKE $1)`;
      const countResult = await client.query(countQuery, [`%${search}%`]);
      var total = parseInt(countResult.rows[0].count);
    } else {
      const countResult = await client.query(countQuery);
      total = parseInt(countResult.rows[0].count);
    }

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Error fetching approved pensioners:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching approved records",
    });
  } finally {
    client.release();
  }
}


// ============= Admin and Super Admin - Get All Records (For Admin Dashboard) - With Filters, Search, Pagination ===============

async function handleAdminAllRecords(req, res) {
  try {
    const query = `
      SELECT 
        ep.id,
        ep.employee_id,
        ep.employee_name,
        ep.ppo_no,

        ep.aadhaar_no,
        ep.pan_no,
        ep.date_of_birth,
        ep.date_of_joining,
        ep.retirement_date,
        ep.date_of_death,

        ep.gender,
        ep.grade_pay,
        ep.last_salary_drawn,
        ep.caste_category,
        ep.status, 
        ep.edited_by_role,
        ep.edited_by_cfo,
        ep.accountant_remark,
        ep.cfo_remark,

        ep.relation,
        ep.relation_name,
        ep.mobile_no,
        ep.family_mobile_no,

        d.department_name,
        des.designation_name,

        pc.category_type,
        pc.acp,
        pc.notional_increment,
        pc.pfms,

        bd.bank_name,
        bd.ifsc_code,
        bd.bank_ac_no,
        bd.ac_type,

        ea.permanent_address,
        ea.correspondence_address,
        ea.pin_code,

        ed.photo_path,
        ed.signature_path,
        ed.salary_slip_path,
        ed.death_certificate_path

      FROM employee_pensioner ep

      JOIN departments d 
        ON ep.department_id = d.id

      JOIN designations des 
        ON ep.designation_id = des.id

      LEFT JOIN pension_category pc 
        ON ep.id = pc.employee_id

      LEFT JOIN bank_details bd 
        ON ep.id = bd.employee_id

      LEFT JOIN employee_address ea 
        ON ep.id = ea.employee_id

      LEFT JOIN employee_documents ed 
        ON ep.id = ed.employee_id

      ORDER BY ep.id DESC;
    `;

    const result = await pool.query(query);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching employees:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }

}




//============ GET Department By Operator (For Department-wise Dashboard) ==================

async function getDepartmentPensioners(req, res) {
  try {
    const { departmentId } = req.params;

    if (!departmentId) {
      return res.status(400).json({
        success: false,
        message: "departmentId is required",
      });
    }

    const query = `
      SELECT 
        ep.id,
        ep.employee_id,
        ep.employee_name,
        ep.ppo_no,

        d.department_name,
        des.designation_name,

        ep.retirement_date,
        ep.last_salary_drawn,
        ep.gender,
        ep.status,

        pc.category_type,

        ep.created_at

      FROM employee_pensioner ep
      JOIN departments d ON ep.department_id = d.id
      JOIN designations des ON ep.designation_id = des.id
      LEFT JOIN pension_category pc ON pc.employee_id = ep.id

      WHERE ep.department_id = $1
      ORDER BY ep.created_at DESC;
    `;

    const result = await pool.query(query, [departmentId]);

    // 🔥 Transform for frontend (dashboard format)
    const data = result.rows.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      employee_name: row.employee_name,
      ppoNo: row.ppo_no,
      name: row.employee_id, // ⚠️ you don’t have name column in DB
      department: row.department_name,
      designation: row.designation_name,
      retirementDate: row.retirement_date,
      amount: row.last_salary_drawn, // or calculated pension
      categoryType: row.category_type,
      gender: row.gender,
      status: row.status,
    }));

    res.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
}



//================= Get Pensioners by Department (For Department-wise Dashboard) ==================

async function getDepartmentPensionersByAdmin(req, res) {
  try {
    const departmentId = parseInt(req.params.departmentId);

    if (!departmentId || isNaN(departmentId)) {
      return res.status(400).json({
        success: false,
        message: "Valid departmentId is required",
      });
    }

    const query = `
      SELECT 
        -- Basic Info
        ep.id,
        ep.employee_id,
        ep.employee_name,
        ep.ppo_no,
        ep.old_ppo,
        ep.aadhaar_no,
        ep.pan_no,
        ep.date_of_birth,
        ep.date_of_joining,
        ep.retirement_date,
        ep.date_of_death,
        ep.gender,
        ep.grade_pay,
        ep.last_salary_drawn,
        ep.caste_category,
        ep.relation,
        ep.relation_name,
        ep.mobile_no,
        ep.family_mobile_no,
        ep.status,
        ep.edited_by_role,
        ep.edited_by_cfo,
        ep.created_at,

        -- Department & Designation
        d.department_name,
        des.designation_name,

        -- Pension Category
        pc.category_type,
        pc.acp,
        pc.notional_increment,
        pc.pfms,

        -- Bank Details
        bd.bank_name,
        bd.ifsc_code,
        bd.micr,
        bd.bank_ac_no,
        bd.ac_type,

        -- Address
        ea.permanent_address,
        ea.correspondence_address,
        ea.pin_code,

        -- Documents
        ed.photo_path,
        ed.signature_path,
        ed.salary_slip_path,
        ed.death_certificate_path

      FROM employee_pensioner ep
      JOIN departments d ON ep.department_id = d.id
      JOIN designations des ON ep.designation_id = des.id
      LEFT JOIN pension_category pc ON pc.employee_id = ep.id
      LEFT JOIN bank_details bd ON bd.employee_id = ep.id
      LEFT JOIN employee_address ea ON ea.employee_id = ep.id
      LEFT JOIN employee_documents ed ON ed.employee_id = ep.id

      WHERE ep.department_id = $1
      ORDER BY ep.created_at DESC
    `;

    const result = await pool.query(query, [departmentId]);

    // const data = result.rows.map((row) => ({
    //   // Basic Info
    //   id: row.id,
    //   employeeId: row.employee_id,
    //   name: row.employee_name,
    //   ppoNo: row.ppo_no,
    //   oldPpo: row.old_ppo,
    //   aadhaar: row.aadhaar_no,
    //   pan: row.pan_no,
    //   dob: row.date_of_birth,
    //   doj: row.date_of_joining,
    //   retirementDate: row.retirement_date,
    //   dod: row.date_of_death,
    //   gender: row.gender,
    //   gradePay: row.grade_pay,
    //   lastSalary: row.last_salary_drawn,
    //   caste: row.caste_category,
    //   relation: row.relation,
    //   relationName: row.relation_name,
    //   mobile: row.mobile_no,
    //   familyMobile: row.family_mobile_no,
    //   status: row.status,
    //   createdAt: row.created_at,

    //   // Department & Designation
    //   department: row.department_name,
    //   designation: row.designation_name,

    //   // Pension Category
    //   categoryType: row.category_type,
    //   acp: row.acp,
    //   notionalIncrement: row.notional_increment,
    //   pfms: row.pfms,

    //   // Bank Details
    //   bankName: row.bank_name,
    //   ifsc: row.ifsc_code,
    //   micr: row.micr,
    //   acNo: row.bank_ac_no,
    //   acType: row.ac_type,

    //   // Address
    //   permAddress: row.permanent_address,
    //   corrAddress: row.correspondence_address,
    //   pinCode: row.pin_code,

    //   // Documents
    //   photo: row.photo_path,
    //   signature: row.signature_path,
    //   salarySlip: row.salary_slip_path,
    //   deathCertificate: row.death_certificate_path,
    // }));

    res.json({
      success: true,
      count: result.rows.length,
      departmentId,
      data: result.rows, // 👈 bas yahi kaafi hai
    });
  } catch (err) {
    console.error("getDepartmentPensioners error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}




//========== Pending Pensioners for Admin and Super Admin (Separate Endpoint) =================

async function getAdminPendingPensioners(req, res) {
  const client = await pool.connect();

  // const client = await pool.connect();

  const role = req.query.role;
  console.log("=============admin pending pensioners called with role diectly=======//")

  let query;
  let statusFilter = "";


  if (role === "super_admin_1"){

    statusFilter = "LOWER(ep.status) = 'Pending'";

    query = `
      SELECT 
        -- 👤 Employee Main
        ep.id,
        ep.ppo_no,
        ep.employee_id,
        ep.employee_name,
        ep.aadhaar_no,
        ep.pan_no,
        ep.date_of_birth,
        ep.date_of_joining,
        ep.retirement_date,
        ep.date_of_death,
        ep.gender,
        ep.grade_pay,
        ep.last_salary_drawn,
        ep.caste_category,
        ep.relation,
        ep.relation_name,
        ep.mobile_no,
        ep.family_mobile_no,

        -- 🏢 Department & Designation
        d.department_name,
        ds.designation_name,

        -- 💰 Pension Category
        pc.category_type,
        pc.acp,
        pc.notional_increment,
        pc.pfms,

        -- 🏦 Bank Details
        bd.bank_name,
        bd.ifsc_code,
        bd.micr,
        bd.bank_ac_no,
        bd.ac_type,

        -- 📍 Address
        ea.permanent_address,
        ea.correspondence_address,
        ea.pin_code,

        -- 📄 Documents
        ed.photo_path,
        ed.signature_path,
        ed.salary_slip_path,
        ed.death_certificate_path,

        -- 💸 Calculated
        ROUND(ep.last_salary_drawn * 0.5) AS monthly_pension,

        -- 🔄 Status
        COALESCE(ep.status, 'Pending') AS status

      FROM employee_pensioner ep

      LEFT JOIN departments d 
        ON ep.department_id = d.id

      LEFT JOIN designations ds 
        ON ep.designation_id = ds.id

      LEFT JOIN pension_category pc 
        ON ep.id = pc.employee_id

      LEFT JOIN bank_details bd 
        ON ep.id = bd.employee_id

      LEFT JOIN employee_address ea 
        ON ep.id = ea.employee_id

      LEFT JOIN employee_documents ed 
        ON ep.id = ed.employee_id

      WHERE ${statusFilter}

      ORDER BY ep.id DESC;
    `;

  } else {

    statusFilter = "LOWER(ep.status) = 'Admin Approved'";

     const query = `
      SELECT 
        -- 👤 Employee Main
        ep.id,
        ep.ppo_no,
        ep.employee_id,
        ep.employee_name,
        ep.aadhaar_no,
        ep.pan_no,
        ep.date_of_birth,
        ep.date_of_joining,
        ep.retirement_date,
        ep.date_of_death,
        ep.gender,
        ep.grade_pay,
        ep.last_salary_drawn,
        ep.caste_category,
        ep.relation,
        ep.relation_name,
        ep.mobile_no,
        ep.family_mobile_no,
        ep.edited_by_role,

        -- 🏢 Department & Designation
        d.department_name,
        ds.designation_name,

        -- 💰 Pension Category
        pc.category_type,
        pc.acp,
        pc.notional_increment,
        pc.pfms,

        -- 🏦 Bank Details
        bd.bank_name,
        bd.ifsc_code,
        bd.micr,
        bd.bank_ac_no,
        bd.ac_type,

        -- 📍 Address
        ea.permanent_address,
        ea.correspondence_address,
        ea.pin_code,

        -- 📄 Documents
        ed.photo_path,
        ed.signature_path,
        ed.salary_slip_path,
        ed.death_certificate_path,

        -- 💸 Calculated
        ROUND(ep.last_salary_drawn * 0.5) AS monthly_pension,

        -- 🔄 Status
        COALESCE(ep.status, 'Pending') AS status

      FROM employee_pensioner ep

      LEFT JOIN departments d 
        ON ep.department_id = d.id

      LEFT JOIN designations ds 
        ON ep.designation_id = ds.id

      LEFT JOIN pension_category pc 
        ON ep.id = pc.employee_id

      LEFT JOIN bank_details bd 
        ON ep.id = bd.employee_id

      LEFT JOIN employee_address ea 
        ON ep.id = ea.employee_id

      LEFT JOIN employee_documents ed 
        ON ep.id = ed.employee_id

      WHERE ${statusFilter}

      ORDER BY ep.id DESC;
    `;
  }
    try {
      const query = `
      SELECT 
        -- 👤 Employee Main
        ep.id,
        ep.ppo_no,
        ep.employee_id,
        ep.employee_name,
        ep.aadhaar_no,
        ep.pan_no,
        ep.date_of_birth,
        ep.date_of_joining,
        ep.retirement_date,
        ep.date_of_death,
        ep.gender,
        ep.grade_pay,
        ep.last_salary_drawn,
        ep.caste_category,
        ep.relation,
        ep.relation_name,
        ep.mobile_no,
        ep.family_mobile_no,
        ep.edited_by_role,

        -- 🏢 Department & Designation
        d.department_name,
        ds.designation_name,

        -- 💰 Pension Category
        pc.category_type,
        pc.acp,
        pc.notional_increment,
        pc.pfms,

        -- 🏦 Bank Details
        bd.bank_name,
        bd.ifsc_code,
        bd.micr,
        bd.bank_ac_no,
        bd.ac_type,

        -- 📍 Address
        ea.permanent_address,
        ea.correspondence_address,
        ea.pin_code,

        -- 📄 Documents
        ed.photo_path,
        ed.signature_path,
        ed.salary_slip_path,
        ed.death_certificate_path,

        -- 💸 Calculated
        ROUND(ep.last_salary_drawn * 0.5) AS monthly_pension,

        -- 🔄 Status
        COALESCE(ep.status, 'Pending') AS status

      FROM employee_pensioner ep

      LEFT JOIN departments d 
        ON ep.department_id = d.id

      LEFT JOIN designations ds 
        ON ep.designation_id = ds.id

      LEFT JOIN pension_category pc 
        ON ep.id = pc.employee_id

      LEFT JOIN bank_details bd 
        ON ep.id = bd.employee_id

      LEFT JOIN employee_address ea 
        ON ep.id = ea.employee_id

      LEFT JOIN employee_documents ed 
        ON ep.id = ed.employee_id

      WHERE LOWER(ep.status) = 'pending'

      ORDER BY ep.id DESC;
    `;

      const result = await client.query(query);

      res.status(200).json({
        success: true,
        count: result.rows.length,
        data: result.rows,
      });
    } catch (err) {
      console.error("GET ALL ERROR:", err);

      res.status(500).json({
        success: false,
        message: err.message || "Server error",
      });
    } finally {
      client.release();
    }

  //  try {
  //    const query = `
  //     SELECT
  //       ep.id,
  //       ep.ppo_no,
  //       ep.employee_id,
  //       ep.retirement_date,
  //       ep.last_salary_drawn,

  //       d.department_name,
  //       ds.designation_name,

  //       pc.category_type,

  //       -- calculate pension (example 50%)
  //       ROUND(ep.last_salary_drawn * 0.5) AS monthly_pension,

  //       COALESCE(ep.status, 'Pending') AS status

  //     FROM employee_pensioner ep

  //     LEFT JOIN departments d
  //       ON ep.department_id = d.id

  //     LEFT JOIN designations ds
  //       ON ep.designation_id = ds.id

  //     LEFT JOIN pension_category pc
  //       ON ep.id = pc.employee_id

  //     WHERE COALESCE(ep.status, 'Pending') = 'Pending'

  //     ORDER BY ep.id DESC;
  //   `;

  //    const result = await client.query(query);

  //    res.status(200).json({
  //      success: true,
  //      count: result.rows.length,
  //      data: result.rows,
  //    });
  //  } catch (err) {
  //    console.error("GET Pending Error:", err);

  //    res.status(500).json({
  //      success: false,
  //      message: err.message || "Server error",
  //    });
  //  } finally {
  //    client.release();
  //  }
}



//============Admin and CFO wise pending list ========================
//========== yeh tumhara role by pending hai =========================
async function getAdminPendingPensionersByRole(req, res) {
  const client = await pool.connect();

  const role = req.params.role;

 console.log("=====Bhai Ab chal rha hai ===============")

  let statusFilter = "";

  // ROLE WISE STATUS

  if (role === "super_admin_1") {
    statusFilter = "ep.status = 'Pending'";
  } else if (role === "super_admin_2") {
    statusFilter = "ep.status = 'Admin Approved'";
  } else {
    statusFilter = "1=1";
  }

  try {
    const query = `
      SELECT 
        -- 👤 Employee Main
        ep.id,
        ep.ppo_no,
        ep.employee_id,
        ep.employee_name,
        ep.aadhaar_no,
        ep.pan_no,
        ep.date_of_birth,
        ep.date_of_joining,
        ep.retirement_date,
        ep.date_of_death,
        ep.gender,
        ep.grade_pay,
        ep.last_salary_drawn,
        ep.caste_category,
        ep.relation,
        ep.relation_name,
        ep.mobile_no,
        ep.family_mobile_no,
        ep.edited_by_role,

        -- 🏢 Department & Designation
        d.department_name,
        ds.designation_name,

        -- 💰 Pension Category
        pc.category_type,
        pc.acp,
        pc.notional_increment,
        pc.pfms,

        -- 🏦 Bank Details
        bd.bank_name,
        bd.ifsc_code,
        bd.micr,
        bd.bank_ac_no,
        bd.ac_type,

        -- 📍 Address
        ea.permanent_address,
        ea.correspondence_address,
        ea.pin_code,

        -- 📄 Documents
        ed.photo_path,
        ed.signature_path,
        ed.salary_slip_path,
        ed.death_certificate_path,

        -- 💸 Calculated
        ROUND(ep.last_salary_drawn * 0.5) AS monthly_pension,

        -- 🔄 Status
        COALESCE(ep.status, 'Pending') AS status

      FROM employee_pensioner ep

      LEFT JOIN departments d 
        ON ep.department_id = d.id

      LEFT JOIN designations ds 
        ON ep.designation_id = ds.id

      LEFT JOIN pension_category pc 
        ON ep.id = pc.employee_id

      LEFT JOIN bank_details bd 
        ON ep.id = bd.employee_id

      LEFT JOIN employee_address ea 
        ON ep.id = ea.employee_id

      LEFT JOIN employee_documents ed 
        ON ep.id = ed.employee_id

      WHERE ${statusFilter}

      ORDER BY ep.id DESC;
    `;

    const result = await client.query(query);

    res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    console.error("GET ALL ERROR:", err);

    res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  } finally {
    client.release();
  }
}





function getStats(req, res) {
  const { pensioners } = getCollections();
  res.json({
    success: true,
    data: {
      total: pensioners.count(),
      active: pensioners.find({ status: "Active" }).length,
      stopped: pensioners.find({ status: "Stopped" }).length,
      closed: pensioners.find({ status: "Closed" }).length,
      pending: pensioners.find({ status: "Pending" }).length,
    },
  });
}

function sanitizePensioner(p) {
  const { $loki, meta, ...rest } = p;
  return { ...rest, id: $loki };
}

module.exports = {
  listPensioners,
  createPensioner,
  getDepartmentPensioners,
  // getAdminPendingPensioners,
  getAdminPendingPensionersByRole,
  handleAdminAllRecords,
  handleAdminAction,
  updatePensioner,
  getStats,
  getPensionerById,
  downloadActivityLogsCSV,
  getFullApprovedPensioners,
  getDepartmentPensionersByAdmin,
};
