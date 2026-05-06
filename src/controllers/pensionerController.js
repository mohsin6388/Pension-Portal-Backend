require("dotenv").config();
const cloudinary = require("../config/cloudinary");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString:
    "postgresql://pension_system_user:wHeVesZgDg7wgkzYA3lQvDPwzThXYjt4@dpg-d7sej9navr4c73ame5dg-a.oregon-postgres.render.com/pension_system",
  ssl: {
    rejectUnauthorized: false,
  },
});

// const pool = new Pool({
//   host: "localhost",
//   port:  5432,
//   database: "Pension_System",
//   user: "postgres",
//   // password: process.env.DB_PASSWORD || '',
//   password: "Mohsin@123",
//   max: 20,
//   idleTimeoutMillis: 30000,
//   connectionTimeoutMillis: 2000,
// });

pool.on("connect", () => {
  console.log("✅ Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("❌ Unexpected error on idle client", err);
  process.exit(-1);
});

// ── GET /api/pensioners ───────────────────────────────────────────────────────
// Query params: status, search, page, limit
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

// ── GET /api/pensioners/:ppoOrId ──────────────────────────────────────────────

async function getPensioner(req, res) {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        ep.id,
        ep.employee_id,
        ep.ppo_no,

        d.department_name,
        des.designation_name,

        ep.aadhaar_no,
        ep.pan_no,
        ep.date_of_birth,
        ep.date_of_joining,
        ep.retirement_date,
        ep.date_of_death,

        ep.gender,
        ep.emp_category,
        ep.grade_pay,
        ep.last_salary_drawn,
        ep.caste_category,
        ep.dependent_name,

        ep.mobile_no,
        ep.family_mobile_no,

        pc.category_type,
        pc.category_pct,
        pc.acp,
        pc.notional_increment,
        pc.pfms,

        bd.bank_name,
        bd.ifsc_code,
        bd.micr,
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
      LEFT JOIN departments d ON ep.department_id = d.id
      LEFT JOIN designations des ON ep.designation_id = des.id
      LEFT JOIN pension_category pc ON pc.employee_id = ep.id
      LEFT JOIN bank_details bd ON bd.employee_id = ep.id
      LEFT JOIN employee_address ea ON ea.employee_id = ep.id
      LEFT JOIN employee_documents ed ON ed.employee_id = ep.id

      WHERE ep.employee_id = $1 OR ep.ppo_no = $1
      LIMIT 1;
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pensioner not found",
      });
    }

    const row = result.rows[0];

    // 🔥 Transform DB → frontend format (your original structure)
    const data = {
      employeeId: row.employee_id,
      ppoNo: row.ppo_no,
      department: row.department_name,
      designation: row.designation_name,

      aadhaar: row.aadhaar_no,
      pan: row.pan_no,

      dob: row.date_of_birth,
      doj: row.date_of_joining,
      retirementDate: row.retirement_date,
      dod: row.date_of_death,

      gender: row.gender,
      empCategory: row.emp_category,

      gradePay: row.grade_pay,
      lastSalary: row.last_salary_drawn,

      caste: row.caste_category,
      dependentName: row.dependent_name,

      mobile: row.mobile_no,
      familyMobile: row.family_mobile_no,

      categoryType: row.category_type,
      categoryPct: row.category_pct,
      acp: row.acp ? "Y" : "N",
      notionalIncrement: row.notional_increment ? "Y" : "N",
      pfms: row.pfms,

      bankName: row.bank_name,
      ifsc: row.ifsc_code,
      micr: row.micr,
      acNo: row.bank_ac_no,
      acType: row.ac_type,

      permAddress: row.permanent_address,
      corrAddress: row.correspondence_address,
      pinCode: row.pin_code,

      documents: {
        photo: row.photo_path,
        signature: row.signature_path,
        salarySlip: row.salary_slip_path,
        deathCertificate: row.death_certificate_path,
      },
    };

    res.json({
      success: true,
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


// function getPensioner(req, res) {
//   try {
//     const { pensioners } = getCollections();
//     const { id } = req.params;

//     let pensioner =
//       pensioners.findOne({ ppoNumber: id }) ||
//       pensioners.findOne({ employeeId: id });

//     if (!pensioner) return res.status(404).json({ success: false, message: "Pensioner not found" });

//     res.json({ success: true, data: sanitizePensioner(pensioner) });
//   } catch (err) {
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// }

// ── POST /api/pensioners ──────────────────────────────────────────────────────

async function uploadToCloudinary(file, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      },
    );

    stream.end(file.buffer);
  });
}

async function createPensioner(req, res) {
  const client = await pool.connect();

  try {
    const body = req.body;

    // =========================
    // ✅ Basic validation
    // =========================
    if (
      !body.employeeId ||
      !body.department ||
      !body.designation ||
      !body.retirementDate
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

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

    // =========================
    // 3️⃣ Generate PPO if missing
    // =========================
    let ppoNo = body.ppoNo;

    if (!ppoNo) {
      const year = new Date().getFullYear();

      const countRes = await client.query(
        "SELECT COUNT(*) FROM employee_pensioner",
      );
      const count = parseInt(countRes.rows[0].count) + 1;

      ppoNo = `KMC/${year}/${String(count).padStart(3, "0")}`;
    }

    // =========================
    // 4️⃣ Insert employee
    // =========================
    const empInsert = await client.query(
      `INSERT INTO employee_pensioner (
        employee_id, ppo_no, department_id, designation_id,
        aadhaar_no, pan_no,
        date_of_birth, date_of_joining, retirement_date, date_of_death,
        gender, emp_category,
        grade_pay, last_salary_drawn,
        caste_category, dependent_name,
        mobile_no, family_mobile_no
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18
      )
      RETURNING id`,
      [
        body.employeeId,
        ppoNo,
        departmentId,
        designationId,
        body.aadhaar,
        body.pan,
        body.dob,
        body.doj || null,
        body.retirementDate,
        body.dod || null,
        body.gender,
        body.empCategory,
        Number(body.gradePay),
        Number(body.lastSalary),
        body.caste,
        body.dependentName,
        body.mobile,
        body.familyMobile,
      ],
    );

    const employeeId = empInsert.rows[0].id;

    // =========================
    // 5️⃣ Upload Documents (AFTER employeeId exists)
    // =========================
    const photoUrl = req.files?.photo?.[0]?.path || null;
    const signatureUrl = req.files?.signature?.[0]?.path || null;
    const salarySlipUrl = req.files?.salarySlip?.[0]?.path || null;
    const deathCertificateUrl = req.files?.deathCertificate?.[0]?.path || null;

    await client.query(
      `INSERT INTO employee_documents (
        employee_id,
        photo_path,
        signature_path,
        salary_slip_path,
        death_certificate_path
      )
      VALUES ($1,$2,$3,$4,$5)`,
      [employeeId, photoUrl, signatureUrl, salarySlipUrl, deathCertificateUrl],
    );

    // =========================
    // 6️⃣ Pension Category
    // =========================
    await client.query(
      `INSERT INTO pension_category (
        employee_id, category_type, category_pct,
        acp, notional_increment, pfms
      )
      VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        employeeId,
        body.categoryType,
        Number(body.categoryPct),
        body.acp === "Y",
        body.notionalIncrement === "Y",
        body.pfms,
      ],
    );

    // =========================
    // 7️⃣ Bank Details
    // =========================
    await client.query(
      `INSERT INTO bank_details (
        employee_id, bank_name, ifsc_code, micr,
        bank_ac_no, ac_type
      )
      VALUES ($1,$2,$3,$4,$5,$6)`,
      [employeeId, body.bankName, body.ifsc, body.micr, body.acNo, body.acType],
    );

    // =========================
    // 8️⃣ Address
    // =========================
    await client.query(
      `INSERT INTO employee_address (
        employee_id, permanent_address, correspondence_address, pin_code
      )
      VALUES ($1,$2,$3,$4)`,
      [employeeId, body.permAddress, body.corrAddress || null, body.pinCode],
    );

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
}


//Admin Routes Functions =======================
//================================================


async function getAdminPendingPensioners(req, res) {
  const client = await pool.connect();

  // const client = await pool.connect();

  try {
    const query = `
      SELECT 
        -- 👤 Employee Main
        ep.id,
        ep.ppo_no,
        ep.employee_id,
        ep.aadhaar_no,
        ep.pan_no,
        ep.date_of_birth,
        ep.date_of_joining,
        ep.retirement_date,
        ep.date_of_death,
        ep.gender,
        ep.emp_category,
        ep.grade_pay,
        ep.last_salary_drawn,
        ep.caste_category,
        ep.dependent_name,
        ep.mobile_no,
        ep.family_mobile_no,

        -- 🏢 Department & Designation
        d.department_name,
        ds.designation_name,

        -- 💰 Pension Category
        pc.category_type,
        pc.category_pct,
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

async function handleAdminAllRecords(req, res) {
  try {
    const query = `
      SELECT 
        ep.id,
        ep.employee_id,
        ep.ppo_no,

        ep.aadhaar_no,
        ep.pan_no,
        ep.date_of_birth,
        ep.date_of_joining,
        ep.retirement_date,
        ep.date_of_death,

        ep.gender,
        ep.emp_category,
        ep.grade_pay,
        ep.last_salary_drawn,
        ep.caste_category,
        ep.status, 

        ep.dependent_name,
        ep.mobile_no,
        ep.family_mobile_no,

        d.department_name,
        des.designation_name,

        pc.category_type,
        pc.category_pct,
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


async function handleAdminAction(req, res) {
  const { ppo_no, action, remark, user } = req.body;

  console.log(req.body)

  if (!ppo_no || !action) {
    return res.status(400).json({
      success: false,
      message: "ppo_no and action are required",
    });
  }

  let status;

  try {
    if(user.role === "super_admin_1")
    {
       status =
        action === "approve"
          ? "Admin Approved"
          : action === "reject"
            ? "Admin Rejected"
            : null;
    } else {
        status =
        action === "approve"
          ? "Full Approved"
          : action === "reject"
            ? "Full Rejected"
            : null;
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Invalid action",
      });
    }

    // 🔥 update using PPO number
    const result = await pool.query(
      `UPDATE employee_pensioner
       SET status = $1
       WHERE ppo_no = $2
       RETURNING ppo_no, status`,
      [status, ppo_no],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "PPO not found",
      });
    }

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

// async function createPensioner(req, res) {

//   const client = await pool.connect();

//   // const files = req.files;

//   // let photoUrl = null;
//   // let signatureUrl = null;
//   // let salarySlipUrl = null;
//   // let deathCertificateUrl = null;

//   // // Upload files if exist
//   // if (files.photo) {
//   //   photoUrl = await uploadToCloudinary(files.photo[0], "pensioners/photo");
//   // }

//   // if (files.signature) {
//   //   signatureUrl = await uploadToCloudinary(
//   //     files.signature[0],
//   //     "pensioners/signature",
//   //   );
//   // }

//   // if (files.salarySlip) {
//   //   salarySlipUrl = await uploadToCloudinary(
//   //     files.salarySlip[0],
//   //     "pensioners/salary",
//   //   );
//   // }

//   // if (files.deathCertificate) {
//   //   deathCertificateUrl = await uploadToCloudinary(
//   //     files.deathCertificate[0],
//   //     "pensioners/death",
//   //   );
//   // }

//   try {
//     const body = req.body;

//     // =========================
//     // ✅ Basic validation
//     // =========================
//     if (!body.employeeId || !body.department || !body.designation || !body.retirementDate) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing required fields",
//       });
//     }

//     await client.query("BEGIN");

//     // =========================
//     // 1️⃣ Get department_id
//     // =========================
//     const deptRes = await client.query(
//       "SELECT id FROM departments WHERE department_name = $1",
//       [body.department]
//     );

//     await client.query(
//       `INSERT INTO employee_documents (
//     employee_id,
//     photo_path,
//     signature_path,
//     salary_slip_path,
//     death_certificate_path
//   )
//   VALUES ($1,$2,$3,$4,$5)`,
//       [employeeId, photoUrl, signatureUrl, salarySlipUrl, deathCertificateUrl],
//     );

//     if (deptRes.rows.length === 0) {
//       throw new Error("Invalid department");
//     }

//     const departmentId = deptRes.rows[0].id;

//     // =========================
//     // 2️⃣ Get designation_id
//     // =========================
//     const desigRes = await client.query(
//       "SELECT id FROM designations WHERE designation_name = $1",
//       [body.designation]
//     );

//     if (desigRes.rows.length === 0) {
//       throw new Error("Invalid designation");
//     }

//     const designationId = desigRes.rows[0].id;

//     // =========================
//     // 3️⃣ Generate PPO if missing
//     // =========================
//     let ppoNo = body.ppoNo;

//     if (!ppoNo) {
//       const year = new Date().getFullYear();

//       const countRes = await client.query("SELECT COUNT(*) FROM employee_pensioner");
//       const count = parseInt(countRes.rows[0].count) + 1;

//       ppoNo = `KMC/${year}/${String(count).padStart(3, "0")}`;
//     }

//     // =========================
//     // 4️⃣ Insert employee
//     // =========================
//     const empInsert = await client.query(
//       `INSERT INTO employee_pensioner (
//         employee_id, ppo_no, department_id, designation_id,
//         aadhaar_no, pan_no,
//         date_of_birth, date_of_joining, retirement_date, date_of_death,
//         gender, emp_category,
//         grade_pay, last_salary_drawn,
//         caste_category, dependent_name,
//         mobile_no, family_mobile_no
//       )
//       VALUES (
//         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
//         $11,$12,$13,$14,$15,$16,$17,$18
//       )
//       RETURNING id`,
//       [
//         body.employeeId,
//         ppoNo,
//         departmentId,
//         designationId,
//         body.aadhaar,
//         body.pan,
//         body.dob,
//         body.doj || null,
//         body.retirementDate,
//         body.dod || null,
//         body.gender,
//         body.empCategory,
//         Number(body.gradePay),
//         Number(body.lastSalary),
//         body.caste,
//         body.dependentName,
//         body.mobile,
//         body.familyMobile
//       ]
//     );

//     const employeeId = empInsert.rows[0].id;

//     // =========================
//     // 5️⃣ Pension Category
//     // =========================
//     await client.query(
//       `INSERT INTO pension_category (
//         employee_id, category_type, category_pct,
//         acp, notional_increment, pfms
//       )
//       VALUES ($1,$2,$3,$4,$5,$6)`,
//       [
//         employeeId,
//         body.categoryType,
//         Number(body.categoryPct),
//         body.acp === "Y",
//         body.notionalIncrement === "Y",
//         body.pfms
//       ]
//     );

//     // =========================
//     // 6️⃣ Bank Details
//     // =========================
//     await client.query(
//       `INSERT INTO bank_details (
//         employee_id, bank_name, ifsc_code, micr,
//         bank_ac_no, ac_type
//       )
//       VALUES ($1,$2,$3,$4,$5,$6)`,
//       [
//         employeeId,
//         body.bankName,
//         body.ifsc,
//         body.micr,
//         body.acNo,
//         body.acType
//       ]
//     );

//     // =========================
//     // 7️⃣ Address
//     // =========================
//     await client.query(
//       `INSERT INTO employee_address (
//         employee_id, permanent_address, correspondence_address, pin_code
//       )
//       VALUES ($1,$2,$3,$4)`,
//       [
//         employeeId,
//         body.permAddress,
//         body.corrAddress || null,
//         body.pinCode
//       ]
//     );

//     // =========================
//     // 8️⃣ Documents (empty init)
//     // =========================
//     await client.query(
//       `INSERT INTO employee_documents (employee_id)
//        VALUES ($1)`,
//       [employeeId]
//     );

//     // =========================
//     // ✅ COMMIT
//     // =========================
//     await client.query("COMMIT");

//     res.status(201).json({
//       success: true,
//       message: "Pensioner created successfully",
//       employeeId,
//     });

//   } catch (err) {
//     await client.query("ROLLBACK");

//     console.error(err);

//     res.status(500).json({
//       success: false,
//       message: err.message || "Server error",
//     });
//   } finally {
//     client.release();
//   }
// }

// function createPensioner(req, res) {

//   console.log("Creating pensioner with data:", req.body);

//   try {
//     const { pensioners } = getCollections();
//     const body = req.body;

//     if (!body.name || !body.employeeId || !body.department || !body.retirementDate) {
//       return res.status(400).json({ success: false, message: "Required fields: name, employeeId, department, retirementDate" });
//     }

//     // Auto-generate PPO if not provided
//     if (!body.ppoNumber) {
//       const year = new Date().getFullYear();
//       const count = pensioners.count() + 1;
//       body.ppoNumber = `KMC/${year}/${String(count).padStart(3, "0")}`;
//     }

//     // Check duplicate
//     if (pensioners.findOne({ ppoNumber: body.ppoNumber })) {
//       return res.status(409).json({ success: false, message: `PPO number ${body.ppoNumber} already exists` });
//     }
//     if (pensioners.findOne({ employeeId: body.employeeId })) {
//       return res.status(409).json({ success: false, message: `Employee ID ${body.employeeId} already exists` });
//     }

//     const now = new Date().toISOString();
//     const newPensioner = {
//       ...body,
//       status: "Pending",
//       createdBy: req.user.username,
//       createdAt: now,
//       updatedAt: now,
//     };

//     const inserted = pensioners.insert(newPensioner);
//     res.status(201).json({ success: true, message: "Pensioner registered successfully", data: sanitizePensioner(inserted) });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ success: false, message: "Server error" });
//   }
// }

// ── PUT /api/pensioners/:id ───────────────────────────────────────────────────

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

function updatePensioner(req, res) {
  try {
    const { pensioners } = getCollections();
    const { id } = req.params;

    let pensioner =
      pensioners.findOne({ ppoNumber: id }) ||
      pensioners.findOne({ employeeId: id });
    if (!pensioner)
      return res
        .status(404)
        .json({ success: false, message: "Pensioner not found" });

    // Protect immutable fields
    const { ppoNumber, employeeId, createdAt, createdBy, ...updateData } =
      req.body;

    Object.assign(pensioner, updateData, {
      updatedAt: new Date().toISOString(),
      updatedBy: req.user.username,
    });
    pensioners.update(pensioner);

    res.json({
      success: true,
      message: "Pensioner updated",
      data: sanitizePensioner(pensioner),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// ── GET /api/pensioners/stats ─────────────────────────────────────────────────
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
  getPensioner,
  createPensioner,
  getDepartmentPensioners,
  getAdminPendingPensioners,
  handleAdminAllRecords,
  handleAdminAction,
  updatePensioner,
  getStats,
};
