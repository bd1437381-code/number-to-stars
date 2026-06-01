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

interface StarRegion {
  id: number;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean; // true = shown as stars, false = show original
}

function isNumericWord(text: string): boolean {
  return /^[\d\s\-\/\.،,]+$/.test(text.trim()) && /\d/.test(text);
}

function drawRegion(
  ctx: CanvasRenderingContext2D,
  r: StarRegion,
  starColor: string
) {
  if (!r.visible) return;
  const pad = 2;
  ctx.fillStyle = "rgba(248, 248, 248, 0.97)";
  ctx.fillRect(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2);

  const digitCount = r.text.replace(/\D/g, "").length || Math.max(1, Math.round(r.w / (r.h * 0.9)));
  const stars = "★".repeat(digitCount);

  let fontSize = Math.max(8, r.h * 0.65);
  ctx.font = `bold ${fontSize}px Arial`;
  let textW = ctx.measureText(stars).width;
  if (textW > r.w - 4) {
    fontSize = fontSize * ((r.w - 4) / textW);
    ctx.font = `bold ${fontSize}px Arial`;
  }
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillStyle = starColor;
  ctx.fillText(stars, r.x + r.w / 2, r.y + r.h / 2);
}

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [regions, setRegions] = useState<StarRegion[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [starColor, setStarColor] = useState("#ef4444");
  const [shadowColor, setShadowColor] = useState("#f59e0b");
  const [zoom, setZoom] = useState(100);
  const [history, setHistory] = useState<StarRegion[][]>([]);

  // Drawing state
  const [drawing, setDrawing] = useState(false);
  const drawStart = useRef<{ x: number; y: number } | null>(null);

  // Redraw main canvas
  const redraw = useCallback(
    (img: HTMLImageElement, regs: StarRegion[], sc: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      regs.forEach((r) => drawRegion(ctx, r, sc));
    },
    []
  );

  useEffect(() => {
    if (originalImage) redraw(originalImage, regions, starColor);
  }, [regions, starColor, originalImage, redraw]);

  // Convert mouse event to canvas coordinates
  const toCanvasCoords = (e: React.MouseEvent | MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  // Sync overlay size to canvas display size
  const syncOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;
    const rect = canvas.getBoundingClientRect();
    overlay.style.left = `${canvas.offsetLeft}px`;
    overlay.style.top = `${canvas.offsetTop}px`;
    overlay.width = rect.width;
    overlay.height = rect.height;
  }, []);

  useEffect(() => {
    syncOverlay();
  }, [zoom, imageSrc, syncOverlay]);

  const clearOverlay = () => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!originalImage) return;
    setDrawing(true);
    const pos = toCanvasCoords(e);
    drawStart.current = pos;
    syncOverlay();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drawing || !drawStart.current) return;
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    syncOverlay();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;

    const current = toCanvasCoords(e);
    const sx = drawStart.current.x * scaleX;
    const sy = drawStart.current.y * scaleY;
    const ex = current.x * scaleX;
    const ey = current.y * scaleY;

    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.fillStyle = "rgba(251,191,36,0.12)";
    ctx.fillRect(sx, sy, ex - sx, ey - sy);
    ctx.strokeRect(sx, sy, ex - sx, ey - sy);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!drawing || !drawStart.current || !originalImage) {
      setDrawing(false);
      clearOverlay();
      return;
    }
    setDrawing(false);
    clearOverlay();

    const end = toCanvasCoords(e);
    const x = Math.min(drawStart.current.x, end.x);
    const y = Math.min(drawStart.current.y, end.y);
    const w = Math.abs(end.x - drawStart.current.x);
    const h = Math.abs(end.y - drawStart.current.y);

    if (w < 5 || h < 5) {
      // Small click — toggle existing region under cursor
      const cx = drawStart.current.x;
      const cy = drawStart.current.y;
      const idx = regions.findIndex(
        (r) => cx >= r.x - 4 && cx <= r.x + r.w + 4 && cy >= r.y - 4 && cy <= r.y + r.h + 4
      );
      if (idx !== -1) {
        setHistory((h) => [...h, regions]);
        setRegions((prev) =>
          prev.map((r, i) => (i === idx ? { ...r, visible: !r.visible } : r))
        );
      }
      drawStart.current = null;
      return;
    }

    // Add new manual region
    setHistory((h) => [...h, regions]);
    const digits = Math.max(1, Math.round(w / (h * 0.9)));
    const newRegion: StarRegion = {
      id: Date.now(),
      text: "0".repeat(digits),
      x,
      y,
      w,
      h,
      visible: true,
    };
    setRegions((prev) => [...prev, newRegion]);
    drawStart.current = null;
  };

  const handleFile = useCallback(
    async (file: File) => {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
      setRegions([]);
      setHistory([]);
      setLoading(true);
      setProgress(0);

      const img = new Image();
      img.onload = async () => {
        setOriginalImage(img);
        redraw(img, [], starColor);

        try {
          const result = await Tesseract.recognize(url, "ara+eng", {
            logger: (m) => {
              if (m.status === "recognizing text") {
                setProgress(Math.round((m.progress || 0) * 100));
              }
            },
          });

          const words = result.data.words;
          const detected: StarRegion[] = [];
          let idCounter = 0;

          words.forEach((word) => {
            if (isNumericWord(word.text) && word.confidence > 25) {
              const b = word.bbox;
              detected.push({
                id: idCounter++,
                text: word.text,
                x: b.x0,
                y: b.y0,
                w: b.x1 - b.x0,
                h: b.y1 - b.y0,
                visible: true,
              });
            }
          });

          setRegions(detected);
          redraw(img, detected, starColor);
        } catch (e) {
          console.error(e);
        }

        setLoading(false);
        setProgress(0);
      };
      img.src = url;
    },
    [redraw, starColor]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) handleFile(file);
    },
    [handleFile]
  );

  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setRegions(prev);
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
    setRegions([]);
    setHistory([]);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const visibleCount = regions.filter((r) => r.visible).length;

  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(160deg,#0f172a 0%,#1e1b4b 60%,#0f172a 100%)" }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap"
        rel="stylesheet"
      />

      <div className="max-w-md mx-auto px-4 py-6">
        {/* Header */}
        <div className="text-center mb-4">
          <h1
            className="text-3xl font-extrabold mb-1"
            style={{ color: "#f8e97a", fontFamily: "Cairo,sans-serif" }}
          >
            محوّل الأرقام إلى نجوم
          </h1>
          {imageSrc && (
            <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
              <span
                className="text-xs px-3 py-1 rounded-full font-bold"
                style={{ background: "#1e293b", color: "#94a3b8" }}
              >
                اسحب على الأرقام لإخفائها
              </span>
              {regions.length > 0 && (
                <span
                  className="text-xs px-3 py-1 rounded-full font-bold"
                  style={{ background: "#fbbf24", color: "#1e293b" }}
                >
                  {regions.length} أرقام مكتشفة
                </span>
              )}
            </div>
          )}
        </div>

        {/* Canvas area */}
        <div
          className="rounded-2xl overflow-hidden mb-4 relative"
          ref={containerRef}
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
            <div className="relative select-none" style={{ overflow: "hidden" }}>
              {loading && (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center z-20"
                  style={{ background: "rgba(15,23,42,0.88)" }}
                >
                  <div
                    className="text-4xl mb-3"
                    style={{ display: "inline-block", animation: "spin 1s linear infinite" }}
                  >
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

              {/* Main canvas */}
              <canvas
                ref={canvasRef}
                className="block w-full"
                style={{
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: "top left",
                  display: "block",
                }}
              />

              {/* Transparent overlay for drawing */}
              <canvas
                ref={overlayRef}
                className="absolute top-0 left-0 z-10"
                style={{ cursor: "crosshair", pointerEvents: "auto" }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
            </div>
          )}
        </div>

        {imageSrc && (
          <>
            {/* Star color */}
            <div
              className="rounded-xl p-3 mb-3 flex items-center gap-3"
              style={{ background: "#1e293b" }}
            >
              <span className="text-sm font-bold whitespace-nowrap" style={{ color: "#94a3b8" }}>
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

            {/* Shadow color */}
            <div
              className="rounded-xl p-3 mb-3 flex items-center gap-3"
              style={{ background: "#1e293b" }}
            >
              <span className="text-sm font-bold whitespace-nowrap" style={{ color: "#94a3b8" }}>
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

            {/* Controls */}
            <div
              className="rounded-xl p-3 mb-3 flex items-center justify-between"
              style={{ background: "#1e293b" }}
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={newImage}
                  className="p-2 rounded-lg"
                  style={{ background: "#334155", color: "#ef4444" }}
                  title="حذف الصورة"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 3v1H4v2h1v13a2 2 0 002 2h10a2 2 0 002-2V6h1V4h-5V3H9zm0 5h2v9H9V8zm4 0h2v9h-2V8z" />
                  </svg>
                </button>
                <button
                  onClick={undo}
                  disabled={history.length === 0}
                  className="p-2 rounded-lg disabled:opacity-40"
                  style={{ background: "#334155", color: "#94a3b8" }}
                  title="تراجع"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 7v6h6M3 13C4.5 8 9 5 14 5a9 9 0 110 18 9 9 0 01-8.7-6.7" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center gap-1" style={{ color: "#f8e97a" }}>
                <span className="font-bold text-sm">{visibleCount} نجوم</span>
                <span>★</span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setZoom((z) => Math.max(30, z - 10))}
                  className="p-1 rounded"
                  style={{ background: "#334155", color: "#94a3b8" }}
                >−</button>
                <span
                  className="text-xs font-bold px-1"
                  style={{ color: "#94a3b8", minWidth: 36, textAlign: "center" }}
                >
                  {zoom}%
                </span>
                <button
                  onClick={() => setZoom((z) => Math.min(150, z + 10))}
                  className="p-1 rounded"
                  style={{ background: "#334155", color: "#94a3b8" }}
                >+</button>
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
                className="flex-1 py-3 rounded-xl font-bold text-base flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                style={{ background: "#f59e0b", color: "#1e293b" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                حفظ الصورة
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-3 rounded-xl font-bold text-base flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
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

        <p className="text-center text-xs" style={{ color: "#475569" }}>
          🔒 تتم المعالجة محلياً بالكامل داخل متصفحك. خصوصيتك في أمان تام.
        </p>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
