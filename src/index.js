// src/index.js
require("dotenv").config();

const app = require("./app");

// ✅ Initialize Firebase Admin at startup (fail fast if config is wrong)
require("./lib/firebaseAdmin");

const PORT = Number(process.env.PORT) || 4100;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ AI Nail Assistant listening on ${PORT} (src/index.js)`);
});
