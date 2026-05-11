const cloudinary = require("../config/cloudinary");

async function uploadFile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: "auto",
      folder: "my_uploads",
    });

    return res.json({
      success: true,
      data: {
        public_id: result.public_id,
        secure_url: result.secure_url,
        resource_type: result.resource_type,
        format: result.format,
      },
    });
  } catch (err) {
    console.log(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}


module.exports = {
  uploadFile,
};
