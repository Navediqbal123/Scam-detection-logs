import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// OPENAI CLIENT
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// SUPABASE CLIENT
const supabase = createClient(
  process.env.MY_SUPABASE_URL,
  process.env.MY_SUPABASE_SERVICE_ROLE_KEY
);

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
          content: `Analyze this message for scam risk: ${message}`
        }
      ]
    });

    const resultText = ai.choices[0].message.content || "No result";

    const { error } = await supabase.from("scam_detection_logs").insert({
      user_id,
      message,
      scan_result: resultText,
      ip_address,
      is_flagged: true
    });

    if (error) {
      console.log("Supabase Insert Error:", error);
      return res.json({ success: false, error: error.message });
    }

    res.json({ success: true, result: resultText });

  } catch (e) {
    console.log(e);
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
- Extract ONLY code from the text.
- Do NOT modify formatting.
- Do NOT invent new code.
- If no code found, reply exactly: "No code found."
`
        },
        { role: "user", content: input }
      ]
    });

    const extracted = ai.choices[0].message.content || "No code found";

    res.json({
      success: true,
      extracted_code: extracted
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------
// 💬 CHATBOT MESSAGE SAVE ROUTE
// ---------------------------------------------------
app.post("/save-chat", async (req, res) => {
  try {
    let { user_id, role, message } = req.body;

    if (!user_id || !role || !message) {
      return res.status(400).json({
        success: false,
        error: "Missing fields: user_id, role, message"
      });
    }

    const { error } = await supabase.from("chat_history").insert({
      user_id,
      role,
      message
    });

    if (error) {
      console.log("Supabase Chat Insert Error:", error);
      return res.json({ success: false, error: error.message });
    }

    res.json({ success: true });

  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------
// SERVER LISTEN
// ---------------------------------------------------
app.listen(3000, () => console.log("Backend running on port 3000"));
