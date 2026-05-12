require("dotenv").config();
const jwt = require("jsonwebtoken");
const JWT_SECRET = "Mohsin@123"; // In production, use process.env.JWT_SECRET and keep it secret!

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },

    JWT_SECRET,

    {
      expiresIn: "7d",
    },
  );
};

module.exports = generateToken;
