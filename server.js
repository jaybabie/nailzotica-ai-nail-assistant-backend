// server.js
require("dotenv").config();

const app = require("./src/app");

// ✅ Initialize Firebase Admin at startup (fail fast if config is wrong)
require("./src/lib/firebaseAdmin");

const PORT = Number(process.env.PORT) || 4100;

app.listen(PORT, () => {
  console.log(`✅ AI Nail Assistant server listening on port ${PORT} (server.js)`);
});
