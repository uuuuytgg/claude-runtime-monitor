/**
 * Pet resource manager
 * Supports single images (png/gif/svg) and desktop pet spritesheet packs (.zip)
 *
 * Renders spritesheets using CSS @keyframes + steps() frame animation
 * matching the OpenPets rendering protocol:
 *   - pet.json (id, displayName, description, spritesheetPath)
 *   - spritesheet.webp
 *
 * Also auto-discovers pets installed in ~/.codex/pets/<id>/
 *
 * Storage: metadata in localStorage, large dataUrls in IndexedDB
 * (localStorage has a ~5MB limit that base64 spritesheets easily exceed)
 */

import JSZip from 'jszip';

const STORAGE_KEY = 'crm_pet_resources';
const SELECTED_KEY = 'crm_pet_selected';
const MAX_PETS = 20;

// ── IndexedDB helpers for large blob storage ──
const DB_NAME = 'crm_pet_blobs';
const DB_VERSION = 1;
const BLOB_STORE = 'blobs';

let _dbPromise: Promise<IDBDatabase> | null = null;

function openBlobDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(BLOB_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

async function putBlob(id: string, dataUrl: string): Promise<void> {
  try {
    const db = await openBlobDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BLOB_STORE, 'readwrite');
      tx.objectStore(BLOB_STORE).put({ id, dataUrl });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* IndexedDB unavailable — fall through */ }
}

async function getBlob(id: string): Promise<string | null> {
  try {
    const db = await openBlobDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BLOB_STORE, 'readonly');
      const req = tx.objectStore(BLOB_STORE).get(id);
      req.onsuccess = () => resolve(req.result?.dataUrl ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch { return null; }
}

async function deleteBlob(id: string): Promise<void> {
  try {
    const db = await openBlobDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(BLOB_STORE, 'readwrite');
      tx.objectStore(BLOB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* ignore */ }
}

/** Size threshold (bytes) above which dataUrl is stored in IndexedDB instead of localStorage */
const BLOB_THRESHOLD = 64 * 1024; // 64 KB

export type PetType = 'svg' | 'png' | 'gif' | 'spritesheet';

export interface SpriteState {
  row: number;
  frames: number;
  durationMs: number;
  iterations?: number | 'infinite';
}

export interface SpritesheetMeta {
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  sheetW: number;
  sheetH: number;
  states: Record<string, SpriteState>;
}

export interface PetResource {
  id: string;
  name: string;
  type: PetType;
  dataUrl: string;
  spritesheetMeta?: SpritesheetMeta;
  /** For codex pets: the sprite is served by the backend */
  codexId?: string;
  addedAt: number;
}

export type ImportResult =
  | { type: 'image'; dataUrl: string }
  | { type: 'spritesheet'; name: string; dataUrl: string; meta: SpritesheetMeta };

export const DEFAULT_PET_ID = '__claude__';

const DEFAULT_PET: PetResource = {
  id: DEFAULT_PET_ID, name: 'Claude', type: 'svg', dataUrl: '', addedAt: 0,
};

// ── CRM state → OpenPets sprite state mapping ──
const REACTION_TO_STATE: Record<string, string> = {
  idle: 'idle', preparing: 'preparing',
  thinking: 'review', reading_file: 'review',
  editing_file: 'editing', running_command: 'running',
  testing: 'waiting', waiting_permission: 'waiting', waiting_user: 'waiting',
  rate_limited: 'failed', low_balance: 'failed', error: 'error',
  completed: 'success', offline: 'idle',
};

export function stateToAction(state: string): string {
  return REACTION_TO_STATE[state] || 'idle';
}

// ── Internal helpers for localStorage-safe serialization ──

/** Serialize a pet for localStorage — strips large dataUrls to a placeholder */
function petToStorable(p: PetResource): PetResource {
  if (p.dataUrl && p.dataUrl.length > BLOB_THRESHOLD) {
    // Store metadata only; the blob lives in IndexedDB
    return { ...p, dataUrl: '' };
  }
  return p;
}

/** Merge storable metadata from localStorage with actual blob data from IndexedDB */
async function hydratePets(pets: PetResource[]): Promise<PetResource[]> {
  const needsHydration = pets.filter(p => !p.dataUrl && p.id !== DEFAULT_PET_ID);
  if (needsHydration.length === 0) return pets;

  const hydrated = await Promise.all(
    pets.map(async (p) => {
      if (p.dataUrl || p.id === DEFAULT_PET_ID) return p;
      const blob = await getBlob(p.id);
      return blob ? { ...p, dataUrl: blob } : p;
    }),
  );
  return hydrated;
}

// ── CRUD ──
export function getPets(): PetResource[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

/** Async version that merges IndexedDB blob data */
export async function getPetsAsync(): Promise<PetResource[]> {
  return hydratePets(getPets());
}

export function getSelectedPet(): PetResource {
  try {
    const id = localStorage.getItem(SELECTED_KEY);
    if (id && id !== DEFAULT_PET_ID) {
      for (const pet of getPets()) { if (pet.id === id) return pet; }
    }
  } catch {}
  return DEFAULT_PET;
}

/** Async version: loads selected pet with full dataUrl from IndexedDB */
export async function getSelectedPetAsync(): Promise<PetResource> {
  try {
    const id = localStorage.getItem(SELECTED_KEY);
    if (id && id !== DEFAULT_PET_ID) {
      const pets = getPets();
      const pet = pets.find(p => p.id === id);
      if (pet) {
        // Hydrate this single pet
        if (!pet.dataUrl) {
          const blob = await getBlob(pet.id);
          if (blob) return { ...pet, dataUrl: blob };
        }
        return pet;
      }
    }
  } catch {}
  return DEFAULT_PET;
}

export function setSelectedPet(id: string): void { localStorage.setItem(SELECTED_KEY, id); }

export function addPet(pet: Omit<PetResource, 'addedAt'> & { addedAt?: number }): PetResource {
  const id = pet.id || ('pet_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
  const full: PetResource = { ...pet, id, addedAt: pet.addedAt || Date.now() };

  // If dataUrl is large, write it to IndexedDB (fire-and-forget)
  if (full.dataUrl && full.dataUrl.length > BLOB_THRESHOLD) {
    putBlob(full.id, full.dataUrl);
  }

  // Store metadata (potentially without dataUrl) in localStorage
  const storable = petToStorable(full);
  const pets = getPets().filter(p => p.id !== full.id).map(petToStorable);
  if (pets.length >= MAX_PETS) {
    const evicted = pets.shift();
    if (evicted) deleteBlob(evicted.id); // clean up evicted blob
  }
  pets.push(storable);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pets));
  } catch {
    // Quota exceeded — try storing ALL pets without dataUrls
    const stripped = pets.map(p => ({ ...p, dataUrl: '' }));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped)); } catch {}
  }
  return full;
}

export function removePet(id: string): void {
  const pets = getPets().filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pets));
  deleteBlob(id); // clean up blob (fire-and-forget)
  if (localStorage.getItem(SELECTED_KEY) === id) localStorage.setItem(SELECTED_KEY, DEFAULT_PET_ID);
}

// ── Import ──
export async function importFromFile(file: File): Promise<ImportResult> {
  const isZip = file.name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
  if (isZip) return importFromZip(file);
  if (!file.type.startsWith('image/')) throw new Error('不支持的文件格式');
  return { type: 'image', dataUrl: await readAsDataURL(file) };
}

async function importFromZip(file: File): Promise<ImportResult> {
  const buffer = await readAsArrayBuffer(file);
  const zip = await JSZip.loadAsync(buffer);

  const metaFile = zip.file('pet.json');
  if (!metaFile) throw new Error('.zip 中缺少 pet.json');
  let json: any;
  try { json = JSON.parse(await metaFile.async('text')); } catch { throw new Error('pet.json 格式无效'); }

  const sheetName = json.spritesheetPath || 'spritesheet.webp';
  const sheetFile = zip.file(sheetName);
  if (!sheetFile) throw new Error(`.zip 中缺少 ${sheetName}`);

  const sheetDataUrl = await blobToDataURL(await sheetFile.async('blob'));
  const img = await loadImage(sheetDataUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;

  const meta = detectGrid(w, h);
  if (!meta) throw new Error(`无法识别精灵表布局 (${w}x${h})`);

  const name = json.displayName || json.name || file.name.replace(/\.[^/.]+$/, '');
  return { type: 'spritesheet', name, dataUrl: sheetDataUrl, meta };
}

// ── Grid/state detection ──
const KNOWN_LAYOUTS: Array<{
  columns: number; rows: number;
  states: Record<string, SpriteState>;
}> = [
  {
    // OpenPets default: 8 cols x 9 rows, 192x208
    columns: 8, rows: 9,
    states: {
      idle: { row: 0, frames: 6, durationMs: 5500, iterations: 'infinite' },
      'running-right': { row: 1, frames: 8, durationMs: 1060 },
      'running-left': { row: 2, frames: 8, durationMs: 1060 },
      waving: { row: 3, frames: 4, durationMs: 700, iterations: 2 },
      jumping: { row: 4, frames: 5, durationMs: 840, iterations: 2 },
      failed: { row: 5, frames: 8, durationMs: 1220, iterations: 2 },
      waiting: { row: 6, frames: 6, durationMs: 1010 },
      running: { row: 7, frames: 6, durationMs: 820 },
      review: { row: 8, frames: 6, durationMs: 1030 },
    },
  },
  {
    // Common 4x4 codex pet: 1536x1872 → 384x468 per frame
    columns: 4, rows: 4,
    states: {
      idle: { row: 0, frames: 4, durationMs: 3000, iterations: 'infinite' },
      walking: { row: 1, frames: 4, durationMs: 1200 },
      running: { row: 1, frames: 4, durationMs: 800 },
      review: { row: 2, frames: 4, durationMs: 1200 },
      editing: { row: 2, frames: 4, durationMs: 1200 },
      action: { row: 2, frames: 4, durationMs: 800, iterations: 3 },
      preparing: { row: 2, frames: 4, durationMs: 1200 },
      waiting: { row: 3, frames: 4, durationMs: 1000 },
      failed: { row: 3, frames: 4, durationMs: 800, iterations: 2 },
      error: { row: 3, frames: 4, durationMs: 800, iterations: 2 },
      success: { row: 0, frames: 4, durationMs: 2000, iterations: 3 },
    },
  },
  {
    // 3x3 common
    columns: 3, rows: 3,
    states: {
      idle: { row: 0, frames: 3, durationMs: 2400, iterations: 'infinite' },
      running: { row: 1, frames: 3, durationMs: 600, iterations: 3 },
      review: { row: 1, frames: 3, durationMs: 600, iterations: 3 },
      editing: { row: 1, frames: 3, durationMs: 600, iterations: 3 },
      waiting: { row: 0, frames: 3, durationMs: 2400, iterations: 'infinite' },
      preparing: { row: 1, frames: 3, durationMs: 600, iterations: 3 },
      failed: { row: 2, frames: 3, durationMs: 600, iterations: 2 },
      error: { row: 2, frames: 3, durationMs: 600, iterations: 2 },
      success: { row: 0, frames: 3, durationMs: 2000, iterations: 3 },
    },
  },
];

function detectGrid(w: number, h: number): SpritesheetMeta | null {
  for (const layout of KNOWN_LAYOUTS) {
    if (w % layout.columns !== 0 || h % layout.rows !== 0) continue;
    const fw = w / layout.columns;
    const fh = h / layout.rows;
    if (fw >= 32 && fw <= 1024 && fh >= 32 && fh <= 1024) {
      return { frameWidth: fw, frameHeight: fh, columns: layout.columns, rows: layout.rows, sheetW: w, sheetH: h, states: layout.states };
    }
  }
  // Fallback auto-detect
  for (let cols = 2; cols <= 12; cols++) {
    if (w % cols !== 0) continue;
    for (let rows = 2; rows <= 12; rows++) {
      if (h % rows !== 0) continue;
      const fw = w / cols;
      const fh = h / rows;
      if (fw >= 32 && fw <= 1024 && fh >= 32 && fh <= 1024) {
        const states: Record<string, SpriteState> = {
          idle: { row: 0, frames: cols, durationMs: cols * 600, iterations: 'infinite' },
          running: { row: Math.min(1, rows - 1), frames: cols, durationMs: Math.round(cols * 200), iterations: 3 },
          review: { row: Math.min(1, rows - 1), frames: cols, durationMs: Math.round(cols * 200), iterations: 3 },
          waiting: { row: Math.min(2, rows - 1) || 0, frames: cols, durationMs: cols * 300, iterations: 'infinite' },
          failed: { row: Math.min(rows - 1, 2), frames: cols, durationMs: Math.round(cols * 150), iterations: 2 },
          success: { row: 0, frames: cols, durationMs: cols * 400, iterations: 3 },
        };
        return { frameWidth: fw, frameHeight: fh, columns: cols, rows, sheetW: w, sheetH: h, states };
      }
    }
  }
  return null;
}

// ── Codex pets discovery ──
let _fetchedCodexPets = false;

/** Called once on mount to discover pets from local API and inject them */
export async function discoverCodexPets(): Promise<void> {
  if (_fetchedCodexPets) return;
  _fetchedCodexPets = true;
  try {
    const res = await fetch('/api/codex-pets');
    if (!res.ok) return;
    const data = await res.json();
    if (!data.pets || !Array.isArray(data.pets)) return;

    const existing = getPets();
    const existingIds = new Set(existing.map(p => p.id));
    let changed = false;

    for (const pet of data.pets) {
      if (existingIds.has(pet.id)) continue; // already imported
      // Fetch spritesheet to detect grid
      try {
        const sheetRes = await fetch(`/api/codex-pets/${encodeURIComponent(pet.id)}/spritesheet`);
        if (!sheetRes.ok) continue;
        const blob = await sheetRes.blob();
        const dataUrl = await blobToDataURL(blob);
        const img = await loadImage(dataUrl);
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const meta = detectGrid(w, h);
        if (!meta) continue;

        existing.push({
          id: pet.id,
          name: pet.displayName,
          type: 'spritesheet',
          dataUrl,
          spritesheetMeta: meta,
          codexId: pet.id,
          addedAt: Date.now(),
        });
        changed = true;
      } catch {}
    }

    if (changed) {
      // Store blobs in IndexedDB, metadata in localStorage
      for (const pet of existing) {
        if (pet.dataUrl && pet.dataUrl.length > BLOB_THRESHOLD) {
          putBlob(pet.id, pet.dataUrl);
        }
      }
      const storable = existing.map(petToStorable);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(storable)); } catch {}
    }
  } catch {}
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src;
  });
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((r, rej) => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.onerror = () => rej(fr.error); fr.readAsDataURL(file); });
}

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((r, rej) => { const fr = new FileReader(); fr.onload = () => r(fr.result as ArrayBuffer); fr.onerror = () => rej(fr.error); fr.readAsArrayBuffer(file); });
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((r, rej) => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob); });
}
