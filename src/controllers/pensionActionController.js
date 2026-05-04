const { v4: uuidv4 } = require("uuid");
const { getCollections } = require("../config/database");

// ── Helper: find pensioner by PPO or employee ID ──────────────────────────────
function findPensioner(id) {
  const { pensioners } = getCollections();
  return (
    pensioners.findOne({ ppoNumber: id }) ||
    pensioners.findOne({ ppoNumber: { $regex: new RegExp(id, "i") } }) ||
    pensioners.findOne({ employeeId: id })
  );
}

// ── POST /api/pension-actions/stop ────────────────────────────────────────────
function stopPension(req, res) {
  try {
    const { pensioners, pensionActions } = getCollections();
    const { ppoOrId, stopFromDate, reason, remarks } = req.body;

    if (!ppoOrId || !stopFromDate || !reason) {
      return res.status(400).json({ success: false, message: "ppoOrId, stopFromDate, and reason are required" });
    }

    const pensioner = findPensioner(ppoOrId);
    if (!pensioner) return res.status(404).json({ success: false, message: "Pensioner not found" });

    if (pensioner.status === "Stopped") {
      return res.status(400).json({ success: false, message: "Pension is already stopped" });
    }
    if (pensioner.status === "Closed") {
      return res.status(400).json({ success: false, message: "Cannot stop a closed pension" });
    }

    const actionId = `KMC-STP-${new Date().getFullYear()}-${uuidv4().slice(0, 6).toUpperCase()}`;
    const now = new Date().toISOString();

    // Create action record (pending CFO approval)
    const action = pensionActions.insert({
      actionId,
      type: "STOP",
      ppoNumber: pensioner.ppoNumber,
      pensionerName: pensioner.name,
      department: pensioner.department,
      stopFromDate,
      reason,
      remarks: remarks || "",
      requestedBy: req.user.username,
      requestedAt: now,
      status: "PENDING_APPROVAL",     // PENDING_APPROVAL | APPROVED | REJECTED
      approvedBy: null,
      approvedAt: null,
      rejectionReason: null,
    });

    res.status(201).json({
      success: true,
      message: "Stop pension request submitted for CFO approval",
      data: { actionId, status: "PENDING_APPROVAL" },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// ── POST /api/pension-actions/resume ─────────────────────────────────────────
function resumePension(req, res) {
  try {
    const { pensionActions } = getCollections();
    const { ppoOrId, resumeFromDate, resumeReason, arrearsOption, remarks } = req.body;

    if (!ppoOrId || !resumeFromDate || !resumeReason) {
      return res.status(400).json({ success: false, message: "ppoOrId, resumeFromDate, and resumeReason are required" });
    }

    const pensioner = findPensioner(ppoOrId);
    if (!pensioner) return res.status(404).json({ success: false, message: "Pensioner not found" });

    if (pensioner.status !== "Stopped") {
      return res.status(400).json({ success: false, message: `Cannot resume. Current status: ${pensioner.status}` });
    }

    const actionId = `KMC-RSM-${new Date().getFullYear()}-${uuidv4().slice(0, 6).toUpperCase()}`;

    pensionActions.insert({
      actionId,
      type: "RESUME",
      ppoNumber: pensioner.ppoNumber,
      pensionerName: pensioner.name,
      department: pensioner.department,
      resumeFromDate,
      resumeReason,
      arrearsOption: arrearsOption || "Yes — Pay Full Arrears",
      remarks: remarks || "",
      requestedBy: req.user.username,
      requestedAt: new Date().toISOString(),
      status: "PENDING_APPROVAL",
      approvedBy: null,
      approvedAt: null,
    });

    res.status(201).json({
      success: true,
      message: "Resume pension request submitted for CFO approval",
      data: { actionId, status: "PENDING_APPROVAL" },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// ── POST /api/pension-actions/close ──────────────────────────────────────────
function closePension(req, res) {
  try {
    const { pensionActions } = getCollections();
    const { ppoOrId, closureReason, closureDate, dod, dodReference, outstandingDues, finalRemarks } = req.body;

    if (!ppoOrId || !closureReason || !closureDate || !finalRemarks) {
      return res.status(400).json({ success: false, message: "ppoOrId, closureReason, closureDate, and finalRemarks are required" });
    }

    const pensioner = findPensioner(ppoOrId);
    if (!pensioner) return res.status(404).json({ success: false, message: "Pensioner not found" });

    if (pensioner.status === "Closed") {
      return res.status(400).json({ success: false, message: "Pension is already closed" });
    }

    const actionId = `KMC-CLO-${new Date().getFullYear()}-${uuidv4().slice(0, 6).toUpperCase()}`;

    pensionActions.insert({
      actionId,
      type: "CLOSE",
      ppoNumber: pensioner.ppoNumber,
      pensionerName: pensioner.name,
      department: pensioner.department,
      closureReason,
      closureDate,
      dod: dod || null,
      dodReference: dodReference || "",
      outstandingDues: parseFloat(outstandingDues) || 0,
      finalRemarks,
      requestedBy: req.user.username,
      requestedAt: new Date().toISOString(),
      status: "PENDING_APPROVAL",
      approvedBy: null,
      approvedAt: null,
    });

    res.status(201).json({
      success: true,
      message: "Closure request submitted for CFO approval",
      data: { actionId, status: "PENDING_APPROVAL" },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// ── GET /api/pension-actions ──────────────────────────────────────────────────
function listActions(req, res) {
  try {
    const { pensionActions } = getCollections();
    const { type, status, ppo } = req.query;

    let query = {};
    if (type) query.type = type;
    if (status) query.status = status;
    if (ppo) query.ppoNumber = ppo;

    const actions = pensionActions.find(Object.keys(query).length ? query : undefined);

    res.json({ success: true, data: actions.map(({ $loki, meta, ...a }) => a) });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// ── PUT /api/pension-actions/:actionId/approve  (CFO only) ───────────────────
function approveAction(req, res) {
  try {
    const { pensioners, pensionActions } = getCollections();
    const { actionId } = req.params;

    const action = pensionActions.findOne({ actionId });
    if (!action) return res.status(404).json({ success: false, message: "Action not found" });

    if (action.status !== "PENDING_APPROVAL") {
      return res.status(400).json({ success: false, message: `Action is already ${action.status}` });
    }

    const pensioner = pensioners.findOne({ ppoNumber: action.ppoNumber });
    if (!pensioner) return res.status(404).json({ success: false, message: "Pensioner not found" });

    // Apply the action
    if (action.type === "STOP") pensioner.status = "Stopped";
    else if (action.type === "RESUME") pensioner.status = "Active";
    else if (action.type === "CLOSE") pensioner.status = "Closed";

    pensioner.updatedAt = new Date().toISOString();
    pensioner.updatedBy = req.user.username;
    pensioners.update(pensioner);

    action.status = "APPROVED";
    action.approvedBy = req.user.username;
    action.approvedAt = new Date().toISOString();
    pensionActions.update(action);

    res.json({
      success: true,
      message: `Action ${actionId} approved. Pensioner status updated to ${pensioner.status}`,
      data: { actionId, newStatus: pensioner.status },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// ── PUT /api/pension-actions/:actionId/reject  (CFO only) ────────────────────
function rejectAction(req, res) {
  try {
    const { pensionActions } = getCollections();
    const { actionId } = req.params;
    const { rejectionReason } = req.body;

    const action = pensionActions.findOne({ actionId });
    if (!action) return res.status(404).json({ success: false, message: "Action not found" });

    if (action.status !== "PENDING_APPROVAL") {
      return res.status(400).json({ success: false, message: `Action is already ${action.status}` });
    }

    action.status = "REJECTED";
    action.rejectionReason = rejectionReason || "No reason provided";
    action.rejectedBy = req.user.username;
    action.rejectedAt = new Date().toISOString();
    pensionActions.update(action);

    res.json({ success: true, message: `Action ${actionId} rejected`, data: { actionId, status: "REJECTED" } });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
}

module.exports = { stopPension, resumePension, closePension, listActions, approveAction, rejectAction };
