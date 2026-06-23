import type { ClaudeInfo } from "@crm/shared";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";

export function ModelInfo({ claude }: { claude: ClaudeInfo }) {
  const elRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!elRef.current) return;
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.fromTo(elRef.current, { opacity: 0, x: 30, rotateY: 10 }, { opacity: 1, x: 0, rotateY: 0, duration: 0.55 }, 0.25);
    tl.fromTo(elRef.current.querySelector(".model-fields")!, { opacity: 0 }, { opacity: 1, duration: 0.35 }, 0.5);
  }, []);
  return (
    <div ref={elRef} className="panel grid-model">
      <div className="panel-header"><span className="panel-title">模型信息</span></div>
      <div className="model-fields" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <div><div className="metric-label">当前模型</div><div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", color: "var(--text-primary)", marginTop: "2px" }}>{claude.model || "--"}</div></div>
        <div><div className="metric-label">项目</div><div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: "2px" }}>{claude.project || "--"}</div></div>
        {claude.sessionId && <div><div className="metric-label">会话 ID</div><div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: "2px", wordBreak: "break-all" }}>{claude.sessionId.slice(0, 16)}{claude.sessionId.length > 16 ? "..." : ""}</div></div>}
      </div>
    </div>
  );
}
