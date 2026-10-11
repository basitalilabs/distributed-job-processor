// Pretends to be a shop that receives webhooks. Test tool only.
// MODE=ok   -> answers 200
// MODE=fail -> answers 500
const express = require("express");

const PORT = 4000;
const MODE = process.env.MODE || "ok";

const app = express();
app.use(express.json());

app.post("/hook", function receiveWebhook(req, res) {
  const status = MODE === "fail" ? 500 : 200;
  console.log(new Date().toISOString() + " received " + JSON.stringify(req.body) + ", answering " + status);
  return res.status(status).json({ mode: MODE });
});

app.listen(PORT, function onListen() {
  console.log("Fake receiver on port " + PORT + ", mode " + MODE);
});