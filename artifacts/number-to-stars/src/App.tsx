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

interface Region {
  id: number;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hidden: boolean; // true = show stars
}

function isNumeric(text: string): boolean {
  return /^[\d\s\-\/\.،,:]+$/.test(text.trim()) && /\d/.test(text);
}

function starsForRegion(r: Region, ctx: CanvasRenderingContext2D, color: string) {
  const pad = 3;
  // white background
  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2);

  const digitCount = r.text.replace(/\D/g, "").length || 1;
  const stars = "★".repeat(digitCount);

  // compute best font size to fill the box
  let fs = Math.max(8, r.h * 0.7);
  ctx.font = `bold ${fs}px Arial`;
  const tw = ctx.measureText(stars).width;
  if (tw > r.w - 2) fs = fs * ((r.w - 2) / tw);
  ctx.font = `bold ${Math.max(6, fs)}px Arial`;

  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillStyle = color;
  ctx.fillText(stars, r.x + r.w / 2, r.y + r.h / 2);
}

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [hasImage, setHasImage] = useState(false);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [starColor, setStarColor] = useState("#ef4444");
  const [zoom, setZoom] = useState(100);
  const [history, setHistory] = useState<Region[][]>([]);

  // ── draw everything onto the canvas ──────────────────────────────
  const redraw = useCallback((regs: Region[], color: string) => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    regs.forEach((r) => { if (r.hidden) starsForRegion(r, ctx, color); });
  }, []);

  useEffect(() => { redraw(regions, starColor); }, [regions, starColor, redraw]);

  // ── click / tap → find region and toggle ─────────────────────────
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;

    const rect = canvas.getBoundingClientRect();
    // map display click to image pixel
    const ix = (e.clientX - rect.left) * (canvas.width / rect.width);
    const iy = (e.clientY - rect.top) * (canvas.height / rect.height);

    // generous hit padding so small taps register
    const PAD = 12 * (canvas.width / rect.width);

    const hit = regions.findIndex(
      (r) =>
        ix >= r.x - PAD && ix <= r.x + r.w + PAD &&
        iy >= r.y - PAD && iy <= r.y + r.h + PAD
    );

    if (hit === -1) return;
    setHistory((h) => [...h, regions]);
    setRegions((prev) =>
      prev.map((r, i) => (i === hit ? { ...r, hidden: !r.hidden } : r))
    );
  }, [regions]);

  // ── load image + run OCR ─────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    const url = URL.createObjectURL(file);
    setHasImage(true);
    setRegions([]);
    setHistory([]);
    setLoading(true);
    setProgress(0);

    const img = new Image();
    img.onload = async () => {
      imgRef.current = img;
      redraw([], starColor);

      try {
        const result = await Tesseract.recognize(url, "ara+eng", {
          logger: (m) => {
            if (m.status === "recognizing text")
              setProgress(Math.round((m.progress || 0) * 100));
          },
        });

        let id = 0;
        const detected: Region[] = result.data.words
          .filter((w) => isNumeric(w.text) && w.confidence > 20)
          .map((w) => ({
            id: id++,
            text: w.text,
            x: w.bbox.x0,
            y: w.bbox.y0,
            w: w.bbox.x1 - w.bbox.x0,
            h: w.bbox.y1 - w.bbox.y0,
            hidden: false, // start visible, user clicks to hide
          }));

        setRegions(detected);
        redraw(detected, starColor);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    img.src = url;
  }, [redraw, starColor]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith("image/")) handleFile(f);
  };

  const undo = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setRegions(prev);
  };

  const saveImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = "محوّل-الأرقام.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  const reset = () => {
    setHasImage(false);
    setRegions([]);
    setHistory([]);
    imgRef.current = null;
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const hiddenCount = regions.filter((r) => r.hidden).length;
  const detectedCount = regions.length;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg,#0f172a 0%,#1e1b4b 60%,#0f172a 100%)",
        fontFamily: "Cairo,sans-serif",
        direction: "rtl",
      }}
    >
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 420, margin: "0 auto", padding: "20px 16px" }}>
        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <h1 style={{ color: "#f8e97a", fontSize: 26, fontWeight: 800, margin: 0 }}>
            محوّل الأرقام إلى نجوم
          </h1>
          {hasImage && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <span style={{ background: "#1e293b", color: "#94a3b8", borderRadius: 99, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>
                {detectedCount > 0
                  ? `اضغط على أي رقم لإخفائه`
                  : "لم يتم اكتشاف أرقام تلقائياً"}
              </span>
              {detectedCount > 0 && (
                <span style={{ background: "#fbbf24", color: "#1e293b", borderRadius: 99, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>
                  {detectedCount} أرقام مكتشفة
                </span>
              )}
            </div>
          )}
        </div>

        {/* Canvas / Upload */}
        <div
          style={{
            borderRadius: 16,
            border: "2px solid #ca8a04",
            background: "#1e293b",
            overflow: "hidden",
            marginBottom: 12,
            position: "relative",
          }}
        >
          {!hasImage ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              style={{
                minHeight: 260,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 56, marginBottom: 12, filter: "drop-shadow(0 0 12px #fbbf24)" }}>★</div>
              <p style={{ color: "#f8e97a", fontWeight: 700, fontSize: 17, margin: 0 }}>ارفع صورتك هنا</p>
              <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0" }}>اضغط أو اسحب الصورة</p>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          ) : (
            <>
              {/* Loading overlay */}
              {loading && (
                <div style={{
                  position: "absolute", inset: 0, background: "rgba(15,23,42,0.88)",
                  display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", zIndex: 10,
                }}>
                  <div style={{ fontSize: 38, marginBottom: 10, animation: "spin 1s linear infinite", display: "inline-block" }}>★</div>
                  <p style={{ color: "#f8e97a", fontWeight: 700, fontSize: 14, margin: 0 }}>جاري اكتشاف الأرقام...</p>
                  <div style={{ width: 160, height: 6, background: "#334155", borderRadius: 99, overflow: "hidden", marginTop: 10 }}>
                    <div style={{ width: `${progress}%`, height: "100%", background: "#fbbf24", transition: "width 0.2s" }} />
                  </div>
                  <p style={{ color: "#64748b", fontSize: 11, margin: "4px 0 0" }}>{progress}%</p>
                </div>
              )}

              {/* THE CANVAS — click directly on numbers */}
              <canvas
                ref={canvasRef}
                onClick={handleClick}
                style={{
                  display: "block",
                  width: `${zoom}%`,
                  cursor: "pointer",
                  touchAction: "none",
                }}
              />
            </>
          )}
        </div>

        {hasImage && (
          <>
            {/* Star color */}
            <Row label="لون النجمة">
              {STAR_COLORS.map((c) => (
                <ColorDot key={c.value} color={c.value} selected={starColor === c.value} onClick={() => setStarColor(c.value)} />
              ))}
            </Row>

            {/* Controls row */}
            <div style={{
              background: "#1e293b", borderRadius: 12, padding: "10px 12px",
              display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10,
            }}>
              {/* left: delete + undo */}
              <div style={{ display: "flex", gap: 8 }}>
                <IconBtn color="#ef4444" title="حذف" onClick={reset}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 3v1H4v2h1v13a2 2 0 002 2h10a2 2 0 002-2V6h1V4h-5V3H9zm0 5h2v9H9V8zm4 0h2v9h-2V8z" />
                  </svg>
                </IconBtn>
                <IconBtn color="#94a3b8" title="تراجع" onClick={undo} disabled={!history.length}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 7v6h6M3 13C4.5 8 9 5 14 5a9 9 0 110 18 9 9 0 01-8.7-6.7" />
                  </svg>
                </IconBtn>
              </div>

              {/* center: star counter */}
              <span style={{ color: "#f8e97a", fontWeight: 700, fontSize: 14 }}>
                {hiddenCount} نجوم ★
              </span>

              {/* right: zoom */}
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <IconBtn color="#94a3b8" onClick={() => setZoom((z) => Math.max(30, z - 10))}>−</IconBtn>
                <span style={{ color: "#94a3b8", fontSize: 11, minWidth: 34, textAlign: "center", fontWeight: 700 }}>{zoom}%</span>
                <IconBtn color="#94a3b8" onClick={() => setZoom((z) => Math.min(200, z + 10))}>+</IconBtn>
              </div>
            </div>

            {/* Save / New image */}
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <button onClick={saveImage} style={{
                flex: 1, padding: "12px 0", borderRadius: 12, border: "none",
                background: "#f59e0b", color: "#1e293b", fontWeight: 700, fontSize: 15,
                cursor: "pointer", fontFamily: "Cairo,sans-serif", display: "flex",
                alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                حفظ الصورة
              </button>
              <button onClick={() => { reset(); setTimeout(() => fileInputRef.current?.click(), 50); }}
                style={{
                  flex: 1, padding: "12px 0", borderRadius: 12,
                  border: "1.5px solid #334155", background: "#1e293b", color: "#94a3b8",
                  fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "Cairo,sans-serif",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                </svg>
                صورة جديدة
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
            </div>
          </>
        )}

        <p style={{ textAlign: "center", fontSize: 11, color: "#475569" }}>
          🔒 تتم المعالجة محلياً داخل متصفحك. خصوصيتك في أمان تام.
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── small helpers ──────────────────────────────────────────────────
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "#1e293b", borderRadius: 12, padding: "10px 12px",
      display: "flex", alignItems: "center", gap: 10, marginBottom: 10,
    }}>
      <span style={{ color: "#94a3b8", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

function ColorDot({ color, selected, onClick }: { color: string; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: 28, height: 28, borderRadius: "50%", background: color, border: "none",
      cursor: "pointer",
      outline: selected ? `3px solid #f8e97a` : "2px solid transparent",
      outlineOffset: 2,
    }} />
  );
}

function IconBtn({ children, color, onClick, disabled, title }: {
  children: React.ReactNode; color: string;
  onClick?: () => void; disabled?: boolean; title?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      width: 32, height: 32, borderRadius: 8, border: "none", background: "#334155",
      color, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1,
      display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16,
    }}>
      {children}
    </button>
  );
}
