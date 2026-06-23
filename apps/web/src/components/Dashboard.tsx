import { useState, useRef, useEffect, useCallback } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { MonitorSnapshot, RuntimeEvent } from "@crm/shared";
import { useWebSocket } from "../hooks/useWebSocket";
import { useSnapshot } from "../hooks/useSnapshot";
import { StatusHeader } from "./StatusHeader";
import { AICore } from "./AICore";
import { ModelInfo } from "./ModelInfo";
import { ContextMeter } from "./ContextMeter";
import { CostDisplay } from "./CostDisplay";
import { QuotaCard } from "./QuotaCard";
import { EventTimeline } from "./EventTimeline";

gsap.registerPlugin(ScrollTrigger);

const navItems = [
  { label: "概览", target: "overview" },
  { label: "会话", target: "session" },
  { label: "上下文", target: "context" },
  { label: "成本", target: "cost" },
  { label: "Provider", target: "providers" },
  { label: "事件", target: "events" },
  { label: "接入", target: "connect" },
];

export function Dashboard() {
  const {
    snapshot: initial,
    events: initialEvents,
    loading,
    refetch,
  } = useSnapshot();
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null);
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [activeSection, setActiveSection] = useState("overview");
  const dashboardRef = useRef<HTMLDivElement>(null);

  const currentSnapshot = snapshot ?? initial;
  const currentEvents = events.length > 0 ? events : initialEvents;

  const handleMessage = useCallback((data: any) => {
    setLastUpdate(new Date());
    if (data.type === "snapshot") {
      setSnapshot(data.data);
    } else if (data.type === "event") {
      setEvents((prev) => [data.data, ...prev].slice(0, 50));
    }
  }, []);

  const { connected } = useWebSocket(handleMessage);

  const handleNavigate = useCallback((target: string) => {
    setActiveSection(target);
    document.getElementById(target)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  useEffect(() => {
    if (loading || !dashboardRef.current) return;

    const ctx = gsap.context(() => {
      const panels = dashboardRef.current!.querySelectorAll(".panel");
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set(panels, { opacity: 1, y: 0 });
      });

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          panels,
          { opacity: 0, y: 18 },
          {
            opacity: 1,
            y: 0,
            duration: 0.55,
            stagger: 0.06,
            ease: "power2.out",
          }
        );
      });

      return () => mm.revert();
    }, dashboardRef);

    return () => ctx.revert();
  }, [loading]);

  if (loading && !currentSnapshot) {
    return (
      <div className="app-shell">
        <Sidebar activeSection={activeSection} onNavigate={handleNavigate} />
        <main className="dashboard">
          <div
            className="skeleton"
            style={{ height: 60, borderRadius: "var(--radius-md)" }}
          />
          <div className="dashboard-grid">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="skeleton"
                style={{ minHeight: index === 0 ? 360 : 150 }}
              />
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (!loading && !currentSnapshot && !connected) {
    return (
      <div className="app-shell">
        <Sidebar activeSection={activeSection} onNavigate={handleNavigate} />
        <main className="dashboard">
          <div className="error-state">
            <div className="error-state-icon">!</div>
            <div className="error-state-title">无法连接到监控服务</div>
            <div className="error-state-desc">
              请确认 Local Monitor Server 已启动，并且 4377 端口可以访问。
            </div>
          </div>
        </main>
      </div>
    );
  }

  const state = currentSnapshot?.runtime?.state ?? "offline";
  const intensity = currentSnapshot?.animation?.intensity ?? 0;
  const claude = currentSnapshot?.claude ?? {
    project: null,
    model: null,
    sessionId: null,
    contextUsed: null,
    contextMax: null,
    cost: null,
    sessionCostTotal: null,
  };
  const quota = currentSnapshot?.quota ?? {
    provider: "deepseek",
    balance: null,
    status: "unknown" as const,
    lastUpdated: null,
    currency: "CNY",
  };

  return (
    <div ref={dashboardRef} className="app-shell">
      <Sidebar activeSection={activeSection} onNavigate={handleNavigate} />
      <main className="dashboard">
        <StatusHeader
          snapshot={currentSnapshot}
          lastUpdate={lastUpdate}
          connected={connected}
        />

        <section className="dashboard-grid" aria-label="Claude runtime monitor">
          <AICore state={state} intensity={intensity} snapshot={currentSnapshot} />
          <div id="session" className="panel grid-current">
            <div className="panel-header">
              <span className="panel-title">当前状态</span>
              <span className="soft-pill">
                {currentSnapshot?.runtime?.online ? "运行正常" : "离线"}
              </span>
            </div>
            <div className="current-action">
              {currentSnapshot?.runtime?.online ? "本地运行中" : "离线"}
            </div>
            <div className="current-action-detail">
              {state.replace(/_/g, " ")}
            </div>
          </div>
          <ModelInfo claude={claude} />
          <QuotaCard quota={quota} onProviderSwitch={refetch} />
          <ContextMeter
            contextUsed={claude.contextUsed}
            contextMax={claude.contextMax}
          />
          <CostDisplay
            cost={claude.cost}
            sessionCostTotal={claude.sessionCostTotal}
          />
          <EventTimeline events={currentEvents} />
          <ConnectGuide />
        </section>
      </main>
    </div>
  );
}

function Sidebar({
  activeSection,
  onNavigate,
}: {
  activeSection: string;
  onNavigate: (target: string) => void;
}) {
  return (
    <aside className="sidebar" aria-label="Dashboard navigation">
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden="true" />
        <span>Claude Runtime Monitor</span>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.target}
            type="button"
            className={activeSection === item.target ? "sidebar-item active" : "sidebar-item"}
            onClick={() => onNavigate(item.target)}
          >
            <span className="sidebar-glyph" aria-hidden="true" />
            {item.label}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span>Local-first</span>
        <span>v0.1.0</span>
      </div>
    </aside>
  );
}

function ConnectGuide() {
  const hookPath = "D:\\ClaudeData\\claude-runtime-monitor\\scripts\\claude-hooks\\claude-hook.js";
  const statuslinePath = "D:\\ClaudeData\\claude-runtime-monitor\\scripts\\claude-hooks\\statusline.js";

  return (
    <div id="connect" className="panel grid-connect">
      <div className="panel-header">
        <span className="panel-title">接入 Claude Code</span>
        <span className="soft-pill">本机 4377</span>
      </div>
      <div className="connect-grid">
        <div>
          <div className="current-action">让 Claude 把运行事件推到这里</div>
          <p className="connect-copy">
            在 Claude Code 的 settings 里接入 hook 和 statusline。服务器地址保持
            <code>http://127.0.0.1:4377</code>，本机请求会自动通过内部鉴权。
          </p>
        </div>
        <pre className="connect-code">{`{
  "hooks": {
    "PreToolUse": [{ "command": "node ${hookPath}" }],
    "PostToolUse": [{ "command": "node ${hookPath}" }],
    "Stop": [{ "command": "node ${hookPath}" }]
  },
  "statusLine": {
    "type": "command",
    "command": "node ${statuslinePath}",
    "refreshInterval": 10
  }
}`}</pre>
      </div>
    </div>
  );
}
