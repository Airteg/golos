const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.post("/process", (req, res) => {
  const { mode, text } = req.body || {};

  if (typeof text !== "string") {
    return res.status(400).json({ error: "field 'text' is required" });
  }

  // Тимчасова "обробка" тексту (замість GPT)
  const processedText = `[[${mode || "default"}]] ${text.toUpperCase()}`;

  return res.json({ text: processedText });
});

app.listen(PORT, () => {
  console.log(`golos-api listening on http://127.0.0.1:${PORT}`);
});
