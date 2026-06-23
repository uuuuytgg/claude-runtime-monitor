import { useRef, useEffect } from "react";
import { gsap } from "gsap";

interface ContextMeterProps { contextUsed: number | null; contextMax: number | null; }

function getLevel(pct: number) { return pct >= 85 ? "critical" : pct >= 65 ? "warning" : "normal"; }
const LABELS: Record<string, string> = { normal: "正常", warning: "注意", critical: "危险" };

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(0) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toString();
}

export function ContextMeter({ contextUsed, contextMax }: ContextMeterProps) {
  const pct = contextUsed ?? 0;
  const level = getLevel(pct);
  const barRef = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (barRef.current) {
      gsap.fromTo(barRef.current.querySelector(".meter-fill")!, { width: "0%" }, { width: `${Math.min(pct, 100)}%`, duration: 1.4, ease: "power3.out", delay: 0.6 });
    }
    if (numRef.current) {
      const obj = { v: 0 };
      gsap.to(obj, { v: pct, duration: 1.4, ease: "power3.out", delay: 0.6, onUpdate: () => { numRef.current!.textContent = Math.round(obj.v).toString(); } });
    }
  }, [pct]);

  return (
    <div id="context" className="panel grid-context" style={{ transition: "border-color 0.4s" }}>
      <div className="panel-header"><span className="panel-title">上下文压力</span></div>
      <div className="meter-container">
        <div className="meter-bar" ref={barRef}>
          <div className={`meter-fill ${level}`} style={{ width: "0%" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span className="metric-value" style={{ fontSize: "var(--text-xl)" }} ref={numRef}>0<span className="metric-unit">%</span></span>
          <span className="metric-label" style={{ color: level === "critical" ? "var(--state-critical)" : level === "warning" ? "var(--state-warning)" : undefined }}>{LABELS[level]}</span>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>/ {contextMax ? formatTokens(contextMax) : "?"} tokens</div>
      </div>
    </div>
  );
}
