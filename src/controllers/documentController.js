const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { getCollections } = require("../config/database");

const UPLOAD_DIR = path.join(__dirname, "../../uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── Multer config ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_DIR, req.params.ppo || "misc");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = [".pdf", ".jpg", ".jpeg", ".png"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error("Only PDF and image files are allowed"), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// ── POST /api/documents/upload/:ppo ──────────────────────────────────────────
const uploadMiddleware = upload.single("file");

function uploadDocument(req, res) {
  uploadMiddleware(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const { documents } = getCollections();
    const docRecord = documents.insert({
      id: uuidv4(),
      ppoNumber: req.params.ppo,
      label: req.body.label || req.file.originalname,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      uploadedBy: req.user.username,
      uploadedAt: new Date().toISOString(),
    });

    res.status(201).json({
      success: true,
      message: "Document uploaded",
      data: { id: docRecord.id, label: docRecord.label, filename: docRecord.filename, size: req.file.size },
    });
  });
}

// ── GET /api/documents/:ppo ───────────────────────────────────────────────────
function listDocuments(req, res) {
  const { documents } = getCollections();
  const docs = documents.find({ ppoNumber: req.params.ppo });
  res.json({
    success: true,
    data: docs.map(({ $loki, meta, path: p, ...d }) => d),
  });
}

module.exports = { uploadDocument, listDocuments };
