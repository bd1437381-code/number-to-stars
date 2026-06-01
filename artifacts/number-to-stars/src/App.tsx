import { useRef, useState, useCallback, useEffect } from "react";
import { recognize } from "tesseract.js";

/* ─── types ────────────────────────────────────────────────────── */
interface Region {
  id: number;
  text: string;
  x: number; y: number; w: number; h: number;
  hidden: boolean;
}

type OcrStatus = "idle" | "loading" | "done" | "empty" | "error";

/* ─── constants ─────────────────────────────────────────────────── */
const STAR_COLORS = [
  { label: "رمادي",   value: "#9ca3af" },
  { label: "أخضر",   value: "#22c55e" },
  { label: "أزرق",   value: "#3b82f6" },
  { label: "بنفسجي", value: "#a855f7" },
  { label: "أحمر",   value: "#ef4444" },
  { label: "ذهبي",   value: "#f59e0b" },
];

function isNumeric(t: string) {
  return /^[\d\s\-\/\.،,:]+$/.test(t.trim()) && /\d/.test(t);
}

/* ─── draw one region on canvas ────────────────────────────────── */
function drawRegion(
  ctx: CanvasRenderingContext2D,
  r: Region,
  color: string,
) {
  if (!r.hidden) return;
  const pad = 3;
  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2);

  const digits = r.text.replace(/\D/g, "").length || 1;
  const stars  = "★".repeat(digits);

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

/* ══════════════════════════════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════════════════════════════ */
export default function App() {
  const fileRef   = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef    = useRef<HTMLImageElement | null>(null);

  const [hasImage,  setHasImage]  = useState(false);
  const [regions,   setRegions]   = useState<Region[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>("idle");
  const [starColor, setStarColor] = useState("#ef4444");
  const [zoom,      setZoom]      = useState(100);
  const [history,   setHistory]   = useState<Region[][]>([]);

  /* ── redraw ─────────────────────────────────────────────────── */
  const redraw = useCallback((regs: Region[], color: string) => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    regs.forEach((r) => drawRegion(ctx, r, color));
  }, []);

  useEffect(() => { redraw(regions, starColor); }, [regions, starColor, redraw]);

  /* ── click → toggle region ──────────────────────────────────── */
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !imgRef.current) return;
      const rect = canvas.getBoundingClientRect();
      const sx   = canvas.width  / rect.width;
      const sy   = canvas.height / rect.height;
      const ix   = (e.clientX - rect.left) * sx;
      const iy   = (e.clientY - rect.top)  * sy;
      const PAD  = 14 * sx;

      const idx = regions.findIndex(
        (r) => ix >= r.x - PAD && ix <= r.x + r.w + PAD &&
               iy >= r.y - PAD && iy <= r.y + r.h + PAD,
      );
      if (idx === -1) return;
      setHistory((h) => [...h, regions]);
      setRegions((prev) =>
        prev.map((r, i) => i === idx ? { ...r, hidden: !r.hidden } : r),
      );
    },
    [regions],
  );

  /* ── load image + OCR ───────────────────────────────────────── */
  const handleFile = useCallback(
    async (file: File) => {
      const url = URL.createObjectURL(file);
      setHasImage(true);
      setRegions([]);
      setHistory([]);
      setLoading(true);
      setProgress(5);
      setOcrStatus("loading");

      const img = new Image();

      img.onerror = () => {
        setLoading(false);
        setOcrStatus("error");
      };

      img.onload = async () => {
        imgRef.current = img;
        // ① show image immediately
        redraw([], starColor);
        setProgress(15);

        try {
          const result = await recognize(url, "ara+eng", {
            logger: (m) => {
              if (m.status === "recognizing text")
                setProgress(15 + Math.round((m.progress || 0) * 83));
            },
          });

          let id = 0;
          const detected: Region[] = result.data.words
            .filter((w) => isNumeric(w.text) && w.confidence > 20)
            .map((w) => ({
              id:     id++,
              text:   w.text,
              x:      w.bbox.x0,
              y:      w.bbox.y0,
              w:      w.bbox.x1 - w.bbox.x0,
              h:      w.bbox.y1 - w.bbox.y0,
              hidden: true,           // ← auto-hide immediately
            }));

          setRegions(detected);
          redraw(detected, starColor);
          setOcrStatus(detected.length > 0 ? "done" : "empty");
        } catch (err) {
          console.error("OCR failed:", err);
          setOcrStatus("error");
        }

        setLoading(false);
        setProgress(0);
      };

      img.src = url;
    },
    [redraw, starColor],
  );

  /* ── helpers ────────────────────────────────────────────────── */
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith("image/")) handleFile(f);
  };

  const undo = () => {
    if (!history.length) return;
    setRegions(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  };

  const hideAll = () => {
    if (!regions.length) return;
    setHistory((h) => [...h, regions]);
    setRegions((p) => p.map((r) => ({ ...r, hidden: true })));
  };

  const showAll = () => {
    if (!regions.length) return;
    setHistory((h) => [...h, regions]);
    setRegions((p) => p.map((r) => ({ ...r, hidden: false })));
  };

  const saveImage = () => {
    const a = document.createElement("a");
    a.download = "محوّل-الأرقام.png";
    a.href = canvasRef.current!.toDataURL("image/png");
    a.click();
  };

  const reset = () => {
    setHasImage(false);
    setRegions([]);
    setHistory([]);
    setOcrStatus("idle");
    imgRef.current = null;
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
  };

  const hiddenCount   = regions.filter((r) => r.hidden).length;
  const detectedCount = regions.length;

  /* ── status badge text ──────────────────────────────────────── */
  const statusText =
    ocrStatus === "loading" ? null :
    ocrStatus === "done"    ? `اضغط على أي رقم لإخفائه أو إظهاره` :
    ocrStatus === "empty"   ? "لم يُكتشف أرقام — تأكد أن الصورة واضحة" :
    ocrStatus === "error"   ? "حدث خطأ في قراءة الصورة" : null;

  /* ══════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════ */
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg,#0f172a 0%,#1e1b4b 60%,#0f172a 100%)",
      fontFamily: "Cairo,sans-serif",
      direction: "rtl",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 440, margin: "0 auto", padding: "20px 16px" }}>

        {/* ── title ── */}
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <h1 style={{ color: "#f8e97a", fontSize: 26, fontWeight: 800, margin: "0 0 8px" }}>
            محوّل الأرقام إلى نجوم
          </h1>

          {hasImage && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
              {detectedCount > 0 && (
                <span style={{ background: "#fbbf24", color: "#1e293b", borderRadius: 99, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>
                  {detectedCount} أرقام مكتشفة
                </span>
              )}
              {statusText && (
                <span style={{ background: "#1e293b", color: "#94a3b8", borderRadius: 99, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>
                  {statusText}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── image card ── */}
        <div style={{
          borderRadius: 16,
          border: "2px solid #ca8a04",
          background: "#1e293b",
          overflow: "hidden",
          marginBottom: 12,
          position: "relative",
        }}>
          {!hasImage ? (
            /* upload area */
            <div
              onClick={() => fileRef.current?.click()}
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              style={{
                minHeight: 260,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 56, marginBottom: 12, filter: "drop-shadow(0 0 12px #fbbf24)" }}>★</div>
              <p style={{ color: "#f8e97a", fontWeight: 700, fontSize: 17, margin: 0 }}>ارفع صورتك هنا</p>
              <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0" }}>اضغط أو اسحب الصورة</p>
            </div>
          ) : (
            /* canvas area */
            <div style={{ position: "relative" }}>
              {loading && (
                <div style={{
                  position: "absolute", inset: 0, zIndex: 10,
                  background: "rgba(15,23,42,0.88)",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                }}>
                  <div style={{ fontSize: 38, marginBottom: 10, animation: "spin 1s linear infinite", display: "inline-block" }}>★</div>
                  <p style={{ color: "#f8e97a", fontWeight: 700, fontSize: 14, margin: 0 }}>
                    جاري قراءة الصورة واكتشاف الأرقام...
                  </p>
                  <div style={{ width: 180, height: 7, background: "#1e293b", borderRadius: 99, overflow: "hidden", marginTop: 12 }}>
                    <div style={{ width: `${progress}%`, height: "100%", background: "#fbbf24", transition: "width 0.3s" }} />
                  </div>
                  <p style={{ color: "#64748b", fontSize: 11, margin: "5px 0 0" }}>{progress}%</p>
                </div>
              )}

              <canvas
                ref={canvasRef}
                onClick={handleClick}
                style={{ display: "block", width: `${zoom}%`, cursor: "pointer" }}
              />
            </div>
          )}
        </div>

        {/* ── controls (only when image loaded) ── */}
        {hasImage && (
          <>
            {/* star color */}
            <Row label="لون النجمة">
              {STAR_COLORS.map((c) => (
                <Dot key={c.value} color={c.value} active={starColor === c.value}
                  onClick={() => setStarColor(c.value)} />
              ))}
            </Row>

            {/* hide-all / show-all */}
            {detectedCount > 0 && (
              <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <ActionBtn
                  onClick={hideAll}
                  disabled={hiddenCount === detectedCount}
                  bg="#15803d" bgOff="#1e3a2f"
                  color="#fff" colorOff="#4ade8044"
                  active={hiddenCount < detectedCount}
                >
                  ★ إخفاء الكل
                </ActionBtn>
                <ActionBtn
                  onClick={showAll}
                  disabled={hiddenCount === 0}
                  bg="#334155" bgOff="#1e293b"
                  color="#e2e8f0" colorOff="#47556940"
                  active={hiddenCount > 0}
                  border="1.5px solid #334155"
                >
                  👁 إظهار الكل
                </ActionBtn>
              </div>
            )}

            {/* controls bar */}
            <div style={{
              background: "#1e293b", borderRadius: 12, padding: "10px 14px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 10,
            }}>
              {/* left: delete + undo */}
              <div style={{ display: "flex", gap: 8 }}>
                <Btn color="#ef4444" title="حذف الصورة" onClick={reset}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 3v1H4v2h1v13a2 2 0 002 2h10a2 2 0 002-2V6h1V4h-5V3H9zm0 5h2v9H9V8zm4 0h2v9h-2V8z"/>
                  </svg>
                </Btn>
                <Btn color="#94a3b8" title="تراجع" onClick={undo} disabled={!history.length}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 7v6h6M3 13C4.5 8 9 5 14 5a9 9 0 110 18 9 9 0 01-8.7-6.7"/>
                  </svg>
                </Btn>
              </div>

              {/* center: counter */}
              <span style={{ color: "#f8e97a", fontWeight: 700, fontSize: 14 }}>
                {hiddenCount} نجوم ★
              </span>

              {/* right: zoom */}
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <Btn onClick={() => setZoom((z) => Math.max(30, z - 10))}>−</Btn>
                <span style={{ color: "#94a3b8", fontSize: 11, minWidth: 38, textAlign: "center", fontWeight: 700 }}>{zoom}%</span>
                <Btn onClick={() => setZoom((z) => Math.min(200, z + 10))}>+</Btn>
              </div>
            </div>

            {/* save / new */}
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <ActionBtn onClick={saveImage} bg="#f59e0b" color="#1e293b" active>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                </svg>
                حفظ الصورة
              </ActionBtn>
              <ActionBtn
                onClick={() => { reset(); setTimeout(() => fileRef.current?.click(), 60); }}
                bg="#1e293b" color="#94a3b8" active
                border="1.5px solid #334155"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                </svg>
                صورة جديدة
              </ActionBtn>
            </div>
          </>
        )}

        <p style={{ textAlign: "center", fontSize: 11, color: "#475569" }}>
          🔒 تتم المعالجة محلياً داخل متصفحك. خصوصيتك في أمان تام.
        </p>
      </div>

      {/* hidden file input */}
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ─── tiny reusable sub-components ─────────────────────────────── */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "#1e293b", borderRadius: 12, padding: "10px 14px",
      display: "flex", alignItems: "center", gap: 10, marginBottom: 10,
    }}>
      <span style={{ color: "#94a3b8", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

function Dot({ color, active, onClick }: { color: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: 30, height: 30, borderRadius: "50%", background: color,
      border: "none", cursor: "pointer",
      outline: active ? "3px solid #f8e97a" : "2px solid transparent",
      outlineOffset: 2,
    }} />
  );
}

function Btn({ children, color = "#94a3b8", onClick, disabled, title }: {
  children: React.ReactNode; color?: string;
  onClick?: () => void; disabled?: boolean; title?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      width: 32, height: 32, borderRadius: 8, border: "none",
      background: "#334155", color, cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.38 : 1,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 700, fontSize: 17,
    }}>
      {children}
    </button>
  );
}

function ActionBtn({ children, onClick, disabled, bg, bgOff, color, colorOff, active, border }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean;
  bg: string; bgOff?: string; color: string; colorOff?: string;
  active?: boolean; border?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      flex: 1, padding: "12px 0", borderRadius: 12,
      border: border ?? "none",
      background: active ? bg : (bgOff ?? bg),
      color: active ? color : (colorOff ?? color),
      fontWeight: 700, fontSize: 15, cursor: disabled ? "not-allowed" : "pointer",
      fontFamily: "Cairo,sans-serif",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
      transition: "background 0.2s",
    }}>
      {children}
    </button>
  );
}
