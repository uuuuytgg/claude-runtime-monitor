import { useEffect, useRef } from "react";
import { gsap } from "gsap";

export function CostDisplay({ cost, sessionCostTotal }: { cost: string | null; sessionCostTotal?: string | null }) {
  const elRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!elRef.current) return;
    gsap.fromTo(elRef.current, { scale: 0.92, opacity: 0, filter: "blur(4px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.7, ease: "back.out(1.7)", delay: 0.9 });
  }, [cost, sessionCostTotal]);
  return (
    <div id="cost" ref={elRef} className="panel grid-cost">
      <div className="panel-header"><span className="panel-title">成本</span></div>
      <div className="metric-value" style={{ fontSize: "var(--text-xl)" }}>{sessionCostTotal ?? cost ?? "--"}</div>
      <div className="metric-label">{sessionCostTotal ? "会话累计" : "上次请求"}</div>
      {sessionCostTotal && cost && cost !== sessionCostTotal && (
        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2, fontFamily: "var(--font-mono)" }}>上次: {cost}</div>
      )}
    </div>
  );
}
