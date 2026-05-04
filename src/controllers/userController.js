const bcrypt = require("bcryptjs");
const { getCollections } = require("../config/database");

// ── GET /api/users ────────────────────────────────────────────────────────────
function listUsers(req, res) {
  const { users } = getCollections();
  const all = users.find().map(({ $loki, meta, passwordHash, ...u }) => ({ ...u, id: $loki }));
  res.json({ success: true, data: all });
}

// ── POST /api/users ───────────────────────────────────────────────────────────
async function createUser(req, res) {
  try {
    const { username, email, password, fullName, role, department } = req.body;
    if (!username || !email || !password || !fullName || !role) {
      return res.status(400).json({ success: false, message: "username, email, password, fullName, role are required" });
    }

    const VALID_ROLES = ["admin", "cfo", "clerk"];
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: `Role must be one of: ${VALID_ROLES.join(", ")}` });
    }

    const { users } = getCollections();

    if (users.findOne({ username: username.toLowerCase() })) {
      return res.status(409).json({ success: false, message: "Username already exists" });
    }
    if (users.findOne({ email: email.toLowerCase() })) {
      return res.status(409).json({ success: false, message: "Email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = users.insert({
      username: username.toLowerCase().trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      fullName,
      role,
      department: department || "",
      isActive: true,
      createdBy: req.user.username,
      createdAt: new Date().toISOString(),
    });

    const { passwordHash: _, $loki, meta, ...safe } = user;
    res.status(201).json({ success: true, message: "User created", data: { ...safe, id: user.$loki } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

// ── PUT /api/users/:id/toggle-active ─────────────────────────────────────────
function toggleUserActive(req, res) {
  const { users } = getCollections();
  const user = users.get(parseInt(req.params.id));
  if (!user) return res.status(404).json({ success: false, message: "User not found" });
  if (user.$loki === req.user.id) {
    return res.status(400).json({ success: false, message: "Cannot deactivate your own account" });
  }
  user.isActive = !user.isActive;
  user.updatedAt = new Date().toISOString();
  users.update(user);
  res.json({ success: true, message: `User ${user.isActive ? "activated" : "deactivated"}`, data: { isActive: user.isActive } });
}

module.exports = { listUsers, createUser, toggleUserActive };
