import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import type { MonitorSnapshot } from "@crm/shared";

const STATE_LABELS: Record<string, string> = {
  offline: "离线", idle: "空闲", preparing: "准备中", thinking: "思考中",
  reading_file: "读取文件", editing_file: "编辑中", running_command: "执行命令",
  testing: "测试中", waiting_permission: "等待确认", waiting_user: "等待用户",
  rate_limited: "触发限流", low_balance: "余额偏低", error: "异常", completed: "完成",
};

interface StatusHeaderProps { snapshot: MonitorSnapshot | null; lastUpdate: Date | null; connected: boolean; }

export function StatusHeader({ snapshot, lastUpdate, connected }: StatusHeaderProps) {
  const elRef = useRef<HTMLElement>(null);
  const state: string = snapshot?.runtime?.state ?? "offline";
  const label = STATE_LABELS[state] || state;
  const timeStr = lastUpdate ? lastUpdate.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--";
  const modelId = snapshot?.claude?.model;

  useEffect(() => {
    if (!elRef.current) return;
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.fromTo(elRef.current, { y: -40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 }, 0);
    tl.fromTo(elRef.current.querySelector(".status-left")!, { x: -20, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4 }, 0.15);
    tl.fromTo(elRef.current.querySelectorAll(".status-meta span"), { opacity: 0, x: 10 }, { opacity: 1, x: 0, duration: 0.35, stagger: 0.06 }, 0.25);
    // 连接状态脉冲
    if (connected) gsap.to(elRef.current, { borderColor: "var(--line-active)", duration: 0.8, ease: "power2.inOut", delay: 0.6 });
  }, [connected]);

  return (
    <header ref={elRef} className="status-header">
      <div className="status-left">
        <span className={`status-indicator dot-${state}`} />
        <span className="status-label">{label}</span>
      </div>
      <div className="status-meta">
        <span>{connected ? "已连接" : "未连接"}</span>
        <span>更新 {timeStr}</span>
        {modelId && <span>{modelId}</span>}
      </div>
    </header>
  );
}
