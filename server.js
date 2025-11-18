import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// ---------------------------------------------------
// OPENAI CLIENT
// ---------------------------------------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------------------------------------------------
// SUPABASE CLIENT
// ---------------------------------------------------
const supabase = createClient(
  process.env.MY_SUPABASE_URL,
  process.env.MY_SUPABASE_SERVICE_ROLE_KEY
);

// ---------------------------------------------------
// 1️⃣ SCAM ANALYZER  (FAKE / REAL + Supabase Logs)
// ---------------------------------------------------
app.post("/analyze-scam", async (req, res) => {
  try {
    let { message, user_id, ip_address } = req.body;

    if (!message) {
      return res
        .status(400)
        .json({ success: false, error: "Message required" });
    }

    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `
You are a strict scam detector.
Return JSON only in this format:
{
  "label": "scam" | "safe",
  "confidence": 0-100,
  "reason": "short explanation in simple language"
}
If you are not sure, choose the safer option "scam" with lower confidence.
        `.trim(),
        },
        {
          role: "user",
          content: message,
        },
      ],
    });

    let parsed = {};
    try {
      parsed = JSON.parse(ai.choices[0].message.content || "{}");
    } catch (e) {
      parsed = {
        label: "unknown",
        confidence: 0,
        reason: "Model returned non-JSON response.",
      };
    }

    const label = parsed.label || "unknown";
    const confidence =
      typeof parsed.confidence === "number" ? parsed.confidence : 0;
    const reason = parsed.reason || "No reason available";

    // ✅ Save in Supabase
    await supabase.from("scam_detection_logs").insert({
      user_id: user_id || "anonymous",
      message,
      label,
      confidence,
      reason,
      ip_address: ip_address || "0.0.0.0",
      is_flagged: label === "scam",
      raw_response: parsed, // jsonb column recommended
    });

    return res.json({
      success: true,
      result: parsed, // { label, confidence, reason }
    });
  } catch (err) {
    console.error("analyze-scam error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------
// 2️⃣ CHATGPT STYLE CHATBOT  (+ Supabase chat_history)
// ---------------------------------------------------
app.post("/chatbot", async (req, res) => {
  try {
    const { message, user_id } = req.body;

    if (!message) {
      return res
        .status(400)
        .json({ success: false, error: "Message required" });
    }

    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: message }],
    });

    const reply = ai.choices[0].message.content || "No reply";

    // ✅ Save both user + assistant messages in chat_history
    if (user_id) {
      await supabase.from("chat_history").insert([
        {
          user_id,
          role: "user",
          message,
        },
        {
          user_id,
          role: "assistant",
          message: reply,
        },
      ]);
    }

    return res.json({ success: true, reply });
  } catch (err) {
    console.error("chatbot error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------
// 3️⃣ TEXT → CODE GENERATOR  (+ Supabase logs)
// ---------------------------------------------------
app.post("/text-to-code", async (req, res) => {
  try {
    const { text, user_id } = req.body;

    if (!text) {
      return res.status(400).json({ success: false, error: "Text required" });
    }

    const model = "gpt-4o-mini";

    const ai = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a professional CODE generator. Convert text instructions into real code. Output ONLY code.",
        },
        { role: "user", content: text },
      ],
    });

    const code = ai.choices[0].message.content || "No code generated";

    // ✅ Save in Supabase
    await supabase.from("code_generation_logs").insert({
      user_id: user_id || "anonymous",
      prompt: text,
      generated_code: code,
      model,
    });

    return res.json({ success: true, code });
  } catch (err) {
    console.error("text-to-code error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------
// 4️⃣ SAVE CHAT HISTORY  (manual use, optional)
// ---------------------------------------------------
app.post("/save-chat", async (req, res) => {
  try {
    const { user_id, role, message } = req.body;

    if (!user_id || !role || !message) {
      return res.status(400).json({
        success: false,
        error: "Fields missing",
      });
    }

    await supabase.from("chat_history").insert({
      user_id,
      role,
      message,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("save-chat error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------
// 5️⃣ THIRD FEATURE: SMART SUMMARIZER (+ Supabase logs)
// ---------------------------------------------------
app.post("/summarize", async (req, res) => {
  try {
    const { text, user_id } = req.body;

    if (!text) {
      return res.status(400).json({ success: false, error: "Text required" });
    }

    const model = "gpt-4o-mini";

    const ai = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You summarize long text into short bullet points and then list 3–5 clear next action items.",
        },
        { role: "user", content: text },
      ],
    });

    const summary = ai.choices[0].message.content || "No summary";

    // ✅ Save in Supabase
    await supabase.from("summarizer_logs").insert({
      user_id: user_id || "anonymous",
      text,
      summary,
      model,
    });

    return res.json({ success: true, summary });
  } catch (err) {
    console.error("summarize error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------
// SERVER LISTENER (Render Deployment Safe)
// ---------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
