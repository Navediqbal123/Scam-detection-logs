import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabase = createClient(
  process.env.MY_SUPABASE_URL,
  process.env.MY_SUPABASE_SERVICE_ROLE_KEY
);

// ---------------------------------------------------
// 🚨 SCAM ANALYZER ROUTE (Supabase Fix Added)
// ---------------------------------------------------
app.post("/analyze-scam", async (req, res) => {
  try {
    let { message, user_id, ip_address } = req.body;

    // DEFAULT VALUES TO PREVENT SUPABASE ERROR
    user_id = user_id || "anonymous_user";
    ip_address = ip_address || "0.0.0.0";

    if (!message) {
      return res.status(400).json({ success: false, error: "Message required" });
    }

    // OPENAI CALL
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

    // SAVE IN SUPABASE — FIXED 👇
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

    res.json({
      success: true,
      result: resultText
    });

  } catch (e) {
    console.log(e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---------------------------------------------------
// 🧩 TEXT → CODE EXTRACTOR ROUTE
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
RULES:
- Extract ONLY code that already exists in the given text.
- Do NOT guess or create new code.
- Do NOT modify anything.
- Keep formatting exactly same.
- If no code exists, reply: "No code found."
`
        },
        {
          role: "user",
          content: input
        }
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

app.listen(3000, () =>
  console.log("Backend running on port 3000")
);
