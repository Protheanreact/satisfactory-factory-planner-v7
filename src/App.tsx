import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ChangeEvent } from "react";
import {
  Activity, ArrowDownUp, Boxes, Cable, Check, ChevronDown, CircleHelp,
  Factory, GitBranch, Map, MoreHorizontal, MousePointer2, Plus, Save, Settings2,
  Trash2, X, Zap, Pickaxe, Hammer, Layers, RotateCcw, Download, Upload, Database, RefreshCw,
  Gauge, Droplets, FlaskConical, ShieldCheck, CircleAlert
} from "lucide-react";
import { beltCapacity, nodeRate, type BeltTier, type MinerTier, type Purity } from "./engine";
import { checkForGameDataUpdates, type DataBundle, type UpdateState } from "./gameData";
import { planProductionVariants, recipeAudit, type Objective, type PlanResult, type Progression, type Strategy } from "./optimizer";
import { cloudConfigured, getSavedSession, signIn, signOut, signUp, loadCloudPlan, saveCloudPlan, type CloudSession } from "./cloud";

type Kind = "node" | "smelter" | "constructor" | "assembler" | "storage";
type Block = {
  id: string; kind: Kind; title: string; x: number; y: number;
  purity?: Purity; miner?: MinerTier; clock?: number; belt?: BeltTier;
  recipe?: string; count?: number; target?: number;
};
type Link = { id: string; from: string; to: string; belt: BeltTier };
const kindInfo: Record<Kind, { title: string; subtitle: string; icon: string; color: string }> = {
  node: { title: "Ressourcen-Node", subtitle: "Rohstoffquelle", icon: "node", color: "amber" },
  smelter: { title: "Schmelzofen", subtitle: "Erz → Barren", icon: "smelter", color: "orange" },
  constructor: { title: "Konstruktor", subtitle: "Bauteile herstellen", icon: "constructor", color: "blue" },
  assembler: { title: "Assembler", subtitle: "2 Zutaten kombinieren", icon: "assembler", color: "violet" },
  storage: { title: "Lager", subtitle: "Zwischenlager", icon: "storage", color: "slate" }
};
const purityLabel: Record<Purity, string> = { impure: "Unrein", normal: "Normal", pure: "Rein" };
const beltLabel = (tier: BeltTier) => `Mk.${tier} · ${beltCapacity[tier].toLocaleString("de-DE")}/min`;
const flowUnit = (form: string) => form === "Feststoff" ? "Stk/min" : "m³/min";
const formatFlow = (flow: { rate: number; form: string }) => `${flow.rate.toLocaleString("de-DE")} ${flowUnit(flow.form)}`;
const initialBlocks: Block[] = [
  { id: "n1", kind: "node", title: "Eisen-Node", x: 90, y: 140, purity: "pure", miner: 2, clock: 100, belt: 3 },
  { id: "s1", kind: "smelter", title: "Schmelzofen", x: 390, y: 140, count: 4, recipe: "Eisenbarren" },
  { id: "c1", kind: "constructor", title: "Konstruktor", x: 700, y: 140, count: 2, recipe: "Eisenplatten" }
];
const initialLinks: Link[] = [
  { id: "l1", from: "n1", to: "s1", belt: 3 },
  { id: "l2", from: "s1", to: "c1", belt: 3 }
];
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function BlockIcon({ kind, size = 19 }: { kind: Kind; size?: number }) {
  if (kind === "node") return <Pickaxe size={size}/>;
  if (kind === "smelter") return <Factory size={size}/>;
  if (kind === "constructor") return <Hammer size={size}/>;
  if (kind === "assembler") return <Layers size={size}/>;
  return <Boxes size={size}/>;
}

export default function App() {
  const [view, setView] = useState<"factory" | "map" | "planner" | "data">("planner");
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [links, setLinks] = useState<Link[]>(initialLinks);
  const [selectedId, setSelectedId] = useState("n1");
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [target, setTarget] = useState(120);
  const [saved, setSaved] = useState(false);
  const [cloudSession, setCloudSession] = useState<CloudSession | null>(() => getSavedSession());
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [cloudStatus, setCloudStatus] = useState("Nur lokal gespeichert");
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudRevision, setCloudRevision] = useState(0);
  const [mobilePanel, setMobilePanel] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [mapResource, setMapResource] = useState("all");
  const [mapPurity, setMapPurity] = useState("all");
  const [updateState, setUpdateState] = useState<UpdateState>({ status: "checking", message: "Prüfe Spieldaten …" });
  const [dataBusy, setDataBusy] = useState(false);
  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [targetRate, setTargetRate] = useState(10);
  const [objective, setObjective] = useState<Objective>("balanced");
  const [strategy, setStrategy] = useState<Strategy>("maximum");
  const [progression, setProgression] = useState<Progression>("standard");
  const [allowAlternates, setAllowAlternates] = useState(true);
  const [allowOverclock, setAllowOverclock] = useState(true);
  const [maxClock, setMaxClock] = useState(250);
  const [useSomersloops, setUseSomersloops] = useState(false);
  const [planResult, setPlanResult] = useState<PlanResult | null>(null);
  const [planVariants, setPlanVariants] = useState<PlanResult[]>([]);
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [planError, setPlanError] = useState("");
  const bundle: DataBundle | null = updateState.bundle ?? null;
  const productOptions = useMemo(() => {
    if (!bundle) return [];
    const produced = new Set(bundle.gameData.recipes.flatMap(r => r.outputs.map(o => o.item)));
    return Object.values(bundle.gameData.items).filter(i => produced.has(i.id) && !i.raw).sort((a,b) => a.name.localeCompare(b.name, "de"));
  }, [bundle]);
  const visibleProducts = productOptions.filter(i => i.name.toLowerCase().includes(productSearch.toLowerCase())).slice(0, 120);
  const activeProductId = productOptions.some(i => i.id === productId) ? productId : (productOptions[0]?.id ?? "");
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; blockX: number; blockY: number } | null>(null);
  const selected = blocks.find(b => b.id === selectedId) ?? null;


  const linkPaths = useMemo(() => links.map(link => {
    const from = blocks.find(b => b.id === link.from);
    const to = blocks.find(b => b.id === link.to);
    if (!from || !to) return null;
    const x1 = from.x + 196, y1 = from.y + 57;
    const x2 = to.x, y2 = to.y + 57;
    const mid = (x1 + x2) / 2;
    return { ...link, d: `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`, labelX: mid, labelY: (y1 + y2) / 2 - 8 };
  }).filter(Boolean), [links, blocks]);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const result = await checkForGameDataUpdates();
      if (alive) {
        setUpdateState(result);
        if (result.bundle && !productId) {
          const produced = new Set(result.bundle.gameData.recipes.flatMap(r => r.outputs.map(o => o.item)));
          const first = Object.values(result.bundle.gameData.items).find(i => produced.has(i.id) && !i.raw);
          if (first) setProductId(first.id);
        }
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    void check();
    const interval = window.setInterval(() => { void check(); }, 6 * 60 * 60 * 1000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => { alive = false; window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); };
  }, []);

  async function refreshGameData() {
    setDataBusy(true); setUpdateState(prev => ({ ...prev, status: "checking", message: "Prüfe auf neue Spieldaten …" }));
    try {
      const result = await checkForGameDataUpdates();
      setUpdateState(result);
      if (result.bundle && !productOptions.some(i => i.id === productId)) {
        const produced = new Set(result.bundle.gameData.recipes.flatMap(r => r.outputs.map(o => o.item)));
        const first = Object.values(result.bundle.gameData.items).find(i => produced.has(i.id) && !i.raw);
        if (first) setProductId(first.id);
      }
    } finally { setDataBusy(false); }
  }

  function calculateProduction() {
    if (!bundle || !activeProductId) { setPlanError("Noch keine gültigen Spieldaten geladen. Prüfe die Internetverbindung oder öffne die Datenverwaltung."); return; }
    try {
      const results = planProductionVariants(bundle, activeProductId, targetRate, { objective, strategy, allowAlternates, allowOverclock, maxClock, useSomersloops, progression }, 8);
      setPlanVariants(results); setSelectedVariant(0); setPlanResult(results[0] ?? null); setPlanError("");
    } catch (error) { setPlanResult(null); setPlanError(error instanceof Error ? error.message : "Die Produktionskette konnte nicht berechnet werden."); }
  }

  useEffect(() => { setPlanResult(null); setPlanVariants([]); setSelectedVariant(0); }, [activeProductId, targetRate, objective, strategy, allowAlternates, allowOverclock, maxClock, useSomersloops, progression]);

  useEffect(() => {
    const raw = localStorage.getItem("sfp-v2");
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data.blocks) && Array.isArray(data.links)) {
        setBlocks(data.blocks); setLinks(data.links);
        setSelectedId(data.selectedId ?? data.blocks[0]?.id ?? "");
        setTarget(data.target ?? 120);
      }
    } catch { /* ignore invalid local prototype data */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!cloudSession || !cloudConfigured) { setCloudReady(false); setCloudStatus(cloudConfigured ? "Nur lokal gespeichert" : "Cloud noch nicht konfiguriert"); return; }
    setCloudReady(false); setCloudStatus("Cloud-Bauplan wird geladen …");
    void loadCloudPlan().then(plan => {
      if (cancelled) return;
      if (plan && Array.isArray(plan.blocks) && Array.isArray(plan.links)) {
        setBlocks(plan.blocks as Block[]); setLinks(plan.links as Link[]);
        setSelectedId(plan.selectedId ?? (plan.blocks[0] as Block | undefined)?.id ?? "");
        setTarget(plan.target ?? 120);
        localStorage.setItem("sfp-v2", JSON.stringify(plan));
        setCloudStatus("Cloud-Bauplan geladen");
      } else {
        setCloudStatus("Noch kein Cloud-Bauplan – lokale Planung bleibt erhalten");
      }
      setCloudReady(true);
    }).catch(error => { if (!cancelled) { setCloudStatus(error instanceof Error ? error.message : "Cloud-Laden fehlgeschlagen"); setCloudReady(true); } });
    return () => { cancelled = true; };
  }, [cloudSession?.user.id]);

  useEffect(() => {
    if (!cloudSession || !cloudReady || !cloudConfigured) return;
    const plan = { blocks, links, selectedId, target, updatedAt: new Date().toISOString() };
    localStorage.setItem("sfp-v2", JSON.stringify(plan));
    setCloudStatus("Änderungen werden synchronisiert …");
    const timer = window.setTimeout(() => {
      void saveCloudPlan(plan).then(() => setCloudStatus("Mit Cloud synchronisiert")).catch(error => setCloudStatus(error instanceof Error ? error.message : "Cloud-Synchronisierung fehlgeschlagen"));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [blocks, links, selectedId, target, cloudSession?.user.id, cloudReady, cloudRevision]);

  async function submitAuth(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setAuthBusy(true); setAuthMessage("");
    try {
      if (authMode === "login") {
        const session = await signIn(authEmail.trim(), authPassword); setCloudSession(session); setAuthOpen(false); setAuthPassword(""); setCloudStatus("Anmeldung erfolgreich");
      } else {
        const result = await signUp(authEmail.trim(), authPassword);
        if (result.needsEmailConfirmation) setAuthMessage("Registrierung angelegt. Bitte bestätige zuerst den Link in deiner E-Mail und melde dich danach an.");
        else { setCloudSession(result.session); setAuthOpen(false); setAuthPassword(""); setCloudStatus("Registrierung erfolgreich"); }
      }
    } catch (error) { setAuthMessage(error instanceof Error ? error.message : "Anmeldung fehlgeschlagen."); }
    finally { setAuthBusy(false); }
  }

  function saveLocalPlan() {
    localStorage.setItem("sfp-v2", JSON.stringify({ blocks, links, selectedId, target, updatedAt: new Date().toISOString() }));
    setSaved(true); window.setTimeout(() => setSaved(false), 1800);
    if (cloudSession) { setCloudStatus("Cloud-Speicherung läuft …"); setCloudRevision(v => v + 1); }
  }

  function updateBlock(id: string, patch: Partial<Block>) {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  }
  function addBlock(kind: Kind) {
    const b: Block = {
      id: newId(), kind, title: kind === "node" ? "Ressourcen-Node" : kindInfo[kind].title,
      x: 130 + Math.round(Math.random() * 90), y: 100 + Math.round(Math.random() * 260),
      ...(kind === "node" ? { purity: "normal" as Purity, miner: 1 as MinerTier, clock: 100, belt: 1 as BeltTier } : { count: 1, recipe: kind === "smelter" ? "Eisenbarren" : kind === "constructor" ? "Eisenplatten" : "" })
    };
    setBlocks(prev => [...prev, b]); setSelectedId(b.id); setMobilePanel(true);
  }
  function deleteSelected() {
    if (!selected) return;
    setBlocks(prev => prev.filter(b => b.id !== selected.id));
    setLinks(prev => prev.filter(l => l.from !== selected.id && l.to !== selected.id));
    setSelectedId(blocks.find(b => b.id !== selected.id)?.id ?? "");
  }
  function onPointerDown(e: ReactPointerEvent, block: Block) {
    if ((e.target as HTMLElement).closest("button")) return;
    setSelectedId(block.id);
    dragRef.current = { id: block.id, startX: e.clientX, startY: e.clientY, blockX: block.x, blockY: block.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: ReactPointerEvent) {
    if (!dragRef.current) return;
    const d = dragRef.current;
    updateBlock(d.id, { x: Math.max(10, d.blockX + (e.clientX - d.startX) / zoom), y: Math.max(10, d.blockY + (e.clientY - d.startY) / zoom) });
  }
  function onPointerUp() { dragRef.current = null; }
  function handleConnect(blockId: string) {
    if (!connectMode) { setSelectedId(blockId); return; }
    if (!connectFrom) { setConnectFrom(blockId); setSelectedId(blockId); return; }
    if (connectFrom !== blockId && !links.some(l => l.from === connectFrom && l.to === blockId)) {
      setLinks(prev => [...prev, { id: newId(), from: connectFrom, to: blockId, belt: 3 }]);
    }
    setConnectFrom(null); setConnectMode(false); setSelectedId(blockId);
  }
  function save() { saveLocalPlan(); }
  function exportProject() {
    const blob = new Blob([JSON.stringify({ blocks, links, target }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "satisfactory-factory-plan.json"; a.click(); URL.revokeObjectURL(url);
  }
  function importProject(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { try { const data = JSON.parse(String(reader.result)); if (Array.isArray(data.blocks) && Array.isArray(data.links)) { setBlocks(data.blocks); setLinks(data.links); setTarget(data.target ?? 120); setSelectedId(data.blocks[0]?.id ?? ""); } } catch { alert("Die Datei ist kein gültiger Projekt-Export."); } };
    reader.readAsText(file); e.target.value = "";
  }
  function reset() {
    if (!confirm("Demo-Fabrik zurücksetzen? Nicht exportierte Änderungen gehen verloren.")) return;
    setBlocks(initialBlocks); setLinks(initialLinks); setSelectedId("n1"); setTarget(120); setConnectMode(false); setConnectFrom(null);
  }

  return <div className="app-shell">
    <header className="topbar">
      <div className="logo"><Factory size={21}/></div>
      <div className="brand"><strong>SATISFACTORY <span>PLANNER</span></strong><small>PROTOTYP · V0.2</small></div>
      <div className="top-spacer"/>
      <nav className="view-switch">
        <button className={view === "planner" ? "active" : ""} onClick={() => setView("planner")}><Gauge size={16}/> Planer</button>
        <button className={view === "factory" ? "active" : ""} onClick={() => setView("factory")}><GitBranch size={16}/> Fabrik</button>
        <button className={view === "map" ? "active" : ""} onClick={() => setView("map")}><Map size={16}/> Karte</button>
        <button className={view === "data" ? "active" : ""} onClick={() => setView("data")}><Database size={16}/> Daten</button>
      </nav>
      <button className="icon-btn" title={cloudSession ? cloudSession.user.email ?? "Angemeldet" : "Anmelden / Registrieren"} onClick={() => { if (cloudSession) { signOut(); setCloudSession(null); setCloudReady(false); setCloudStatus("Abgemeldet – lokal gespeichert"); } else { setAuthOpen(true); setAuthMessage(""); } }}>{cloudSession ? <ShieldCheck size={16}/> : <CircleHelp size={16}/>}<span>{cloudSession ? "Abmelden" : "Cloud-Login"}</span></button>
      <button className="save-btn" onClick={save}><Save size={15}/><span>{saved ? "Gespeichert" : "Speichern"}</span></button>
      <button className="icon-btn top-more" title="Projekt exportieren" onClick={exportProject}><Download size={17}/></button>
    </header>

    <main className="app-main">
      <div className="page-head">
        <div><div className="eyebrow">PRODUKTIONSPLANUNG / {view === "factory" ? "FABRIK 01" : view === "map" ? "RESSOURCEN" : view === "planner" ? "REZEPT-ENGINE" : "DATENBANK"}</div><h1>{view === "factory" ? "Fabrikeditor" : view === "map" ? "Ressourcenkarte" : view === "planner" ? "Produktionsoptimierung" : "Spieldaten & Lexikon"}</h1><p>{view === "factory" ? "Ziehe Maschinen an die gewünschte Stelle. Verbinde sie und plane deinen Aufbau." : view === "map" ? "Rohstoff-Nodes und Reinheiten – die echte Karte wird noch angebunden." : view === "planner" ? "Rezepte, alternative Produktionswege, Overclocking und Somersloops in einer Planung vergleichen." : "Automatische Versionsprüfung, Datenqualität und Rezept-Audit."}</p></div>
        <div className="head-actions">
          <label className="import-btn"><Upload size={15}/> Importieren<input type="file" accept="application/json" onChange={importProject}/></label>
          <button className="icon-btn" title="Demo zurücksetzen" onClick={reset}><RotateCcw size={16}/></button>
        </div>
      </div>

      {view === "planner" ? <div className="planner-page">
        <section className="planner-hero panel-card">
          <div className="planner-hero-copy"><div className="eyebrow">REZEPT-ENGINE · LIVE-DATEN</div><h2>Von Rohstoff bis Endprodukt.</h2><p>Die Engine sucht Produktionsketten aus dem geladenen Spieldatensatz. Alternative Rezepte, Flüssigkeiten, Verpackungsschritte, Overclocking und Somersloops können in die Planung einfließen.</p></div>
          <div className={`data-state ${updateState.status}`}><span className="status-dot"/><div><b>{updateState.status === "checking" ? "Datenprüfung läuft" : updateState.status === "updated" ? "Daten aktualisiert" : updateState.status === "current" ? "Daten geladen" : updateState.status === "offline" ? "Offline-Modus" : "Daten nicht verfügbar"}</b><small>{updateState.message}</small></div><button title="Spieldaten aktualisieren" onClick={refreshGameData} disabled={dataBusy}><RefreshCw size={15} className={dataBusy ? "spin" : ""}/></button></div>
        </section>
        <div className="planner-grid">
          <section className="panel-card planner-controls">
            <div className="panel-title"><Gauge size={17}/> Produktionsziel</div>
            <label className="field-label">Produkt suchen</label><input className="field" placeholder="z. B. Computer, Treibstoff …" value={productSearch} onChange={e => setProductSearch(e.target.value)}/>
            <label className="field-label">Endprodukt</label><select className="field" value={activeProductId} onChange={e => setProductId(e.target.value)}>{visibleProducts.map(i => <option key={i.id} value={i.id}>{i.name} · {i.form === "liquid" ? "Flüssigkeit" : i.form === "gas" ? "Gas" : "Feststoff"}</option>)}</select>
            <label className="field-label">Gewünschte Menge pro Minute</label><div className="rate-input"><input className="field" type="number" min="0.1" step="0.1" value={targetRate} onChange={e => setTargetRate(Math.max(0.1, Number(e.target.value) || 0.1))}/><span>/ min</span></div>
            <label className="field-label">Optimierungsziel</label><div className="objective-grid">
              <button className={objective === "balanced" ? "chosen" : ""} onClick={() => setObjective("balanced")}><ShieldCheck size={16}/><b>Beste Kombination</b><small>Ausgewogen</small></button>
              <button className={objective === "power" ? "chosen" : ""} onClick={() => setObjective("power")}><Zap size={16}/><b>Wenig Strom</b><small>MW senken</small></button>
              <button className={objective === "machines" ? "chosen" : ""} onClick={() => setObjective("machines")}><Factory size={16}/><b>Wenig Maschinen</b><small>Gebäude sparen</small></button>
              <button className={objective === "resources" ? "chosen" : ""} onClick={() => setObjective("resources")}><Pickaxe size={16}/><b>Wenig Rohstoffe</b><small>Input senken</small></button>
            </div>
            <label className="field-label">Produktionsstrategie</label><p className="strategy-help">„Max. Output“ bevorzugt derzeit ertragreiche Rezeptwege für die eingestellte Zielmenge. Die echte Maximierung aus begrenzten Nodes, Leitungen und Strom kommt mit dem globalen Solver.</p><div className="segmented strategy-segments"><button className={strategy === "direct" ? "chosen" : ""} onClick={() => setStrategy("direct")}>Direkt</button><button className={strategy === "efficient" ? "chosen" : ""} onClick={() => setStrategy("efficient")}>Effizient</button><button className={strategy === "maximum" ? "chosen" : ""} onClick={() => setStrategy("maximum")}>Max. Output</button></div>
            <label className="field-label">Spiel-Fortschritt</label><select className="field" value={progression} onChange={e => setProgression(e.target.value as Progression)}><option value="early">Früher Spielstand · einfache Aufbauten</option><option value="standard">Normaler Spielstand · ohne SAM-Technik</option><option value="all">Alles freigeschaltet · inklusive SAM</option></select><p className="strategy-help">Standardmäßig werden SAM-basierte Wege vermieden. „Früher Spielstand“ begrenzt zusätzlich Rezepte auf niedrige Tiers, soweit die Spieldaten das angeben.</p>
            <div className="planner-toggle"><div><b>Alternative Rezepte</b><small>Auch komplexe Produktionswege zulassen</small></div><input type="checkbox" checked={allowAlternates} onChange={e => setAllowAlternates(e.target.checked)}/></div>
            <div className="planner-toggle"><div><b>Overclocking</b><small>Maschinen bis zur eingestellten Taktung</small></div><input type="checkbox" checked={allowOverclock} onChange={e => setAllowOverclock(e.target.checked)}/></div>
            {allowOverclock && <><div className="field-line"><label className="field-label">Maximale Taktung</label><strong>{maxClock}%</strong></div><input className="wide-range" type="range" min="100" max="250" step="25" value={maxClock} onChange={e => setMaxClock(Number(e.target.value))}/></>}
            <div className="planner-toggle"><div><b>Somersloops</b><small>Verdoppelte Ausbeute bei unterstützten Maschinen</small></div><input type="checkbox" checked={useSomersloops} onChange={e => setUseSomersloops(e.target.checked)}/></div>
            <button className="primary-button calculate-button" onClick={calculateProduction} disabled={!bundle || !activeProductId}><FlaskConical size={16}/> Produktionskette berechnen</button>
            {!bundle && <p className="inline-warning"><CircleAlert size={14}/> Noch keine Spieldaten verfügbar. Die App versucht beim Start und über „Daten“ erneut zu laden.</p>}
            {planError && <p className="inline-warning"><CircleAlert size={14}/> {planError}</p>}
          </section>
          <section className="panel-card planner-results">
            <div className="panel-title"><GitBranch size={17}/> Produktionskette <span className="panel-title-right">{planResult ? `${planResult.lines.length} Rezeptschritte` : "Bereit zur Berechnung"}</span></div>
            {!planResult ? <div className="planner-empty"><div className="empty-orb"><FlaskConical size={28}/></div><b>Deine Produktionskette erscheint hier</b><p>Wähle ein Zielprodukt, eine Menge und die Optimierung. Der Planer zeigt danach Rezepte, Maschinen, Rohstoffe und erkannte Grenzen.</p></div> : <>
              {planVariants.length > 1 && <div className="variant-picker"><div><b>{planVariants.length} unterschiedliche Produktionswege</b><small>Vollständige Ketten werden bevorzugt; Varianten mit offenen Importen stehen hinten.</small></div><div className="segmented">{planVariants.map((variant, i) => <button key={i} className={selectedVariant === i ? "chosen" : ""} onClick={() => { setSelectedVariant(i); setPlanResult(variant); }}>Variante {i + 1}</button>)}</div></div>}
              <div className="metric-grid"><div><small>Strombedarf</small><strong>{planResult.totals.powerMW.toLocaleString("de-DE")} MW</strong></div><div><small>Maschinen</small><strong>{planResult.totals.machines}</strong></div><div><small>Rohstoffarten</small><strong>{planResult.raw.length}</strong></div><div><small>Somersloops</small><strong>{planResult.totals.somersloops}</strong></div></div>
              <div className="flow-target"><span>ZIELPRODUKT</span><b>{planResult.target.name}</b><strong>{planResult.target.rate} {flowUnit(planResult.target.form)}</strong></div>
              <div className="recipe-list">{planResult.lines.map((line,index) => <article className="recipe-row" key={`${line.recipeId}-${index}`}><div className="recipe-step">{index+1}</div><div className="recipe-main"><b>{line.recipeName}</b><small>{line.machineName} · {line.machineCount} Maschine(n) · {line.clock}%</small><div className="recipe-flows">{line.inputs.map(x => <span key={x.item} className="flow-input">− {x.name} {formatFlow(x)}</span>)}{line.outputs.map(x => <span key={x.item} className="flow-output">+ {x.name} {formatFlow(x)}</span>)}</div></div><div className="recipe-power">{line.powerMW} MW</div></article>)}</div>
              <div className="raw-panel"><b>Benötigte Rohstoffe / Importe</b>{planResult.raw.length ? planResult.raw.map(x => <div className="summary-row" key={x.item}><span>{x.name}</span><b>{formatFlow(x)}</b></div>) : <p className="muted">Keine Rohstoffbedarfe ermittelt.</p>}</div>
              <div className="raw-panel balance-panel"><b>Globale Stoffbilanz</b><p className="muted">Summiert die Ein- und Ausgänge aller berechneten Rezeptzeilen. Überschüsse können Nebenprodukte sein; sie werden in dieser Version noch nicht automatisch als Ersatz für andere Produktionszweige eingesetzt.</p>{planResult.materialBalances.map(x => <div className="summary-row balance-row" key={x.item}><span><i className={`balance-dot ${x.status}`}/>{x.name}<small>{x.form} · rein: {x.inputRate.toLocaleString("de-DE")} {x.form === "Feststoff" ? "Stk/min" : "m³/min"} · raus: {x.outputRate.toLocaleString("de-DE")} {x.form === "Feststoff" ? "Stk/min" : "m³/min"}</small></span><b className={`balance-value ${x.status}`}>{x.status === "target" ? `Ziel ${x.outputRate.toLocaleString("de-DE")} ${x.form === "Feststoff" ? "Stk/min" : "m³/min"}` : x.status === "raw" ? `Rohstoff ${Math.abs(x.netRate).toLocaleString("de-DE")} ${x.form === "Feststoff" ? "Stk/min" : "m³/min"}` : x.status === "surplus" ? `Überschuss +${x.netRate.toLocaleString("de-DE")} ${x.form === "Feststoff" ? "Stk/min" : "m³/min"}` : x.status === "deficit" ? `Fehlmenge ${Math.abs(x.netRate).toLocaleString("de-DE")} ${x.form === "Feststoff" ? "Stk/min" : "m³/min"}` : "Ausgeglichen"}</b></div>)}</div>
              {planResult.warnings.length > 0 && <div className="warning-list"><b><CircleAlert size={14}/> Hinweise zur Berechnung</b>{planResult.warnings.map((w,i) => <p key={i}>{w}</p>)}</div>}
              <details className="limitations"><summary>Rechenmodell und aktuelle Grenzen</summary><ul>{planResult.limitations.map((x,i) => <li key={i}>{x}</li>)}</ul></details>
            </>}
          </section>
        </div>
      </div> : view === "data" ? <div className="data-page">
        <section className="panel-card data-overview"><div><div className="eyebrow">DATENHERKUNFT</div><h2>Spieldaten-Lexikon</h2><p>Prüft beim Start und danach alle sechs Stunden auf neue Spielstände. Neue Daten werden erst übernommen, wenn die Strukturprüfung bestanden wurde. Der letzte gültige Datensatz bleibt offline verfügbar.</p></div><button className="primary-button" onClick={refreshGameData} disabled={dataBusy}><RefreshCw size={15} className={dataBusy ? "spin" : ""}/> Jetzt auf Updates prüfen</button></section>
        <section className="panel-card data-source-card"><div className={`data-state ${updateState.status}`}><span className="status-dot"/><div><b>{updateState.message}</b><small>Quelle: Albis0/ficsit_planner · src/data · GitHub</small></div></div>{bundle && <div className="data-stats"><div><small>Spielversion</small><b>{bundle.meta.gameVersion}</b></div><div><small>Build</small><b>{bundle.meta.changelist}</b></div><div><small>Datensatz vom</small><b>{bundle.meta.extractedAt ?? "unbekannt"}</b></div><div><small>Zuletzt geprüft</small><b>{new Date(bundle.checkedAt).toLocaleString("de-DE")}</b></div></div>}</section>
        {bundle && (() => { const audit = recipeAudit(bundle.gameData); return <><section className="data-stats-grid"><div className="panel-card"><small>Rezepte</small><strong>{audit.recipes}</strong><span>{audit.alternates} alternative Rezepte</span></div><div className="panel-card"><small>Items</small><strong>{audit.items}</strong><span>{audit.fluidRecipes} Rezepte mit Flüssigkeiten/Gasen</span></div><div className="panel-card"><small>Gebäude</small><strong>{audit.machines}</strong><span>Maschinendaten geladen</span></div><div className="panel-card"><small>Audit</small><strong>{audit.errors} Fehler</strong><span>{audit.warnings} Warnungen gefunden</span></div></section><section className="panel-card audit-panel"><div className="panel-title"><ShieldCheck size={17}/> Rezept-Audit <span className="panel-title-right">{audit.errors === 0 ? "Strukturprüfung bestanden" : "Prüfung erforderlich"}</span></div><div className="audit-summary"><span><Check size={15}/> {audit.recipes} Rezepte geprüft</span><span><Droplets size={15}/> {audit.packaged} Verpackungs-/Entpackungs-Kandidaten</span><span><CircleAlert size={15}/> {audit.loops} Rezepte mit Ein-/Ausgangsüberschneidung</span></div>{audit.issues.length === 0 ? <p className="success-note">Keine strukturellen Fehler in den geprüften Rezeptreferenzen gefunden. Das bestätigt die Datenstruktur, nicht jede einzelne Spielmechanik.</p> : <div className="audit-issues">{audit.issues.slice(0,80).map((issue,i) => <p className={issue.level} key={i}>{issue.level === "error" ? "FEHLER" : "WARNUNG"} · {issue.text}</p>)}</div>}</section></>; })()}
        <section className="panel-card data-notes"><div className="panel-title"><CircleHelp size={17}/> Was wird automatisch aktualisiert?</div><ul><li>Rezepte, alternative Rezepte, Items und Produktionsmaschinen aus dem versionierten Datensatz.</li><li>Förderbänder, Rohrleitungen und Rohstoffknoten werden als separate Datenbereiche behandelt.</li><li>Somersloop-Slots und Overclock-Regeln werden nur dann als exakt behandelt, wenn sie im Datensatz bzw. in geprüften Spielregeln vorhanden sind.</li><li>Die erste Version lädt Weltknotendaten mit; die vollständige echte Karte ist noch nicht in den Editor integriert.</li></ul><p className="muted">Quelle: <a href="https://github.com/Albis0/ficsit_planner" target="_blank" rel="noreferrer">Ficsit Planner Daten-Repository</a>. Community-Daten können zeitversetzt zum neuesten Spielpatch sein; die angezeigte Buildnummer wird daher immer mitgeführt.</p></section>
      </div> : view === "factory" ? <div className="factory-layout">
        <aside className="tool-rail">
          <div className="rail-title">HINZUFÜGEN</div>
          <button onClick={() => addBlock("node")}><span className="tool-icon amber"><Pickaxe size={18}/></span><span><b>Node</b><small>Rohstoffquelle</small></span><Plus size={15}/></button>
          <button onClick={() => addBlock("smelter")}><span className="tool-icon orange"><Factory size={18}/></span><span><b>Schmelzofen</b><small>Erz zu Barren</small></span><Plus size={15}/></button>
          <button onClick={() => addBlock("constructor")}><span className="tool-icon blue"><Hammer size={18}/></span><span><b>Konstruktor</b><small>Einfache Bauteile</small></span><Plus size={15}/></button>
          <button onClick={() => addBlock("assembler")}><span className="tool-icon violet"><Layers size={18}/></span><span><b>Assembler</b><small>Mehrere Zutaten</small></span><Plus size={15}/></button>
          <button onClick={() => addBlock("storage")}><span className="tool-icon slate"><Boxes size={18}/></span><span><b>Lager</b><small>Zwischenlager</small></span><Plus size={15}/></button>
          <div className="rail-divider"/>
          <button className={connectMode ? "connect-active" : ""} onClick={() => { setConnectMode(!connectMode); setConnectFrom(null); }}><span className="tool-icon green"><Cable size={18}/></span><span><b>{connectMode ? "Verbinden aktiv" : "Verbinden"}</b><small>{connectMode ? "Erst Quelle, dann Ziel" : "Förderband zeichnen"}</small></span></button>
          {connectMode && <div className="connect-tip"><MousePointer2 size={14}/> {connectFrom ? "Jetzt Zielmaschine anklicken" : "Quellmaschine anklicken"}</div>}
          <div className="rail-bottom"><CircleHelp size={15}/><span>Element anklicken für Einstellungen. Ziehen zum Verschieben.</span></div>
        </aside>

        <section className="canvas-wrap">
          <div className="canvas-toolbar">
            <div className="canvas-breadcrumb"><span className="crumb-dot"/> Fabrik 01 <ChevronDown size={13}/><span className="canvas-divider"/> <span>{blocks.length} Elemente</span></div>
            <div className="canvas-tools"><button title="Verbindungen" className={connectMode ? "tool-on" : ""} onClick={() => {setConnectMode(!connectMode);setConnectFrom(null)}}><Cable size={16}/></button><button title="Zoom verkleinern" onClick={() => setZoom(z => Math.max(.7, +(z-.1).toFixed(1)))}>−</button><span>{Math.round(zoom*100)}%</span><button title="Zoom vergrößern" onClick={() => setZoom(z => Math.min(1.3, +(z+.1).toFixed(1)))}>+</button></div>
          </div>
          <div className="canvas-viewport" ref={canvasRef} onWheel={e => {
            e.preventDefault();
            const viewport = canvasRef.current;
            if (!viewport) return;
            const rect = viewport.getBoundingClientRect();
            const px = e.clientX - rect.left + viewport.scrollLeft;
            const py = e.clientY - rect.top + viewport.scrollTop;
            const oldZoom = zoom;
            const nextZoom = Math.max(.25, Math.min(2.5, +(oldZoom * (e.deltaY < 0 ? 1.1 : 1/1.1)).toFixed(3)));
            if (nextZoom === oldZoom) return;
            setZoom(nextZoom);
            requestAnimationFrame(() => {
              viewport.scrollLeft = px * (nextZoom / oldZoom) - (e.clientX - rect.left);
              viewport.scrollTop = py * (nextZoom / oldZoom) - (e.clientY - rect.top);
            });
          }} title="Mausrad: Zoom am Mauszeiger">
            <div className="canvas" style={{ transform: `scale(${zoom})`, transformOrigin: "top left", minWidth: `${100/zoom}%`, minHeight: `${100/zoom}%` }} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
              <svg className="wires" width="1800" height="1000" aria-label="Förderband-Verbindungen">
                <defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#d69a2d"/></marker></defs>
                {linkPaths.map(path => path && <g key={path.id}>
                  <path d={path.d} fill="none" stroke="#0a1118" strokeWidth="8" strokeLinecap="round"/>
                  <path d={path.d} fill="none" stroke="#d69a2d" strokeWidth="3" strokeLinecap="round" markerEnd="url(#arrow)"/>
                  <g transform={`translate(${path.labelX},${path.labelY})`}><rect x="-34" y="-10" width="68" height="19" rx="5" fill="#202b35" stroke="#4b5965"/><text textAnchor="middle" y="3" fill="#f2d49b" fontSize="9">Mk.{path.belt} · {beltCapacity[path.belt]}</text></g>
                </g>)}
              </svg>
              {blocks.map(block => {
                const active = block.id === selectedId;
                const calc = block.kind === "node" ? nodeRate(block.purity ?? "normal", block.miner ?? 1, block.clock ?? 100, block.belt ?? 1) : null;
                return <div key={block.id} className={`machine ${kindInfo[block.kind].color} ${active ? "selected" : ""} ${connectFrom === block.id ? "connect-source" : ""}`} style={{ left: block.x, top: block.y }} onPointerDown={e => onPointerDown(e, block)} onClick={() => handleConnect(block.id)}>
                  <div className="machine-head"><span className={`machine-icon ${kindInfo[block.kind].color}`}><BlockIcon kind={block.kind}/></span><span className="machine-title"><b>{block.title}</b><small>{kindInfo[block.kind].subtitle}</small></span><button className="machine-menu" title="Auswählen" onClick={e => {e.stopPropagation();setSelectedId(block.id);setMobilePanel(true)}}><MoreHorizontal size={16}/></button></div>
                  <div className="machine-body">
                    {block.kind === "node" ? <><div className="machine-stat"><span>{purityLabel[block.purity ?? "normal"]} · Miner Mk.{block.miner ?? 1}</span><strong>{calc?.effectiveRate.toLocaleString("de-DE",{maximumFractionDigits:1})}/min</strong></div><div className="mini-bar"><span style={{width:`${Math.min(100,(calc?.effectiveRate ?? 0)/Math.max(1,calc?.minerRate ?? 1)*100)}%`}}/></div></> :
                      <><div className="machine-stat"><span>{block.recipe || "Rezept auswählen"}</span><strong>× {block.count ?? 1}</strong></div><div className="machine-output"><Activity size={13}/> Produktionsmodul</div></>}
                  </div>
                  <div className="ports"><span className="port input" title="Eingang"/><span className="port output" title="Ausgang"/></div>
                </div>;
              })}
              {blocks.length === 0 && <div className="empty-canvas"><Factory size={34}/><b>Deine Fabrik beginnt hier</b><span>Füge links einen Node oder eine Maschine hinzu.</span></div>}
            </div>
          </div>
          <div className="canvas-status"><span><span className="status-dot"/> Berechnung aktiv</span><span><Cable size={13}/> {links.length} Verbindungen</span><span>Autospeichern: manuell</span></div>
        </section>

        <aside className={`inspector ${mobilePanel ? "mobile-open" : ""}`}>
          <div className="inspector-head"><div><span className="eyebrow">EIGENSCHAFTEN</span><h2>{selected?.title ?? "Nichts ausgewählt"}</h2></div><button className="icon-btn close-inspector" onClick={() => setMobilePanel(false)}><X size={17}/></button></div>
          {!selected ? <div className="inspector-empty">Wähle ein Element auf der Arbeitsfläche aus.</div> : <>
            <label className="field-label">Name</label><input className="field" value={selected.title} onChange={e => updateBlock(selected.id,{title:e.target.value})}/>
            {selected.kind === "node" ? <>
              <label className="field-label">Ressource</label><select className="field" defaultValue="iron"><option value="iron">Eisenerz</option><option value="copper">Kupfererz</option><option value="limestone">Kalkstein</option><option value="coal">Kohle</option><option value="caterium">Caterium</option></select>
              <label className="field-label">Node-Reinheit</label><div className="segmented">{(["impure","normal","pure"] as Purity[]).map(p => <button key={p} className={selected.purity === p ? "chosen" : ""} onClick={() => updateBlock(selected.id,{purity:p})}>{purityLabel[p]}</button>)}</div>
              <label className="field-label">Miner-Stufe</label><div className="segmented">{([1,2,3] as MinerTier[]).map(m => <button key={m} className={selected.miner === m ? "chosen" : ""} onClick={() => updateBlock(selected.id,{miner:m})}>Mk.{m}</button>)}</div>
              <div className="field-line"><label className="field-label">Übertaktung</label><strong>{selected.clock ?? 100}%</strong></div><input type="range" min="1" max="250" value={selected.clock ?? 100} onChange={e => updateBlock(selected.id,{clock:Number(e.target.value)})}/>
              <label className="field-label">Förderband am Node</label><select className="field" value={selected.belt ?? 1} onChange={e => updateBlock(selected.id,{belt:Number(e.target.value) as BeltTier})}>{([1,2,3,4,5,6] as BeltTier[]).map(t => <option key={t} value={t}>{beltLabel(t)}</option>)}</select>
              {(() => { const r = nodeRate(selected.purity ?? "normal",selected.miner ?? 1,selected.clock ?? 100,selected.belt ?? 1); return <div className="inspector-metric"><span>Effektiver Durchsatz</span><strong>{r.effectiveRate.toLocaleString("de-DE",{maximumFractionDigits:1})}<small> / min</small></strong><p>{r.minerRate > r.beltRate ? "Förderband ist der Engpass." : "Miner begrenzt den Durchsatz."}</p></div>; })()}
            </> : <>
              <label className="field-label">Rezept</label><select className="field" value={selected.recipe ?? ""} onChange={e => updateBlock(selected.id,{recipe:e.target.value})}><option value="">Rezept auswählen</option><option>Eisenbarren</option><option>Kupferbarren</option><option>Eisenplatten</option><option>Eisenstangen</option><option>Schrauben</option><option>Beton</option></select>
              <label className="field-label">Maschinenanzahl</label><div className="stepper"><button onClick={() => updateBlock(selected.id,{count:Math.max(1,(selected.count ?? 1)-1)})}>−</button><strong>{selected.count ?? 1}</strong><button onClick={() => updateBlock(selected.id,{count:Math.min(100,(selected.count ?? 1)+1)})}>+</button></div>
              <div className="inspector-metric"><span>Planungsstatus</span><strong className="status-text">Manuell</strong><p>Rezeptgraph und exakte Maschinen-Taktung folgen im nächsten Entwicklungsschritt.</p></div>
            </>}
            <div className="inspector-section"><span className="field-label">Verbindungen</span>{links.filter(l => l.from === selected.id || l.to === selected.id).length === 0 ? <p className="muted">Noch nicht verbunden.</p> : links.filter(l => l.from === selected.id || l.to === selected.id).map(l => <div className="connection-row" key={l.id}><Cable size={14}/><span>{blocks.find(b => b.id === (l.from === selected.id ? l.to : l.from))?.title ?? "Element"} <small>{l.from === selected.id ? "Ausgang" : "Eingang"} · {beltLabel(l.belt)}</small></span><button title="Verbindung löschen" onClick={() => setLinks(prev => prev.filter(x => x.id !== l.id))}><X size={14}/></button></div>)}</div>
            <div className="inspector-actions"><button className="danger-button" onClick={deleteSelected}><Trash2 size={15}/> Element löschen</button><button className="primary-button" onClick={() => setMobilePanel(false)}><Check size={15}/> Fertig</button></div>
          </>}
        </aside>
      </div> : <div className="map-view">
        {(() => {
          const world = (bundle?.worldData ?? {}) as { size?: number; nodes?: Array<{kind?: string; item?: string; purity?: number; x?: number; y?: number}>; wells?: Array<{item?: string; x?: number; y?: number}> };
          const worldSize = world.size || 8192;
          const nodes = (world.nodes ?? []).filter(n => Number.isFinite(n.x) && Number.isFinite(n.y));
          const resourceNames: Record<string,string> = {
            Desc_OreIron_C:"Eisenerz", Desc_OreCopper_C:"Kupfererz", Desc_Stone_C:"Kalkstein", Desc_Coal_C:"Kohle", Desc_OreGold_C:"Caterium", Desc_OreBauxite_C:"Bauxit", Desc_OreUranium_C:"Uranerz", Desc_RawQuartz_C:"Rohquarz", Desc_Sulfur_C:"Schwefel", Desc_SAM_C:"SAM-Erz", Desc_LiquidOil_C:"Rohöl", Desc_Water_C:"Wasser", Desc_NitrogenGas_C:"Stickstoff" };
          const resources = [...new Set(nodes.map(n => n.item ?? "Unbekannt"))].sort((a,b) => (resourceNames[a] ?? a).localeCompare(resourceNames[b] ?? b,"de"));
          const filtered = nodes.filter(n => (mapResource === "all" || n.item === mapResource) && (mapPurity === "all" || String(n.purity ?? 1) === mapPurity));
          const tileZoom = 3;
          return <>
            <div className="map-stage real-map-stage">
              <div className="map-tile-plane">{Array.from({length:64},(_,i) => <img key={i} alt="" draggable={false} src={`https://raw.githubusercontent.com/Albis0/ficsit_planner/main/public/map/${tileZoom}/${i%8}/${Math.floor(i/8)}.webp`} onError={e => { (e.currentTarget as HTMLImageElement).style.visibility="hidden"; }}/>)}</div>
              {filtered.map((n,i) => <button key={`${n.item}-${n.x}-${n.y}-${i}`} title={`${resourceNames[n.item ?? ""] ?? n.item ?? "Ressource"} · ${{0:"Unrein",1:"Normal",2:"Rein"}[n.purity ?? 1] ?? "Normal"}`} className={`world-node purity-${n.purity ?? 1}`} style={{left:`${(n.x ?? 0)/worldSize*100}%`,top:`${(n.y ?? 0)/worldSize*100}%`}} onClick={() => { setMapResource(n.item ?? "all"); }}><span/></button>)}
              {!bundle?.worldData && <div className="map-no-data"><Database size={22}/><b>Weltkartendaten werden geladen</b><span>Öffne „Daten“ und aktualisiere die Spieldaten, falls die Karte leer bleibt.</span></div>}
              {Boolean(bundle?.worldData) && nodes.length === 0 && <div className="map-no-data"><CircleAlert size={22}/><b>Keine Weltknoten gefunden</b><span>Das geladene world.json hat nicht das erwartete Format.</span></div>}
              <div className="map-legend"><span/> Unrein <i/> Normal <b/> Rein</div>
            </div>
            <aside className="map-side"><div className="panel-title"><Map size={17}/> Ressourcenkarte</div><p>Reale Spielkoordinaten aus den geladenen Weltkartendaten. Wähle eine Ressource und Reinheit, um die Marker einzugrenzen.</p>
              <label className="field-label">Rohstoff</label><select className="field" value={mapResource} onChange={e => setMapResource(e.target.value)}><option value="all">Alle Rohstoffe</option>{resources.map(r => <option key={r} value={r}>{resourceNames[r] ?? r}</option>)}</select>
              <label className="field-label">Reinheit</label><select className="field" value={mapPurity} onChange={e => setMapPurity(e.target.value)}><option value="all">Alle Reinheiten</option><option value="0">Unrein</option><option value="1">Normal</option><option value="2">Rein</option></select>
              <div className="summary-row"><span>Ressourcenpunkte</span><b>{filtered.length.toLocaleString("de-DE")}</b></div><div className="summary-row"><span>Alle Weltknoten</span><b>{nodes.length.toLocaleString("de-DE")}</b></div><div className="summary-row"><span>Nodes im Plan</span><b>{blocks.filter(b => b.kind === "node").length}</b></div><button className="primary-button full" onClick={() => setView("factory")}>Zur Fabrikplanung <ArrowDownUp size={15}/></button>
            </aside>
          </>;
        })()}
      </div>}

      <footer className="footer"><span>SATISFACTORY FACTORY PLANNER · V0.9</span><span>{cloudStatus} · {bundle ? `Spieldaten ${bundle.meta.gameVersion} · Build ${bundle.meta.changelist}` : "Spieldaten werden geprüft"}</span></footer>
    </main>
    {selected && <button className="mobile-properties" onClick={() => setMobilePanel(true)}><Settings2 size={16}/> Eigenschaften: {selected.title}</button>}
    {authOpen && <div role="presentation" onClick={e => { if (e.target === e.currentTarget) setAuthOpen(false); }} style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(2,8,14,.78)",display:"grid",placeItems:"center",padding:16}}>
      <form onSubmit={submitAuth} style={{width:"min(100%,430px)",background:"#111c27",color:"#eef4f8",border:"1px solid #344657",borderRadius:16,padding:24,boxShadow:"0 24px 80px #0009"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}><div><div style={{fontSize:11,letterSpacing:2,color:"#d8a344",fontWeight:800}}>SATISFACTORY PLANNER</div><h2 style={{margin:"8px 0 4px"}}>{authMode === "login" ? "Bei deinem Planner anmelden" : "Konto erstellen"}</h2></div><button type="button" className="icon-btn" onClick={() => setAuthOpen(false)} aria-label="Schließen"><X size={17}/></button></div>
        <p style={{color:"#aab9c6",fontSize:13,lineHeight:1.5}}>Melde dich an, um deinen Bauplan zwischen PC und Handy zu synchronisieren. Deine Planung bleibt zusätzlich lokal gespeichert.</p>
        {!cloudConfigured && <p style={{background:"#422f18",padding:10,borderRadius:8,fontSize:13}}>Cloud-Zugangsdaten fehlen noch. Lege im Projekt eine .env.local mit VITE_SUPABASE_URL und VITE_SUPABASE_PUBLISHABLE_KEY an und starte Vite neu.</p>}
        <label style={{display:"block",fontSize:12,margin:"14px 0 6px"}}>E-Mail</label><input required type="email" autoComplete="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} style={{width:"100%",boxSizing:"border-box",padding:12,borderRadius:8,border:"1px solid #405365",background:"#0b131b",color:"white"}} />
        <label style={{display:"block",fontSize:12,margin:"14px 0 6px"}}>Passwort (mindestens 6 Zeichen)</label><input required minLength={6} type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} value={authPassword} onChange={e => setAuthPassword(e.target.value)} style={{width:"100%",boxSizing:"border-box",padding:12,borderRadius:8,border:"1px solid #405365",background:"#0b131b",color:"white"}} />
        {authMessage && <p role="alert" style={{fontSize:13,color:"#ffc27a",lineHeight:1.5}}>{authMessage}</p>}
        <button disabled={authBusy || !cloudConfigured} className="primary-button full" style={{marginTop:18,justifyContent:"center",opacity:authBusy || !cloudConfigured ? .55 : 1}}>{authBusy ? "Bitte warten …" : authMode === "login" ? "Anmelden" : "Konto erstellen"}</button>
        <button type="button" onClick={() => {setAuthMode(authMode === "login" ? "register" : "login");setAuthMessage("");}} style={{marginTop:12,width:"100%",background:"transparent",border:0,color:"#e5b75e",cursor:"pointer",padding:8}}>{authMode === "login" ? "Noch kein Konto? Registrieren" : "Schon registriert? Anmelden"}</button>
      </form>
    </div>}
  </div>;
}
