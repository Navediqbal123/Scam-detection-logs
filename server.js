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
// 1️⃣ SCAM ANALYZER
// ---------------------------------------------------
app.post("/analyze-scam", async (req, res) => {
  try {
    let { message, user_id, ip_address } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, error: "Message required" });
    }

    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "user", content: `Analyze this message for scam risk: ${message}` },
      ],
    });

    const result = ai.choices[0].message.content || "No result";

    await supabase.from("scam_detection_logs").insert({
      user_id: user_id || "anonymous",
      message,
      scan_result: result,
      ip_address: ip_address || "0.0.0.0",
      is_flagged: true,
    });

    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------
// 2️⃣ CHATGPT STYLE CHATBOT
// ---------------------------------------------------
app.post("/chatbot", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, error: "Message required" });
    }

    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: message }],
    });

    const reply = ai.choices[0].message.content || "No reply";

    return res.json({ success: true, reply });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------
// 3️⃣ TEXT → CODE GENERATOR
// ---------------------------------------------------
app.post("/text-to-code", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ success: false, error: "Text required" });
    }

    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
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

    return res.json({ success: true, code });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------
// 4️⃣ SAVE CHAT HISTORY
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
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------
// SERVER LISTENER (Render Deployment Safe)
// ---------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
