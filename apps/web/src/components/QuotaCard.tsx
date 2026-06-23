import { useRef, useEffect, useState, useCallback } from "react";
import { gsap } from "gsap";

interface ProviderInfo {
  provider: string;
  label?: string;
  baseUrl?: string;
  balanceEndpoint?: string;
  createdAt: string;
  updatedAt: string;
  latestBalance: { balance: string; status: string; currency: string; fetchedAt: string } | null;
}

interface QuotaCardProps {
  quota: { provider?: string; balance: string | null; status: string; currency?: string; };
  onProviderSwitch?: () => void;
}

const LABELS: Record<string, string> = { ok: "余额充足", low: "余额偏低", critical: "余额不足", error: "获取失败", unknown: "未知" };

// Known provider presets — user only needs to paste API key
const PRESETS: Record<string, { label: string; baseUrl: string; endpoint: string }> = {
  "deepseek":     { label: "DeepSeek",      baseUrl: "https://api.deepseek.com",     endpoint: "/user/balance" },
  "xiaomi-mimo":  { label: "Xiaomi MiMo",   baseUrl: "https://api.xiaomimimo.com/v1", endpoint: "/user/balance" },
  "moonshot":     { label: "Moonshot/Kimi",  baseUrl: "https://api.moonshot.cn/v1",    endpoint: "/users/me/balance" },
  "siliconflow":  { label: "SiliconFlow",    baseUrl: "https://api.siliconflow.cn/v1", endpoint: "/user/info" },
  "openrouter":   { label: "OpenRouter",     baseUrl: "https://openrouter.ai/api/v1", endpoint: "/auth/key" },
};

export function QuotaCard({ quota, onProviderSwitch }: QuotaCardProps) {
  const status = quota.status;
  const elRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState("deepseek");
  const [apiKey, setApiKey] = useState("");
  const [fetching, setFetching] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    if (!elRef.current) return;
    gsap.fromTo(elRef.current.querySelector(".quota-amount")!, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, ease: "back.out(1.4)", delay: 0.8 });
  }, [quota.balance]);

  const loadProviders = useCallback(async () => {
    try {
      const res = await fetch("/api/quota/providers");
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers || []);
      }
    } catch {}
  }, []);

  const handleExpand = useCallback(() => {
    setExpanded(v => !v);
    if (!expanded) loadProviders();
  }, [expanded, loadProviders]);

  // Click a provider → fetch its balance + switch snapshot to show it + reload
  const handleSwitch = useCallback(async (provider: string) => {
    if (provider === quota.provider) return; // already active
    setSwitching(provider);
    try {
      await fetch(`/api/quota/fetch/${provider}`);
      await fetch("/api/quota/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      // Force reload to pick up new snapshot
      window.location.reload();
    } catch {
      setSwitching(null);
    }
  }, [quota.provider]);

  const handleAdd = useCallback(async () => {
    if (!apiKey) return;
    const preset = PRESETS[selectedPreset];
    if (!preset) return;
    setLoading(true);
    try {
      await fetch("/api/quota/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedPreset,
          apiKey,
          label: preset.label,
          baseUrl: preset.baseUrl,
          balanceEndpoint: preset.endpoint,
        }),
      });
      await fetch(`/api/quota/fetch/${selectedPreset}`);
      setApiKey("");
      setShowAdd(false);
      loadProviders();
    } catch {}
    setLoading(false);
  }, [selectedPreset, apiKey, loadProviders]);

  const handleDelete = useCallback(async (provider: string) => {
    if (!confirm(`确认删除 ${provider}？`)) return;
    try {
      await fetch(`/api/quota/providers/${provider}`, { method: "DELETE" });
      loadProviders();
    } catch {}
  }, [loadProviders]);

  const handleFetch = useCallback(async (provider: string) => {
    setFetching(provider);
    try {
      await fetch(`/api/quota/fetch/${provider}`);
      loadProviders();
    } catch {}
    setFetching(null);
  }, [loadProviders]);

  const cls = status === "critical" || status === "error" ? "critical" : status === "low" ? "low" : "";

  // Format balance display
  const displayBalance = (() => {
    if (!quota.balance) return "--";
    if (quota.balance.startsWith("¥") || quota.balance.startsWith("$")) return quota.balance;
    if (quota.currency === "CNY") return `¥${quota.balance}`;
    if (quota.currency === "USD") return `$${quota.balance}`;
    return quota.balance;
  })();

  // Status label — special case for usage tracking (starts with ¥ and is ok)
  const isUsage = quota.balance?.startsWith("¥") && status === "ok";
  const statusLabel = isUsage ? "已用" : (LABELS[status] ?? status);

  return (
    <div id="providers" ref={elRef} className={`panel grid-quota quota-card ${status}`}>
      <div className="panel-header" style={{ cursor: "pointer" }} onClick={handleExpand}>
        <span className="panel-title">{quota.provider ? `${quota.provider}` : '余额'}</span>
        <span style={{ fontSize: 12, color: "var(--text-muted)", transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
      </div>
      <div className={`quota-amount ${cls}`}>{displayBalance}</div>
      <div className="metric-label" style={{ color: status === "critical" || status === "error" ? "var(--state-critical)" : status === "low" ? "var(--state-warning)" : undefined }}>{statusLabel}</div>

      {expanded && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--line-subtle)", paddingTop: 8 }}>
          {providers.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {providers.map(p => {
                const isActive = p.provider === quota.provider;
                return (
                  <div key={p.provider} onClick={() => handleSwitch(p.provider)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 10px", borderRadius: 8,
                      background: isActive ? "rgba(232,100,79,0.12)" : "var(--bg-hover)",
                      border: isActive ? "1px solid #e8644f" : "1px solid transparent",
                      fontSize: 12, fontFamily: "var(--font-mono)", cursor: "pointer",
                      transition: "all 0.15s",
                      opacity: switching === p.provider ? 0.6 : 1,
                    }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                      <span style={{ fontWeight: 600, color: isActive ? "#e8644f" : "var(--text-primary)" }}>
                        {isActive ? "● " : ""}{p.label || p.provider}
                      </span>
                      <span style={{ color: "var(--text-muted)", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.latestBalance
                          ? (() => {
                              const b = p.latestBalance.balance;
                              const display = b?.startsWith("¥") || b?.startsWith("$") ? b : (p.latestBalance.currency === "CNY" ? "¥" : "$") + b;
                              return `${display} · ${LABELS[p.latestBalance.status] || p.latestBalance.status}`;
                            })()
                          : "未拉取"}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleFetch(p.provider)} disabled={fetching === p.provider}
                        style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 14, padding: "2px 4px", opacity: fetching === p.provider ? 0.4 : 0.7 }}
                        title="刷新">{fetching === p.provider ? "⏳" : "🔄"}</button>
                      <button onClick={() => handleDelete(p.provider)}
                        style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 14, padding: "2px 4px", opacity: 0.7 }}
                        title="删除">🗑</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>暂无配置的 Provider</div>
          )}

          {!showAdd ? (
            <button onClick={() => setShowAdd(true)} style={{
              marginTop: 8, width: "100%", padding: "6px 0", border: "1px dashed var(--line-visible)",
              borderRadius: 6, background: "transparent", color: "var(--text-muted)", fontSize: 12,
              cursor: "pointer", fontFamily: "var(--font-mono)",
            }}>+ 添加 Provider</button>
          ) : (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              <select value={selectedPreset} onChange={e => setSelectedPreset(e.target.value)}
                style={{ ...inputStyle, appearance: "none" as any }}>
                {Object.entries(PRESETS).map(([key, p]) => (
                  <option key={key} value={key}>{p.label}</option>
                ))}
              </select>
              <input placeholder="粘贴 API Key" value={apiKey} type="password"
                onChange={e => setApiKey(e.target.value)}
                style={inputStyle}
                autoFocus />
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={handleAdd} disabled={loading || !apiKey}
                  style={{ flex: 1, padding: "6px 0", border: "none", borderRadius: 6, background: "#e8644f", color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                  {loading ? "保存中..." : "保存并拉取"}
                </button>
                <button onClick={() => { setShowAdd(false); setApiKey(""); }}
                  style={{ padding: "6px 12px", border: "1px solid var(--line-visible)", borderRadius: 6, background: "transparent", color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}>
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "6px 8px", borderRadius: 6,
  border: "1px solid var(--line-visible)", background: "var(--bg-elevated)",
  color: "var(--text-primary)", fontSize: 12, fontFamily: "var(--font-mono)",
  outline: "none", width: "100%", boxSizing: "border-box",
};
