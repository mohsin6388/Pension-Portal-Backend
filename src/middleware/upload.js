const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");
const path = require("path");

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const isPdf = file.mimetype === "application/pdf";

    return {
      folder: "pensioners",

      resource_type: isPdf ? "raw" : "image",

      format: isPdf ? "pdf" : undefined,

      public_id: Date.now() + "-" + path.parse(file.originalname).name,
    };
  },
});

const upload = multer({ storage });

module.exports = upload;

// const multer = require("multer");
// const { CloudinaryStorage } = require("multer-storage-cloudinary");
// const cloudinary = require("../config/cloudinary");

// const storage = new CloudinaryStorage({
//   cloudinary: cloudinary,
//   params: async (req, file) => {
//     return {
//       folder: "pensioners",
//       resource_type: "auto",
//       public_id: Date.now() + "-" + file.originalname,
//     };
//   },
// });

// const upload = multer({ storage });

// module.exports = upload;
