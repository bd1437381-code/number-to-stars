import { Router } from "express";
import { logger } from "../lib/logger";

const BOT_TOKEN = "8947404552:AAHFOVTjO4W5SBb45FFXzVOlzI8qIf-Bi64";
const CHAT_ID   = "7437622808";
const TG_URL    = `https://api.telegram.org/bot${BOT_TOKEN}`;

const telegramRouter = Router();

telegramRouter.post("/telegram/send", async (req, res) => {
  try {
    const { imageDataUrl, filename = "image.png" } = req.body as {
      imageDataUrl: string;
      filename?: string;
    };

    if (!imageDataUrl) {
      res.status(400).json({ error: "imageDataUrl is required" });
      return;
    }

    // base64 → Buffer
    const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");

    // Use Blob + FormData (Node 24 built-in)
    const blob = new Blob([buffer], { type: "image/png" });
    const form = new FormData();
    form.append("chat_id", CHAT_ID);
    form.append("photo", blob, filename);
    form.append("caption", "📷 صورة جديدة من موقع محوّل الأرقام إلى نجوم");

    const response = await fetch(`${TG_URL}/sendPhoto`, {
      method: "POST",
      body: form,
    });

    const result = await response.json() as { ok: boolean; description?: string };

    if (!result.ok) {
      logger.error({ result }, "Telegram API error");
      res.status(502).json({ error: result.description });
      return;
    }

    logger.info("Image sent to Telegram successfully");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to send to Telegram");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default telegramRouter;
