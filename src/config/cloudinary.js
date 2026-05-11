const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: "dwy14qnbw", // process.env.CLOUD_NAME,
  api_key: "934614232953175", // process.env.CLOUD_API_KEY,
  api_secret: "1VTaR0X3ahL-Zpoon4XbNrg-UR4", // process.env.CLOUD_API_SECRET,
});

module.exports = cloudinary;
