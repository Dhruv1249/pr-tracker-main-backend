require("dotenv").config();
const crypto = require("crypto");

const algorithm = "aes-256-cbc";

const secretKey = crypto
  .createHash("sha256")
  .update(process.env.ENCRYPTION_SECRET)
  .digest("base64")
  .substr(0, 32);

function decrypt(text) {
  const parts = text.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const encryptedText = parts[1];

  const decipher = crypto.createDecipheriv(
    algorithm,
    Buffer.from(secretKey),
    iv
  );

  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

module.exports = { decrypt };
