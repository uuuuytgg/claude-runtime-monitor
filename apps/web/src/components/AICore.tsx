import { useRef, useEffect, useState, useCallback } from "react";
import { gsap } from "gsap";
import type { MonitorSnapshot } from "@crm/shared";
import {
  getPets, getPetsAsync, getSelectedPet, getSelectedPetAsync, setSelectedPet,
  addPet, removePet, importFromFile, stateToAction,
  discoverCodexPets,
  type PetResource, type SpriteState, type ImportResult,
} from "../hooks/usePetResources";

const STATE_LABELS: Record<string, string> = {
  offline: "离线", idle: "空闲", preparing: "准备中",
  thinking: "思考中", reading_file: "读取文件", editing_file: "编辑中",
  running_command: "执行命令", testing: "测试中",
  waiting_permission: "等待确认", waiting_user: "等待用户",
  rate_limited: "触发限流", low_balance: "余额偏低",
  error: "异常", completed: "完成",
};

interface AICoreProps { state: string; intensity?: number; snapshot: MonitorSnapshot | null; }

const CLAUDE_LOGO_PATH =
  "M52.4285 162.873L98.7844 136.879L99.5485 134.602L98.7844 133.334H96.4921L88.7237 132.862L62.2346 132.153L39.3113 131.207L17.0249 130.026L11.4214 128.844L6.2 121.873L6.7094 118.447L11.4214 115.257L18.171 115.847L33.0711 116.911L55.4855 118.447L71.6586 119.392L95.728 121.873H99.5485L100.058 120.337L98.7844 119.392L97.7656 118.447L74.5877 102.732L49.4995 86.1905L36.3823 76.62L29.3779 71.7757L25.8121 67.2858L24.2839 57.3608L30.6515 50.2716L39.3113 50.8623L41.4763 51.4531L50.2636 58.1879L68.9842 72.7209L93.4357 90.6804L97.0015 93.6343L98.4374 92.6652L98.6571 91.9801L97.0015 89.2625L83.757 65.2772L69.621 40.8192L63.2534 30.6579L61.5978 24.632C60.9565 22.1032 60.579 20.0111 60.579 17.4246L67.8381 7.49965L71.9133 6.19995L81.7193 7.49965L85.7946 11.0443L91.9074 24.9865L101.714 46.8451L116.996 76.62L121.453 85.4816L123.873 93.6343L124.764 96.1155H126.292V94.6976L127.566 77.9197L129.858 57.3608L132.15 30.8942L132.915 23.4505L136.608 14.4708L143.994 9.62643L149.725 12.344L154.437 19.0788L153.8 23.4505L150.998 41.6463L145.522 70.1215L141.957 89.2625H143.994L146.414 86.7813L156.093 74.0206L172.266 53.698L179.398 45.6635L187.803 36.802L193.152 32.5484H203.34L210.726 43.6549L207.415 55.1159L196.972 68.3492L188.312 79.5739L175.896 96.2095L168.191 109.585L168.882 110.689L170.738 110.53L198.755 104.504L213.91 101.787L231.994 98.7149L240.144 102.496L241.036 106.395L237.852 114.311L218.495 119.037L195.826 123.645L162.07 131.592L161.696 131.893L162.137 132.547L177.36 133.925L183.855 134.279H199.774L229.447 136.524L237.215 141.605L241.8 147.867L241.036 152.711L229.065 158.737L213.019 154.956L175.45 145.977L162.587 142.787H160.805V143.85L171.502 154.366L191.242 172.089L215.82 195.011L217.094 200.682L213.91 205.172L210.599 204.699L188.949 188.394L180.544 181.069L161.696 165.118H160.422V166.772L164.752 173.152L187.803 207.771L188.949 218.405L187.294 221.832L181.308 223.959L174.813 222.777L161.187 203.754L147.305 182.486L136.098 163.345L134.745 164.2L128.075 235.42L125.019 239.082L117.887 241.8L111.902 237.31L108.718 229.984L111.902 215.452L115.722 196.547L118.779 181.541L121.58 162.873L123.291 156.636L123.14 156.219L121.773 156.449L107.699 175.752L86.304 204.699L69.3663 222.777L65.291 224.431L58.2867 220.768L58.9235 214.27L62.8713 208.48L86.304 178.705L100.44 160.155L109.551 149.507L109.462 147.967L108.959 147.924L46.6977 188.512L35.6182 189.93L30.7788 185.44L31.4156 178.115L33.7079 175.752L52.4285 162.873Z";

const STATE_THEME: Record<string, { color: string; glow: string; pulseSpeed: number; rotate: number }> = {
  offline:        { color: "#4a4742", glow: "rgba(74,71,66,0)",     pulseSpeed: 0,   rotate: 0 },
  idle:           { color: "#D97757", glow: "rgba(217,119,87,0.35)", pulseSpeed: 0.8, rotate: 2 },
  thinking:       { color: "#E88760", glow: "rgba(232,135,96,0.40)", pulseSpeed: 1.5, rotate: 5 },
  reading_file:   { color: "#D97757", glow: "rgba(217,119,87,0.30)", pulseSpeed: 1.0, rotate: 3 },
  editing_file:   { color: "#F0A030", glow: "rgba(240,160,48,0.25)", pulseSpeed: 1.2, rotate: 4 },
  running_command:{ color: "#B070E0", glow: "rgba(176,112,224,0.25)", pulseSpeed: 1.3, rotate: 6 },
  testing:        { color: "#B070E0", glow: "rgba(176,112,224,0.25)", pulseSpeed: 1.3, rotate: 6 },
  waiting_permission: { color: "#E88840", glow: "rgba(232,136,64,0.20)", pulseSpeed: 0.6, rotate: 1 },
  waiting_user:   { color: "#E88840", glow: "rgba(232,136,64,0.20)", pulseSpeed: 0.6, rotate: 1 },
  rate_limited:   { color: "#C06030", glow: "rgba(192,96,48,0.30)",  pulseSpeed: 0.5, rotate: 0 },
  low_balance:    { color: "#C08040", glow: "rgba(192,128,64,0.20)", pulseSpeed: 0.7, rotate: 0 },
  error:          { color: "#C84040", glow: "rgba(200,64,64,0.35)",  pulseSpeed: 2.5, rotate: 10 },
  completed:      { color: "#60A860", glow: "rgba(96,168,96,0.25)",  pulseSpeed: 0.5, rotate: 0 },
};

const INTERACTIONS: string[] = ['jumping', 'waving', 'failed', 'jumping', 'idle'];

export function AICore({ state, intensity = 0, snapshot }: AICoreProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const spriteRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLStyleElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const clickTimerRef = useRef<number>(0);
  const animCleanupRef = useRef<() => void>(null);

  const [selectedPet, setSelectedPetState] = useState<PetResource>(getSelectedPet);
  const [pets, setPetsState] = useState<PetResource[]>(getPets);
  const [importing, setImporting] = useState(false);
  const [showSelector, setShowSelector] = useState(false);
  const [hoveredPet, setHoveredPet] = useState<string | null>(null);

  const [spriteState, setSpriteState] = useState('idle');
  const [clickReaction, setClickReaction] = useState<string | null>(null);

  const isDefault = selectedPet.id === '__claude__';
  const meta = selectedPet.spritesheetMeta;
  const isSpritesheet = selectedPet.type === 'spritesheet' && !!meta;
  const theme = STATE_THEME[state] || STATE_THEME.idle;
  const label = STATE_LABELS[state] || state;
  const currentTool = snapshot?.claude?.model;

  // Hydrate pets and selected pet from IndexedDB on mount
  useEffect(() => {
    // Sync initial pets from localStorage (fast)
    setPetsState(getPets());
    // Then hydrate with full dataUrls from IndexedDB
    getPetsAsync().then(hydrated => setPetsState(hydrated));
    getSelectedPetAsync().then(pet => setSelectedPetState(pet));

    discoverCodexPets().then(() => {
      // Re-read after codex pets are loaded (with hydration)
      getPetsAsync().then(hydrated => setPetsState(hydrated));
      // Also re-hydrate selected pet in case codex pets updated it
      getSelectedPetAsync().then(pet => setSelectedPetState(pet));
    });
  }, []);

  // Sync CRM state → sprite animation state
  useEffect(() => {
    if (!isSpritesheet) return;
    const action = clickReaction || stateToAction(state);
    setSpriteState(action);
  }, [state, isSpritesheet, clickReaction]);

  // When spriteState changes, update the CSS custom props on the sprite element
  useEffect(() => {
    if (!isSpritesheet || !meta || !spriteRef.current) return;
    const row = meta.states[spriteState];
    if (!row) {
      // Fall back to idle if state not found
      const idle = meta.states.idle;
      if (!idle) return;
      applyStateToElement(spriteRef.current, meta, idle);
      return;
    }
    applyStateToElement(spriteRef.current, meta, row);
  }, [spriteState, isSpritesheet, meta]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => { if (animCleanupRef.current) animCleanupRef.current(); };
  }, []);

  // ── GSAP breathing + glow ──
  useEffect(() => {
    const target = isSpritesheet ? spriteRef.current : isDefault ? svgRef.current : null;
    if (!target || !glowRef.current) return;
    if (tlRef.current) tlRef.current.kill();

    const tl = gsap.timeline({ repeat: -1, yoyo: true });
    const speed = theme.pulseSpeed || 0.8;
    const dur = speed > 0 ? 1 / speed : 1;

    tl.to(target, { scale: 1.06, duration: dur, ease: "sine.inOut" }, 0);
    tl.to(glowRef.current, { scale: 1.25, opacity: 0.6, duration: dur, ease: "sine.inOut" }, 0);
    if (containerRef.current && theme.rotate > 0) {
      tl.to(containerRef.current, { rotation: theme.rotate, duration: dur * 2, ease: "sine.inOut" }, 0);
    }

    tlRef.current = tl;
    return () => { if (tlRef.current) tlRef.current.kill(); };
  }, [theme.pulseSpeed, theme.rotate, isDefault, isSpritesheet]);

  // ── Click interaction ──
  const handlePetClick = useCallback(() => {
    if (!isSpritesheet || !meta) { setShowSelector(v => !v); return; }

    const anims = INTERACTIONS.filter(a => meta.states[a] && a !== spriteState);
    if (anims.length === 0) return;
    const pick = anims[Math.floor(Math.random() * anims.length)];
    setClickReaction(pick);

    const row = meta.states[pick];
    const totalMs = (row.iterations === 'infinite' ? 3000 : (row.iterations as number) * row.durationMs);

    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => {
      setClickReaction(null);
      setSpriteState(stateToAction(state));
    }, Math.min(totalMs, 3000));
  }, [isSpritesheet, meta, spriteState, state]);

  // ── Import ──
  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const result: ImportResult = await importFromFile(file);
      const pet = result.type === 'spritesheet'
        ? addPet({ id: '', name: result.name, dataUrl: result.dataUrl, type: 'spritesheet', spritesheetMeta: result.meta } as any)
        : addPet({ id: '', name: file.name.replace(/\.[^/.]+$/, ""), dataUrl: result.dataUrl, type: result.dataUrl.startsWith('data:image/svg') ? 'svg' : result.dataUrl.startsWith('data:image/gif') ? 'gif' : 'png' } as any);
      // Re-hydrate pets list (so imported pet shows dataUrl)
      getPetsAsync().then(hydrated => setPetsState(hydrated));
      setSelectedPet(pet.id);
      setSelectedPetState(pet); // pet object already has full dataUrl
      setShowSelector(true);
    } catch (err: any) { alert(err.message || "导入失败"); }
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedPet(id);
    setClickReaction(null);
    if (id === '__claude__') {
      setSelectedPetState({ id: '__claude__', name: 'Claude', type: 'svg', dataUrl: '', addedAt: 0 });
    } else {
      // Try sync first from localStorage
      const syncPet = getPets().find(p => p.id === id);
      if (syncPet?.dataUrl) {
        setSelectedPetState(syncPet);
      } else {
        // dataUrl may be in IndexedDB — hydrate async
        getSelectedPetAsync().then(pet => setSelectedPetState(pet));
      }
    }
  }, []);

  const handleRemove = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removePet(id);
    // Re-hydrate remaining pets (they may have had blobs)
    getPetsAsync().then(hydrated => setPetsState(hydrated));
    if (selectedPet.id === id) handleSelect('__claude__');
  }, [selectedPet.id, handleSelect]);

  return (
    <div id="overview" className="panel grid-ai-core">
      <div className="panel-header">
        <span className="panel-title">AI 核心</span>
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span className={`status-indicator dot-${state}`} />
          <span className="status-label">{label}</span>
        </span>
      </div>

      <div ref={containerRef} style={{
        display: "flex", justifyContent: "center", alignItems: "center",
        flex: 1, minHeight: 200, position: "relative",
        cursor: isSpritesheet ? "pointer" : "pointer",
      }}
        onClick={handlePetClick}
        title={isSpritesheet ? "点击宠物互动" : "点击切换宠物"}
      >
        <div ref={glowRef} style={{
          position: "absolute", width: 160, height: 160, borderRadius: "50%",
          background: `radial-gradient(circle, ${theme.glow} 0%, transparent 70%)`,
          pointerEvents: "none",
        }} />

        {isDefault && (
          <svg ref={svgRef} width={160} height={160} viewBox="0 0 248 248" fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              position: "relative", zIndex: 1,
              filter: state === "offline" ? "grayscale(1)" : "none",
              transition: "filter 0.5s ease",
            }}
          >
            <path d={CLAUDE_LOGO_PATH} fill={theme.color} />
          </svg>
        )}

        {/* OpenPets-style sprite rendering */}
        {isSpritesheet && meta && (
          <>
            <div ref={spriteRef}
              style={{
                position: "relative", zIndex: 1,
                width: meta.frameWidth, height: meta.frameHeight,
                maxWidth: 280, maxHeight: 280,
                backgroundImage: `url(${selectedPet.dataUrl})`,
                backgroundSize: `${meta.sheetW}px ${meta.sheetH}px`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "0px 0px",
                filter: state === "offline" ? "grayscale(1)" : "none",
                transition: "filter 0.5s ease",
                transformOrigin: "center center",
              }}
            />
            <div style={{
              position: "absolute", bottom: 4, left: 4,
              background: "rgba(0,0,0,0.55)", borderRadius: 4, padding: "2px 8px",
              fontFamily: "var(--font-mono)", fontSize: 10, color: "#fff",
            }}>
              🎬 {spriteState}
            </div>
          </>
        )}

        {!isDefault && !isSpritesheet && (
          <img src={selectedPet.dataUrl} alt={selectedPet.name}
            style={{
              position: "relative", zIndex: 1, width: 160, height: 160,
              objectFit: "contain", borderRadius: "50%",
              filter: state === "offline" ? "grayscale(1)" : "none",
              transition: "filter 0.5s ease",
            }}
          />
        )}
      </div>

      {/* State indicator bar */}
      {isSpritesheet && meta && (
        <div style={{
          display: "flex", justifyContent: "center", gap: 4, marginTop: 4,
        }}>
          {Object.keys(meta.states).filter(s => !s.includes('-')).slice(0, 7).map(s => {
            const hasRow = !!meta.states[s];
            return (
              <span key={s} style={{
                display: "inline-block", padding: "1px 6px", borderRadius: 4,
                fontFamily: "var(--font-mono)", fontSize: 9,
                background: spriteState === s ? "var(--brand-coral)" : "var(--bg-hover)",
                color: spriteState === s ? "#fff" : "var(--text-muted)",
                transition: "all 0.3s",
              }}>
                {s}
              </span>
            );
          })}
        </div>
      )}

      {/* Pet selector — always visible */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 4px 0", borderTop: "1px solid var(--line-subtle)",
        marginTop: 8, flexWrap: "wrap",
      }}>
        <Thumbnail active={isDefault} label="C" title="Claude (默认)"
          onClick={() => handleSelect("__claude__")} />
        {pets.map(pet => (
          <div key={pet.id} style={{ position: "relative" }}
            onMouseEnter={() => setHoveredPet(pet.id)}
            onMouseLeave={() => setHoveredPet(null)}
          >
            <Thumbnail active={selectedPet.id === pet.id}
              imgSrc={pet.dataUrl || undefined}
              title={pet.name}
              onClick={() => handleSelect(pet.id)}
            />
            {hoveredPet === pet.id && (
              <button onClick={(e) => handleRemove(e, pet.id)}
                style={{
                  position: "absolute", top: -4, right: -4, width: 16, height: 16,
                  borderRadius: "50%", border: "none",
                  background: "var(--state-critical)", color: "#fff",
                  fontSize: 10, lineHeight: "16px", textAlign: "center",
                  cursor: "pointer", padding: 0, opacity: 0.85,
                }} title="删除">×</button>
            )}
          </div>
        ))}
        {pets.length < 12 && (
          <button disabled={importing}
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: 36, height: 36, borderRadius: "50%",
              border: "1px dashed var(--line-visible)", background: "transparent",
              color: "var(--text-muted)", fontSize: 18,
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", flexShrink: 0,
            }}
            title={importing ? "导入中..." : "导入宠物 (.zip / 图片 / GIF)"}
          >{importing ? "..." : "+"}</button>
        )}
        <input ref={fileInputRef} type="file" accept="image/*,.zip"
          style={{ display: "none" }} onChange={handleFile} />
      </div>

      {currentTool && (
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)",
          color: "var(--text-secondary)", textAlign: "center", marginTop: 8,
        }}>{currentTool}</div>
      )}
    </div>
  );
}

// ── Apply animation state to a sprite element ──
function applyStateToElement(el: HTMLDivElement, meta: NonNullable<PetResource['spritesheetMeta']>, state: SpriteState): void {
  const fw = meta.frameWidth;
  const fh = meta.frameHeight;
  const rowY = -state.row * fh;
  const totalW = state.frames * fw;
  const iterations = state.iterations === 'infinite' ? 'infinite' : state.iterations;

  // Use CSS animation with steps() for frame-by-frame
  el.style.backgroundPosition = `0px ${rowY}px`;
  el.style.animation = 'none';
  // Force reflow
  void el.offsetWidth;

  const animName = `pet-${Math.random().toString(36).slice(2, 6)}`;
  const keyframes = `
@keyframes ${animName} {
  from { background-position: 0px ${rowY}px; }
  to { background-position: -${totalW}px ${rowY}px; }
}`;

  // Remove old style if exists
  let styleEl = el.querySelector('style') as HTMLStyleElement;
  if (!styleEl) {
    styleEl = document.createElement('style');
    el.appendChild(styleEl);
  }
  styleEl.textContent = keyframes;

  el.style.animation = `${animName} ${state.durationMs}ms steps(${state.frames}) ${iterations}`;
}

function Thumbnail({ active, label, imgSrc, title, onClick }: {
  active: boolean; label?: string; imgSrc?: string; title?: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} title={title}
      style={{
        width: 36, height: 36, borderRadius: "50%",
        border: active ? "2px solid var(--brand-coral)" : "2px solid transparent",
        background: "var(--bg-panel)", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden", outline: "none", padding: 0, flexShrink: 0,
      }}
    >
      {imgSrc ? (
        <img src={imgSrc} alt={title || ""}
          style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <span style={{
          fontFamily: "var(--font-display)", fontSize: 14,
          color: "var(--text-secondary)", fontWeight: 600,
        }}>{label || "?"}</span>
      )}
    </button>
  );
}
