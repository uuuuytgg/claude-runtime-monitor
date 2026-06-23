import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import type { RuntimeEvent } from "@crm/shared";

interface EventTimelineProps { events: RuntimeEvent[]; }

const TYPE_LABELS: Record<string, string> = {
  session_start: "会话开始", session_end: "会话结束", tool_start: "工具开始",
  tool_end: "工具结束", permission_request: "权限请求", permission_granted: "权限通过",
  permission_denied: "权限拒绝", quota_update: "配额更新", error: "错误", recovery: "恢复",
};

function formatTime(iso: string): string { try { return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch { return "--:--:--"; } }

export function EventTimeline({ events }: EventTimelineProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listRef.current || !events.length) return;
    const rows = listRef.current.querySelectorAll(".event-row");
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.fromTo(rows, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.05, delay: 1.0 });
  }, [events.length]);

  if (!events || events.length === 0) {
    return (
      <div id="events" className="panel grid-events">
        <div className="panel-header"><span className="panel-title">事件时间线</span></div>
        <div className="empty-state">暂无事件记录</div>
      </div>
    );
  }

  return (
    <div id="events" className="panel grid-events">
      <div className="panel-header">
        <span className="panel-title">事件时间线</span>
        <span className="metric-label">{events.length} 条记录</span>
      </div>
      <div className="event-list" ref={listRef}>
        {events.slice(0, 50).map((ev, i) => (
          <div key={ev.id ?? i} className="event-row">
            <span className="event-time">{formatTime(ev.timestamp)}</span>
            <span className={`event-badge ${ev.type}`}>{TYPE_LABELS[ev.type] || ev.type}</span>
            <span className="event-msg">{ev.title}{ev.detail ? ` - ${ev.detail}` : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
