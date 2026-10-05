const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: "f8kh2lca", // process.env.CLOUD_NAME,
  api_key: "696134945358238", // process.env.CLOUD_API_KEY,
  api_secret: "4CCgmQqZXPC5dE0PORcvX2X96A8", // process.env.CLOUD_API_SECRET,
});

module.exports = cloudinary;
