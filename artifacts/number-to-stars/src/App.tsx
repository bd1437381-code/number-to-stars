import { useRef, useState, useCallback, useEffect } from "react";
import Tesseract from "tesseract.js";

const STAR_COLORS = [
  { name: "رمادي", value: "#9ca3af" },
  { name: "أخضر", value: "#22c55e" },
  { name: "أزرق", value: "#3b82f6" },
  { name: "بنفسجي", value: "#a855f7" },
  { name: "أحمر", value: "#ef4444" },
  { name: "ذهبي", value: "#f59e0b" },
];

const SHADOW_COLORS = [
  { name: "أبيض", value: "#ffffff" },
  { name: "أخضر", value: "#22c55e" },
  { name: "أزرق", value: "#3b82f6" },
  { name: "بنفسجي", value: "#a855f7" },
  { name: "برتقالي", value: "#f97316" },
  { name: "ذهبي", value: "#f59e0b" },
];

interface DetectedNumber {
  id: number;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hidden: boolean;
}

function isNumericWord(text: string): boolean {
  return /^[\d\s\-\/\.،,]+$/.test(text.trim()) && /\d/.test(text);
}

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [numbers, setNumbers] = useState<DetectedNumber[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [starColor, setStarColor] = useState("#ef4444");
  const [shadowColor, setShadowColor] = useState("#f59e0b");
  const [zoom, setZoom] = useState(100);
  const [history, setHistory] = useState<DetectedNumber[][]>([]);

  const drawCanvas = useCallback(
    (img: HTMLImageElement, nums: DetectedNumber[], sc: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);

      nums.forEach((n) => {
        if (!n.hidden) return;
        // white box over the number
        ctx.fillStyle = "rgba(248, 248, 248, 0.95)";
        ctx.fillRect(n.x, n.y, n.w, n.h);

        // star count = number of digits in the text
        const digitCount = n.text.replace(/\D/g, "").length || 1;
        const stars = "★".repeat(digitCount);

        // fit font size so stars fill the box width
        let fontSize = Math.max(8, n.h * 0.68);
        ctx.font = `bold ${fontSize}px Arial`;
        let textW = ctx.measureText(stars).width;
        if (textW > n.w - 4) {
          fontSize = fontSize * ((n.w - 4) / textW);
          ctx.font = `bold ${fontSize}px Arial`;
        }

        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.fillStyle = sc;
        ctx.fillText(stars, n.x + n.w / 2, n.y + n.h / 2);
      });
    },
    []
  );

  useEffect(() => {
    if (originalImage) {
      drawCanvas(originalImage, numbers, starColor);
    }
  }, [numbers, starColor, originalImage, drawCanvas]);

  const handleFile = useCallback(async (file: File) => {
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setNumbers([]);
    setHistory([]);
    setLoading(true);
    setProgress(0);

    const img = new Image();
    img.onload = async () => {
      setOriginalImage(img);
      drawCanvas(img, [], starColor);

      try {
        const result = await Tesseract.recognize(url, "ara+eng", {
          logger: (m) => {
            if (m.status === "recognizing text") {
              setProgress(Math.round((m.progress || 0) * 100));
            }
          },
        });

        const words = result.data.words;
        const detected: DetectedNumber[] = [];
        let idCounter = 0;

        words.forEach((word) => {
          if (isNumericWord(word.text) && word.confidence > 30) {
            const b = word.bbox;
            detected.push({
              id: idCounter++,
              text: word.text,
              x: b.x0,
              y: b.y0,
              w: b.x1 - b.x0,
              h: b.y1 - b.y0,
              hidden: true,
            });
          }
        });

        setNumbers(detected);
        drawCanvas(img, detected, starColor);
      } catch (e) {
        console.error(e);
      }

      setLoading(false);
      setProgress(0);
    };
    img.src = url;
  }, [drawCanvas, starColor]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) handleFile(file);
    },
    [handleFile]
  );

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !originalImage) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top) * scaleY;

      const idx = numbers.findIndex(
        (n) => cx >= n.x && cx <= n.x + n.w && cy >= n.y && cy <= n.y + n.h
      );
      if (idx === -1) return;

      setHistory((h) => [...h, numbers]);
      setNumbers((prev) =>
        prev.map((n, i) => (i === idx ? { ...n, hidden: !n.hidden } : n))
      );
    },
    [numbers, originalImage]
  );

  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setNumbers(prev);
  };

  const saveImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "محوّل-الأرقام.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const newImage = () => {
    setImageSrc(null);
    setOriginalImage(null);
    setNumbers([]);
    setHistory([]);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const hiddenCount = numbers.filter((n) => n.hidden).length;

  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(160deg,#0f172a 0%,#1e1b4b 60%,#0f172a 100%)" }}
    >
      {/* Google Fonts */}
      <link
        href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap"
        rel="stylesheet"
      />

      <div className="max-w-md mx-auto px-4 py-6">
        {/* Header */}
        <div className="text-center mb-6">
          <h1
            className="text-3xl font-extrabold mb-1"
            style={{ color: "#f8e97a", fontFamily: "Cairo,sans-serif", letterSpacing: "-0.5px" }}
          >
            محوّل الأرقام إلى نجوم
          </h1>
          {imageSrc && numbers.length > 0 && (
            <div className="flex items-center justify-center gap-2 mt-2">
              <span
                className="text-sm px-3 py-1 rounded-full font-bold"
                style={{ background: "#1e293b", color: "#94a3b8" }}
              >
                انقر على أي رقم لإخفائه
              </span>
              <span
                className="text-sm px-3 py-1 rounded-full font-bold"
                style={{ background: "#fbbf24", color: "#1e293b" }}
              >
                {numbers.length} أرقام مكتشفة
              </span>
            </div>
          )}
        </div>

        {/* Upload area or canvas */}
        <div
          className="rounded-2xl overflow-hidden mb-4 relative"
          style={{ border: "2px solid #ca8a04", background: "#1e293b" }}
        >
          {!imageSrc ? (
            <div
              className="flex flex-col items-center justify-center cursor-pointer"
              style={{ minHeight: 280 }}
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="text-6xl mb-4" style={{ filter: "drop-shadow(0 0 12px #fbbf24)" }}>
                ★
              </div>
              <p className="text-lg font-bold mb-1" style={{ color: "#f8e97a" }}>
                ارفع صورتك هنا
              </p>
              <p className="text-sm" style={{ color: "#94a3b8" }}>
                اضغط أو اسحب الصورة
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
          ) : (
            <>
              {loading && (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center z-10"
                  style={{ background: "rgba(15,23,42,0.85)" }}
                >
                  <div className="text-4xl mb-3 animate-spin" style={{ display: "inline-block" }}>
                    ★
                  </div>
                  <p className="text-sm font-bold mb-2" style={{ color: "#f8e97a" }}>
                    جاري اكتشاف الأرقام...
                  </p>
                  <div
                    className="rounded-full overflow-hidden"
                    style={{ width: 180, height: 6, background: "#334155" }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${progress}%`, background: "#fbbf24" }}
                    />
                  </div>
                  <p className="text-xs mt-1" style={{ color: "#64748b" }}>
                    {progress}%
                  </p>
                </div>
              )}
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                className="w-full cursor-crosshair block"
                style={{
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: "top center",
                  transition: "transform 0.2s",
                }}
              />
            </>
          )}
        </div>

        {imageSrc && (
          <>
            {/* Star color */}
            <div
              className="rounded-xl p-3 mb-3 flex items-center gap-3"
              style={{ background: "#1e293b" }}
            >
              <span className="text-sm font-bold" style={{ color: "#94a3b8" }}>
                لون النجمة
              </span>
              <div className="flex gap-2 flex-wrap">
                {STAR_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setStarColor(c.value)}
                    className="rounded-full transition-all"
                    style={{
                      width: 30,
                      height: 30,
                      background: c.value,
                      border: starColor === c.value ? "3px solid #f8e97a" : "2px solid transparent",
                      outline: starColor === c.value ? "2px solid #f8e97a" : "none",
                      outlineOffset: 1,
                    }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            {/* Shadow color (decorative, shown like original) */}
            <div
              className="rounded-xl p-3 mb-3 flex items-center gap-3"
              style={{ background: "#1e293b" }}
            >
              <span className="text-sm font-bold" style={{ color: "#94a3b8" }}>
                لون التظليل
              </span>
              <div className="flex gap-2 flex-wrap">
                {SHADOW_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setShadowColor(c.value)}
                    className="rounded-full transition-all"
                    style={{
                      width: 30,
                      height: 30,
                      background: c.value,
                      border: shadowColor === c.value ? "3px solid #f8e97a" : "2px solid transparent",
                      outline: shadowColor === c.value ? "2px solid #f8e97a" : "none",
                      outlineOffset: 1,
                    }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            {/* Controls bar */}
            <div
              className="rounded-xl p-3 mb-3 flex items-center justify-between"
              style={{ background: "#1e293b" }}
            >
              <div className="flex items-center gap-2">
                {/* Delete */}
                <button
                  onClick={newImage}
                  className="p-2 rounded-lg transition-colors"
                  style={{ background: "#334155", color: "#ef4444" }}
                  title="حذف الصورة"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 3v1H4v2h1v13a2 2 0 002 2h10a2 2 0 002-2V6h1V4h-5V3H9zm0 5h2v9H9V8zm4 0h2v9h-2V8z" />
                  </svg>
                </button>
                {/* Undo */}
                <button
                  onClick={undo}
                  disabled={history.length === 0}
                  className="p-2 rounded-lg transition-colors disabled:opacity-40"
                  style={{ background: "#334155", color: "#94a3b8" }}
                  title="تراجع"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 7v6h6M3 13C4.5 8 9 5 14 5a9 9 0 110 18 9 9 0 01-8.7-6.7" />
                  </svg>
                </button>
              </div>

              {/* Stars count */}
              <div className="flex items-center gap-1" style={{ color: "#f8e97a" }}>
                <span className="font-bold text-sm">{hiddenCount} نجوم</span>
                <span>★</span>
              </div>

              {/* Zoom */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setZoom((z) => Math.max(30, z - 10))}
                  className="p-1 rounded text-sm"
                  style={{ background: "#334155", color: "#94a3b8" }}
                >
                  −
                </button>
                <span className="text-xs font-bold px-1" style={{ color: "#94a3b8", minWidth: 36, textAlign: "center" }}>
                  {zoom}%
                </span>
                <button
                  onClick={() => setZoom((z) => Math.min(150, z + 10))}
                  className="p-1 rounded text-sm"
                  style={{ background: "#334155", color: "#94a3b8" }}
                >
                  +
                </button>
                {/* Fullscreen icon */}
                <button
                  onClick={() => setZoom(100)}
                  className="p-1 rounded"
                  style={{ background: "#334155", color: "#94a3b8" }}
                  title="إعادة الحجم"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 mb-4">
              <button
                onClick={saveImage}
                className="flex-1 py-3 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                style={{ background: "#f59e0b", color: "#1e293b" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                حفظ الصورة
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-3 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                style={{ background: "#1e293b", color: "#94a3b8", border: "1.5px solid #334155" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                </svg>
                صورة جديدة
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          </>
        )}

        {/* Privacy note */}
        <p className="text-center text-xs" style={{ color: "#475569" }}>
          🔒 تتم المعالجة محلياً بالكامل داخل متصفحك. خصوصيتك في أمان تام.
        </p>
      </div>
    </div>
  );
}
