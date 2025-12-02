import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
const PORT = 3000;

// Ініціалізація клієнта OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(cors());
app.use(express.json());

function getInstructions(mode) {
  switch (mode) {
    case "uk-clean":
      return (
        "Ти коректор української мови. " +
        "Виправ орфографію, пунктуацію та базову граматику. " +
        "Зберігай зміст. НЕ перекладай англійські слова й не змінюй їх."
      );
    case "en-clean":
      return (
        "You are an English proofreader. " +
        "Fix spelling, punctuation and basic grammar, but do not change the meaning."
      );
    case "uk-en-mix":
      return (
        "Ти коректор змішаного тексту українською з вставками англійською. " +
        "Виправ лише українську частину тексту. " +
        "Англійські слова і фрази не перекладай і не змінюй."
      );
    default:
      return (
        "You are a careful text cleaner. " +
        "Fix obvious mistakes but preserve the original meaning and style as much as possible."
      );
  }
}

/**
 * Легкий health-check для бекенда та ключа OpenAI.
 *
 * GET /health
 *
 * Відповідь:
 *  - 200 { ok: true, model, latencyMs }
 *  - 500 { ok: false, stage: "env" | "openai", error }
 */
app.get("/health", async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      ok: false,
      stage: "env",
      error: "OPENAI_API_KEY is not set",
    });
  }

  try {
    const started = Date.now();

    const response = await openai.responses.create({
      model: "gpt-5.1-mini",
      input: "ping",
      max_output_tokens: 1,
    });

    const latencyMs = Date.now() - started;
    const text = (response.output_text || "").trim();

    return res.json({
      ok: true,
      stage: "openai",
      model: "gpt-5.1-mini",
      latencyMs,
      sample: text, // маленький текст типу "pong" або подібне
    });
  } catch (err) {
    console.error("[Golos] /health OpenAI error:", err);
    return res.status(500).json({
      ok: false,
      stage: "openai",
      error: err.message || String(err),
    });
  }
});

app.post("/process", async (req, res) => {
  const { mode = "uk-clean", text } = req.body || {};

  if (typeof text !== "string" || !text.trim()) {
    return res
      .status(400)
      .json({ error: "field 'text' (non-empty string) is required" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY env var is not set" });
  }

  try {
    const instructions = getInstructions(mode);

    const response = await openai.responses.create({
      model: "gpt-5.1-mini",
      input: text,
      instructions,
    });

    const processedText = (response.output_text || "").trim() || text;

    return res.json({ text: processedText });
  } catch (err) {
    console.error("[Golos] /process OpenAI error:", err);
    return res.status(500).json({
      error: "openai_error",
      message: err.message || "Failed to process text with OpenAI",
    });
  }
});

app.listen(PORT, () => {
  console.log(`golos-api listening on http://127.0.0.1:${PORT}`);
});
