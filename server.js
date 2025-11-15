import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// env variables
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const supabase = createClient(
  process.env.MY_SUPABASE_URL,
  process.env.MY_SUPABASE_SERVICE_ROLE_KEY
);

// ---------------- API ROUTE ----------------
app.post("/analyze-scam", async (req, res) => {
  try {
    const { message, user_id, ip_address } = req.body;

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

    // SAVE IN SUPABASE
    await supabase.from("scam_detection_logs").insert({
      user_id,
      message,
      scan_result: resultText,
      ip_address,
      is_flagged: true
    });

    res.json({
      success: true,
      result: resultText
    });
  } catch (e) {
    console.log(e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ---------------- SERVER LISTEN ----------------
app.listen(3000, () =>
  console.log("Backend running on port 3000")
);
