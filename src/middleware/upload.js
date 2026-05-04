const multer = require("multer");

const storage = multer.memoryStorage(); // store in memory (important)

const upload = multer({ storage });

module.exports = upload;
