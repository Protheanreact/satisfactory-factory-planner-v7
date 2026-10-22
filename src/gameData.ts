/** Versioned game-data loader. Data is sourced from the public Ficsit Planner dataset;
 * this app stores a local copy and never replaces it with an invalid/older download. */
export const DATA_SOURCE = "https://raw.githubusercontent.com/Albis0/ficsit_planner/main/src/data";
export type GameMeta = { gameVersion: string; changelist: number; engine?: string; extractedAt?: string };
export type Stack = { item: string; rate: number };
export type GameItem = { id: string; name: string; form: "solid" | "liquid" | "gas"; raw: boolean; sink?: number; energy?: number; stack?: number };
export type GameRecipe = { id: string; name: string; kind: "standard" | "alternate" | "converter" | "power"; tier?: number; machine: string; duration: number; power: number; powerRange?: [number, number]; inputs: Stack[]; outputs: Stack[] };
export type GameMachine = { id: string; name: string; power: number; powerExp: number; variable: boolean; somersloopSlots: number; tier: number };
export type GameTransport = { id: string; name: string; rate: number; tier: number };
export type GameData = {
  items: Record<string, GameItem>; recipes: GameRecipe[]; machines: Record<string, GameMachine>;
  worldLimits: Record<string, number | null>; belts: GameTransport[]; pipes: GameTransport[];
  extractors: Array<{ id: string; name: string; rate: number; power: number; powerExp: number; resources: string[]; purity: boolean; tier: number }>;
  generators?: unknown[]; powerStorage?: unknown; vehicles?: unknown[]; stations?: unknown[];
};
export type WorldData = unknown;
export type DataBundle = { meta: GameMeta; gameData: GameData; worldData?: WorldData; checkedAt: string; source: string; sourceRevision?: string };
export type UpdateState = { status: "checking" | "current" | "updated" | "offline" | "error"; message: string; localMeta?: GameMeta; remoteMeta?: GameMeta; bundle?: DataBundle };

const DB_NAME = "satisfactory-planner-data";
const STORE = "bundles";
const KEY = "latest";
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("IndexedDB nicht verfügbar"));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Datenbank konnte nicht geöffnet werden"));
  });
}
export async function readStoredBundle(): Promise<DataBundle | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as DataBundle | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch { return null; }
}
async function writeStoredBundle(bundle: DataBundle): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(bundle, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Lokale Daten konnten nicht gespeichert werden"));
  });
}
async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}check=${Date.now()}`, { cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} bei ${url}`);
  return response.json() as Promise<T>;
}
async function latestCommitFor(path: string): Promise<string | null> {
  try {
    const commits = await fetchJson<Array<{ sha: string }>>(`https://api.github.com/repos/Albis0/ficsit_planner/commits?path=${encodeURIComponent(path)}&per_page=1`);
    return Array.isArray(commits) && commits[0]?.sha ? commits[0].sha : null;
  } catch { return null; }
}
function isValidData(data: unknown): data is GameData {
  if (!data || typeof data !== "object") return false;
  const d = data as Partial<GameData>;
  if (!d.items || typeof d.items !== "object" || !Array.isArray(d.recipes) || !d.machines || typeof d.machines !== "object" || !Array.isArray(d.belts) || !Array.isArray(d.pipes)) return false;
  if (Object.keys(d.items).length === 0 || d.recipes.length === 0 || Object.keys(d.machines).length === 0) return false;
  return d.recipes.every((r) => !!r && typeof r.id === "string" && typeof r.name === "string" && typeof r.machine === "string" && Number.isFinite(r.duration) && Array.isArray(r.inputs) && Array.isArray(r.outputs) && [...r.inputs, ...r.outputs].every((s) => typeof s.item === "string" && Number.isFinite(s.rate)));
}
export async function checkForGameDataUpdates(): Promise<UpdateState> {
  const local = await readStoredBundle();
  try {
    const remoteMeta = await fetchJson<GameMeta>(`${DATA_SOURCE}/meta.json`);
    if (!Number.isFinite(remoteMeta.changelist) || !remoteMeta.gameVersion) throw new Error("Die Versionsdatei hat ein ungültiges Format.");
    // Commit hashes catch data-only corrections even when the in-game build number did not change.
    const [gameRevision, worldRevision] = await Promise.all([
      latestCommitFor("src/data/gamedata.json"), latestCommitFor("src/data/world.json")
    ]);
    const sourceRevision = gameRevision || worldRevision ? `game:${gameRevision ?? "unknown"}|world:${worldRevision ?? "unknown"}` : undefined;
    const remoteIsOlder = !!local && local.meta.changelist > remoteMeta.changelist;
    const sameGameBuild = !!local && local.meta.changelist === remoteMeta.changelist && local.meta.gameVersion === remoteMeta.gameVersion;
    const sameExtraction = !!local && (!remoteMeta.extractedAt || !local.meta.extractedAt || local.meta.extractedAt >= remoteMeta.extractedAt);
    const sameRevision = !sourceRevision || local?.sourceRevision === sourceRevision;
    const hasCurrent = !!local && (remoteIsOlder || (sameGameBuild && sameExtraction && sameRevision));
    if (hasCurrent) {
      const bundle = { ...local!, checkedAt: new Date().toISOString() };
      try { await writeStoredBundle(bundle); } catch { /* cache refresh is optional */ }
      const message = remoteIsOlder
        ? `Lokale Spieldaten sind neuer als die Datenquelle · Build ${local!.meta.changelist}; kein Downgrade durchgeführt.`
        : `Spieldaten aktuell · Version ${local!.meta.gameVersion} (Build ${local!.meta.changelist})`;
      return { status: "current", message, localMeta: local!.meta, remoteMeta, bundle };
    }
    const [gameData, downloadedWorldData] = await Promise.all([
      fetchJson<GameData>(`${DATA_SOURCE}/gamedata.json`),
      fetchJson<WorldData>(`${DATA_SOURCE}/world.json`).catch(() => undefined)
    ]);
    if (!isValidData(gameData)) throw new Error("Der neue Datensatz hat die erwartete Struktur nicht bestanden; die bisherige Datenbank bleibt erhalten.");
    const worldData = downloadedWorldData ?? local?.worldData;
    const bundle: DataBundle = { meta: remoteMeta, gameData, worldData, checkedAt: new Date().toISOString(), source: DATA_SOURCE, sourceRevision };
    await writeStoredBundle(bundle);
    return { status: local ? "updated" : "current", message: local ? `Spieldaten aktualisiert auf ${remoteMeta.gameVersion} · Build ${remoteMeta.changelist}` : `Spieldaten geladen · Version ${remoteMeta.gameVersion} (Build ${remoteMeta.changelist})`, localMeta: local?.meta, remoteMeta, bundle };
  } catch (error) {
    if (local) return { status: "offline", message: `Offline: nutze gespeicherte Spieldaten ${local.meta.gameVersion} · Build ${local.meta.changelist}`, localMeta: local.meta, bundle: local };
    return { status: "error", message: `Spieldaten konnten nicht online geladen werden. ${error instanceof Error ? error.message : "Unbekannter Fehler"}`, remoteMeta: undefined };
  }
}
