import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();

// ---------------------------------------------------
// 🔥 FULL CORS FIX (Hoppscotch + Frontend + Mobile)
// ---------------------------------------------------
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
// 🛠 AUTO CREATE TABLES IF NOT EXISTS
// ---------------------------------------------------
async function autoCreateTables() {
  await supabase.rpc("exec", {
    sql: `
    CREATE TABLE IF NOT EXISTS scam_detection_logs (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT,
      message TEXT,
      scan_result TEXT,
      ip_address TEXT,
      is_flagged BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS chat_history (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT,
      role TEXT,
      message TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `,
  }).catch(() => {});
}
autoCreateTables();

// ---------------------------------------------------
// 🚨 SCAM ANALYZER ROUTE
// ---------------------------------------------------
app.post("/analyze-scam", async (req, res) => {
  try {
    let { message, user_id, ip_address } = req.body;

    user_id = user_id || "anonymous_user";
    ip_address = ip_address || "0.0.0.0";

    if (!message) {
      return res.status(400).json({ success: false, error: "Message required" });
    }

    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Analyze this message for scam risk: ${message}`,
        },
      ],
    });

    const resultText = ai.choices[0].message.content || "No result";

    const { error } = await supabase.from("scam_detection_logs").insert({
      user_id,
      message,
      scan_result: resultText,
      ip_address,
      is_flagged: true,
    });

    if (error) {
      return res.json({ success: false, error: error.message });
    }

    res.json({ success: true, result: resultText });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---------------------------------------------------
// 🧩 CODE EXTRACTOR ROUTE
// ---------------------------------------------------
app.post("/extract-code", async (req, res) => {
  try {
    const { input_text: input } = req.body;

    if (!input) {
      return res.status(400).json({ success: false, error: "No input provided" });
    }

    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are a strict CODE extractor.
Rules:
- Only extract code.
- No extra text.
- No new code.
- If no code found, return exactly: "No code found."
`,
        },
        { role: "user", content: input },
      ],
    });

    const extracted = ai.choices[0].message.content || "No code found";

    res.json({
      success: true,
      extracted_code: extracted,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------
// 💬 SAVE CHAT
// ---------------------------------------------------
app.post("/save-chat", async (req, res) => {
  try {
    let { user_id, role, message } = req.body;

    if (!user_id || !role || !message) {
      return res.status(400).json({
        success: false,
        error: "Missing fields: user_id, role, message",
      });
    }

    const { error } = await supabase.from("chat_history").insert({
      user_id,
      role,
      message,
    });

    if (error) {
      return res.json({ success: false, error: error.message });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------
// SERVER LISTEN — Render Fix (port must be dynamic)
// ---------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
