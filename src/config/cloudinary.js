const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: "Byte-Images", // process.env.CLOUD_NAME,
  api_key: "421759979941452", // process.env.CLOUD_API_KEY,
  api_secret: "mc_DVFhmMNSWQl9xD7T6MUR4iPk", // process.env.CLOUD_API_SECRET,
});

module.exports = cloudinary;
