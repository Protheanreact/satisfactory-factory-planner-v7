import type { DataBundle, GameData, GameItem, GameRecipe, Stack } from "./gameData";

export type Objective = "balanced" | "power" | "machines" | "resources";
export type Strategy = "direct" | "efficient" | "maximum";
export type Progression = "early" | "standard" | "all";
export type SolverOptions = { objective: Objective; strategy: Strategy; allowAlternates: boolean; allowOverclock: boolean; maxClock: number; useSomersloops: boolean; progression?: Progression; maxDepth?: number; variantIndex?: number };
export type Flow = { item: string; name: string; rate: number; form: string };
export type RecipeLine = { recipeId: string; recipeName: string; kind: string; machineName: string; machineCount: number; clock: number; powerMW: number; somersloops: number; inputs: Flow[]; outputs: Flow[] };
export type MaterialBalance = { item: string; name: string; form: string; inputRate: number; outputRate: number; netRate: number; status: "target" | "raw" | "balanced" | "surplus" | "deficit" } ;
export type PlanResult = { target: Flow; lines: RecipeLine[]; raw: Flow[]; materialBalances: MaterialBalance[]; totals: { powerMW: number; machines: number; rawUnitsPerMin: number; recipeSteps: number; somersloops: number; shards: number }; warnings: string[]; score: number; objective: Objective; strategy: Strategy; limitations: string[] };
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const keySort = (a: Record<string, number>) => Object.entries(a).filter(([,v]) => v > 1e-5).sort(([a],[b]) => a.localeCompare(b));
function normalizedForm(value: unknown): string {
  const form = String(value ?? "solid").toLowerCase();
  if (form.includes("gas")) return "Gas";
  if (form.includes("liquid") || form.includes("fluid")) return "Flüssigkeit";
  return "Feststoff";
}
type Candidate = { lines: RecipeLine[]; raw: Record<string, number>; power: number; machines: number; sloops: number; shards: number; steps: number; warnings: string[]; score: number };

export function recipeAudit(data: GameData) {
  const issues: Array<{ level: "error" | "warning"; text: string }> = [];
  const itemIds = new Set(Object.keys(data.items));
  let alternates = 0, fluidRecipes = 0, packaged = 0, loops = 0;
  for (const r of data.recipes) {
    if (r.kind === "alternate") alternates++;
    const all = [...(r.inputs ?? []), ...(r.outputs ?? [])];
    if (all.some(s => !itemIds.has(s.item))) issues.push({ level: "error", text: `${r.name}: unbekannte Item-ID in Ein-/Ausgängen.` });
    if (!r.machine || !data.machines[r.machine]) issues.push({ level: "warning", text: `${r.name}: Maschinendaten für ${r.machine || "unbekannt"} fehlen.` });
    if (!Number.isFinite(r.duration) || r.duration <= 0) issues.push({ level: "error", text: `${r.name}: ungültige Produktionszeit.` });
    if (all.some(s => (data.items[s.item]?.form ?? "solid") !== "solid")) fluidRecipes++;
    if (/packag|unpack/i.test(r.name) || all.some(s => /package|canister|container/i.test(data.items[s.item]?.name ?? ""))) packaged++;
    const inputs = new Set(r.inputs.map(s => s.item));
    if (r.outputs.some(s => inputs.has(s.item))) loops++;
  }
  const missingNames = Object.values(data.items).filter(i => !i.name).length;
  if (missingNames) issues.push({ level: "warning", text: `${missingNames} Items haben keinen Anzeigenamen.` });
  return { recipes: data.recipes.length, items: itemIds.size, machines: Object.keys(data.machines).length, alternates, fluidRecipes, packaged, loops, errors: issues.filter(i => i.level === "error").length, warnings: issues.filter(i => i.level === "warning").length, issues };
}

function scoreMetrics(power: number, machines: number, raw: number, steps: number, objective: Objective): number {
  // Log compression prevents one large-number metric from drowning out the others.
  const c = { power: Math.log1p(Math.max(0,power)), machines: Math.log1p(Math.max(0,machines)), resources: Math.log1p(Math.max(0,raw)), logistics: Math.log1p(Math.max(0,steps)) };
  if (objective === "power") return c.power;
  if (objective === "machines") return c.machines;
  if (objective === "resources") return c.resources;
  return c.power * .25 + c.machines * .25 + c.resources * .25 + c.logistics * .25;
}
function flowFor(s: Stack, data: GameData, rate: number): Flow {
  const item: GameItem | undefined = data.items[s.item];
  return { item: s.item, name: item?.name ?? s.item, rate: round(rate), form: normalizedForm(item?.form) };
}
function mergeRaw(into: Record<string, number>, from: Record<string, number>) { for (const [id, rate] of Object.entries(from)) into[id] = (into[id] ?? 0) + rate; }
function sumRaw(raw: Record<string, number>) { return Object.values(raw).reduce((a,b) => a+b, 0); }
export function analyzeMaterialBalances(lines: RecipeLine[], data: GameData, targetId: string): MaterialBalance[] {
  const totals = new Map<string, { input: number; output: number }>();
  for (const line of lines) {
    for (const flow of line.inputs) {
      const row = totals.get(flow.item) ?? { input: 0, output: 0 };
      row.input += flow.rate;
      totals.set(flow.item, row);
    }
    for (const flow of line.outputs) {
      const row = totals.get(flow.item) ?? { input: 0, output: 0 };
      row.output += flow.rate;
      totals.set(flow.item, row);
    }
  }
  return [...totals.entries()].map(([itemId, amounts]) => {
    const item = data.items[itemId];
    const inputRate = round(amounts.input);
    const outputRate = round(amounts.output);
    const netRate = round(outputRate - inputRate);
    let status: MaterialBalance["status"];
    if (itemId === targetId) status = "target";
    else if (item?.raw) status = "raw";
    else if (netRate > 0.01) status = "surplus";
    else if (netRate < -0.01) status = "deficit";
    else status = "balanced";
    return { item: itemId, name: item?.name ?? itemId, form: normalizedForm(item?.form), inputRate, outputRate, netRate, status };
  }).sort((a,b) => {
    const order: Record<MaterialBalance["status"], number> = { target: 0, deficit: 1, surplus: 2, raw: 3, balanced: 4 };
    return order[a.status] - order[b.status] || a.name.localeCompare(b.name, "de");
  });
}

/** Packaging is a transport convenience in Satisfactory, not a production route.
 * Since this planner assumes direct belts/pipes/trains, packaging recipes are only
 * allowed when the requested item itself is a packaged product. */
function isPackagedItem(itemId: string, data: GameData): boolean {
  const item = data.items[itemId];
  return /packag|canister|container/i.test(`${itemId} ${item?.name ?? ""}`);
}

function isPackagingRecipe(recipe: GameRecipe, data: GameData): boolean {
  const itemText = [...recipe.inputs, ...recipe.outputs]
    .map(stack => `${stack.item} ${data.items[stack.item]?.name ?? ""}`)
    .join(" ");
  return /packag|unpack|canister|container/i.test(`${recipe.name} ${itemText}`);
}

/** Stable dependency ordering: producers before consumers, with original order
 * preserved whenever two steps are independent. */
function orderLinesByDependencies(lines: RecipeLine[]): RecipeLine[] {
  const edges = lines.map(() => new Set<number>());
  const indegree = lines.map(() => 0);
  for (let producer = 0; producer < lines.length; producer++) {
    const produced = new Set(lines[producer].outputs.map(flow => flow.item));
    for (let consumer = 0; consumer < lines.length; consumer++) {
      if (producer === consumer) continue;
      if (lines[consumer].inputs.some(flow => produced.has(flow.item)) && !edges[producer].has(consumer)) {
        edges[producer].add(consumer);
        indegree[consumer]++;
      }
    }
  }
  const ready = lines.map((_, i) => i).filter(i => indegree[i] === 0);
  const ordered: RecipeLine[] = [];
  while (ready.length) {
    const index = ready.shift()!;
    ordered.push(lines[index]);
    for (const next of edges[index]) {
      indegree[next]--;
      if (indegree[next] === 0) {
        // Insert in original-index order to keep unrelated branches stable.
        const position = ready.findIndex(existing => existing > next);
        if (position < 0) ready.push(next); else ready.splice(position, 0, next);
      }
    }
  }
  // A cyclic/co-product graph may have no complete topological ordering. Preserve
  // the remaining original order instead of dropping any production steps.
  if (ordered.length < lines.length) {
    const included = new Set(ordered);
    for (const line of lines) if (!included.has(line)) ordered.push(line);
  }
  return ordered;
}

function mergeLines(lines: RecipeLine[]): RecipeLine[] {
  const grouped = new Map<string, RecipeLine>();
  for (const line of lines) {
    const key = `${line.recipeId}|${line.clock}|${line.machineName}|${line.somersloops}`;
    const prior = grouped.get(key);
    if (!prior) grouped.set(key, { ...line, inputs: line.inputs.map(x => ({...x})), outputs: line.outputs.map(x => ({...x})) });
    else {
      prior.machineCount += line.machineCount; prior.powerMW = round(prior.powerMW + line.powerMW);
      for (const x of line.inputs) { const p = prior.inputs.find(y => y.item === x.item); if (p) p.rate = round(p.rate+x.rate); else prior.inputs.push({...x}); }
      for (const x of line.outputs) { const p = prior.outputs.find(y => y.item === x.item); if (p) p.rate = round(p.rate+x.rate); else prior.outputs.push({...x}); }
    }
  }
  return [...grouped.values()];
}

export function planProduction(bundle: DataBundle, targetId: string, targetRate: number, options: SolverOptions): PlanResult {
  const data = bundle.gameData;
  const targetItem = data.items[targetId];
  if (!targetItem) throw new Error("Das ausgewählte Produkt ist nicht im Datensatz vorhanden.");
  if (!Number.isFinite(targetRate) || targetRate <= 0) throw new Error("Die Zielrate muss größer als 0 sein.");
  const recipesByOutput = new Map<string, GameRecipe[]>();
  for (const r of data.recipes) for (const o of r.outputs) {
    const arr = recipesByOutput.get(o.item) ?? []; arr.push(r); recipesByOutput.set(o.item, arr);
  }
  const warnings = new Set<string>();
  const progression = options.progression ?? "standard";
  const limits = options.maxDepth ?? 18;
  const isSamRelated = (text: string) => /reanimated.?sam|sam.?ore|sam.?fluctuator|sam.?reanimated|\bsam\b/i.test(text);
  const recipeAllowedForProgression = (recipe: GameRecipe) => {
    const involved = [...recipe.inputs, ...recipe.outputs].map(x => data.items[x.item]?.name ?? x.item).join(" ") + " " + recipe.name;
    if (progression !== "all" && isSamRelated(involved)) return false;
    if (progression === "early" && typeof recipe.tier === "number" && recipe.tier > 4) return false;
    if (progression === "standard" && typeof recipe.tier === "number" && recipe.tier > 6) return false;
    return true;
  };
  const importPenalty = (raw: Record<string, number>) => Object.entries(raw).reduce((sum, [id, rate]) => {
    // True mineable raw resources are expected leaves; manufactured items left as imports
    // indicate an incomplete graph and should rank behind fully resolved chains.
    return sum + (data.items[id]?.raw ? 0 : 1000 + Math.max(0, rate) * 100);
  }, 0);
  const maxClock = options.allowOverclock ? Math.min(2.5, Math.max(1, options.maxClock / 100)) : 1;
  // Hard global budget prevents alternate-recipe branching from freezing the UI on large datasets.
  // A recipe-search state is one item/recipe decision, not one millisecond of CPU time.
  const maxSearchStates = options.allowAlternates ? 1800 : 900;
  const maxCandidatesPerInput = options.allowAlternates ? 5 : 3;
  const maxChildCandidates = 3;
  const maxCombinations = 6;
  let searchStates = 0;
  let searchBudgetExhausted = false;
  const build = (itemId: string, rateNeeded: number, path: string[], depth: number): Candidate[] => {
    searchStates++;
    if (searchStates > maxSearchStates) {
      searchBudgetExhausted = true;
      const item = data.items[itemId];
      return [{ lines: [], raw: { [itemId]: rateNeeded }, power: 0, machines: 0, sloops: 0, shards: 0, steps: 0, warnings: [`Suchbudget erreicht (${maxSearchStates} Zustände); ${item?.name ?? itemId} wurde als ungelöster Bedarf ausgewiesen. Bitte Zielrate reduzieren oder Alternativen vorübergehend begrenzen.`], score: scoreMetrics(0,0,rateNeeded,0,options.objective) }];
    }
    if (rateNeeded <= 1e-5) return [{ lines: [], raw: {}, power: 0, machines: 0, sloops: 0, shards: 0, steps: 0, warnings: [], score: 0 }];
    const item = data.items[itemId];
    const requestedItemIsPackaged = isPackagedItem(itemId, data);
    const possibleRecipes = (recipesByOutput.get(itemId) ?? []).filter(r =>
      (options.allowAlternates || r.kind !== "alternate") &&
      r.kind !== "power" &&
      recipeAllowedForProgression(r) &&
      r.outputs.some(o => o.item === itemId && o.rate > 0) &&
      // Ignore package/unpackage detours for ordinary fluids and solids. A recipe
      // producing a packaged item remains available when that packaged item is the
      // actual requested dependency (for example, when the user targets it directly).
      (!isPackagingRecipe(r, data) || requestedItemIsPackaged)
    );
    // Raw resources are leaves only when the dataset contains no recipe that can produce them.
    // This matters for liquid/package conversions and datasets that classify an item as raw while
    // also providing a recipe path for it.
    if (item?.raw && possibleRecipes.length === 0) {
      return [{ lines: [], raw: { [itemId]: rateNeeded }, power: 0, machines: 0, sloops: 0, shards: 0, steps: 0, warnings: [], score: scoreMetrics(0,0,rateNeeded,0,options.objective) }];
    }
    if (!item || depth >= limits || path.includes(itemId)) {
      const warning = !item ? `Fehlender Datensatz für ${itemId}; als Import ausgewiesen.` : depth >= limits ? `Rekursionstiefe bei ${item.name} erreicht; als Rohstoff/Import ausgewiesen.` : `Produktionszyklus bei ${item.name} erkannt; nicht endlos weiter aufgelöst.`;
      return [{ lines: [], raw: { [itemId]: rateNeeded }, power: 0, machines: 0, sloops: 0, shards: 0, steps: 0, warnings: [warning], score: scoreMetrics(0,0,rateNeeded,0,options.objective) }];
    }
    let recipes = possibleRecipes;
    if (options.strategy === "direct") recipes = recipes.sort((a,b) => Number(a.kind === "alternate") - Number(b.kind === "alternate"));
    if (!recipes.length) {
      const warning = `Kein erlaubtes Rezept für ${item.name}; benötigte Menge wird als Import ausgewiesen.`;
      return [{ lines: [], raw: { [itemId]: rateNeeded }, power: 0, machines: 0, sloops: 0, shards: 0, steps: 0, warnings: [warning], score: scoreMetrics(0,0,rateNeeded,0,options.objective) }];
    }
    const candidates: Candidate[] = [];
    for (const recipe of recipes.slice(0, maxCandidatesPerInput)) {
      if (searchStates > maxSearchStates) { searchBudgetExhausted = true; break; }
      const output = recipe.outputs.find(o => o.item === itemId)!;
      const machine = data.machines[recipe.machine];
      const slots = options.useSomersloops ? Math.max(0, machine?.somersloopSlots ?? 0) : 0;
      // Production amplification doubles output, not ingredient consumption, and raises machine power draw.
      const amplification = slots > 0 ? 2 : 1;
      const machineRate = output.rate * amplification * maxClock;
      const count = Math.max(1, Math.ceil(rateNeeded / Math.max(machineRate, 1e-9) - 1e-7));
      const clock = Math.min(maxClock, rateNeeded / Math.max(output.rate * amplification * count, 1e-9));
      const actualOutput = output.rate * amplification * clock * count;
      const machinePower = (recipe.power || machine?.power || 0) * Math.pow(clock, machine?.powerExp ?? 1.6) * count * (slots > 0 ? 4 : 1);
      const childLists: Candidate[][] = [];
      for (const input of recipe.inputs) childLists.push(build(input.item, input.rate * clock * count, [...path, itemId], depth + 1));
      // Explore combinations of upstream recipe variants. Cap combinations to keep browser performance bounded.
      let combinations: Candidate[] = [{ lines: [], raw: {}, power: 0, machines: 0, sloops: 0, shards: 0, steps: 0, warnings: [], score: 0 }];
      for (const childCandidates of childLists) {
        const next: Candidate[] = [];
        for (const partial of combinations) for (const child of childCandidates.slice(0, maxChildCandidates)) {
          const raw = { ...partial.raw }; mergeRaw(raw, child.raw);
          next.push({ lines: [...partial.lines, ...child.lines], raw, power: partial.power + child.power, machines: partial.machines + child.machines, sloops: partial.sloops + child.sloops, shards: partial.shards + child.shards, steps: partial.steps + child.steps, warnings: [...partial.warnings, ...child.warnings], score: 0 });
        }
        combinations = next.sort((a,b) =>
          (scoreMetrics(a.power,a.machines,sumRaw(a.raw),a.steps,options.objective) + importPenalty(a.raw)) -
          (scoreMetrics(b.power,b.machines,sumRaw(b.raw),b.steps,options.objective) + importPenalty(b.raw))
        ).slice(0, maxCombinations);
      }
      for (const upstream of combinations) {
        const shards = options.allowOverclock && clock > 1 ? Math.ceil((clock - 1) / .5 - 1e-7) * count : 0;
        const line: RecipeLine = {
          recipeId: recipe.id, recipeName: recipe.name, kind: recipe.kind, machineName: machine?.name ?? recipe.machine,
          machineCount: count, clock: round(clock * 100), powerMW: round(machinePower), somersloops: slots > 0 ? count * slots : 0,
          inputs: recipe.inputs.map(s => flowFor(s, data, s.rate * clock * count)),
          outputs: recipe.outputs.map(s => flowFor(s, data, s.rate * clock * count * (slots > 0 ? 2 : 1)))
        };
        const allLines = [...upstream.lines, line];
        const allPower = upstream.power + machinePower;
        const allMachines = upstream.machines + count;
        const allRaw = { ...upstream.raw };
        let score = scoreMetrics(allPower, allMachines, sumRaw(allRaw), upstream.steps + 1, options.objective) + importPenalty(allRaw);
        if (options.strategy === "direct" && recipe.kind === "alternate") score += .35;
        if (options.strategy === "efficient") score += (upstream.steps + 1) * .015;
        if (options.strategy === "maximum") {
          // For a fixed target rate, favour recipes that use fewer raw units per unit of target output;
          // this is a ranking heuristic, not a global constrained maximum-throughput proof.
          score += (sumRaw(allRaw) / Math.max(targetRate, 1e-9)) * .03;
          score -= Math.log1p(Math.max(0, actualOutput / Math.max(rateNeeded, 1e-9))) * .02;
        }
        candidates.push({ lines: allLines, raw: allRaw, power: allPower, machines: allMachines, sloops: upstream.sloops + (slots > 0 ? count * slots : 0), shards: upstream.shards + shards, steps: upstream.steps + 1, warnings: [...upstream.warnings], score });
      }
    }
    return candidates.sort((a,b) => a.score - b.score).slice(0, 12);
  };
  const candidates = build(targetId, targetRate, [], 0);
  const chosen = candidates[Math.max(0, Math.floor(options.variantIndex ?? 0))] ?? candidates[0] ?? { lines: [], raw: { [targetId]: targetRate }, power: 0, machines: 0, sloops: 0, shards: 0, steps: 0, warnings: ["Keine gültige Produktionsvariante gefunden."], score: 0 };
  for (const w of chosen.warnings) warnings.add(w);
  if (progression === "early") warnings.add("Früher Spielstand aktiv: Rezepte mit Tier > 4 und SAM-bezogene Rezepte werden ausgeschlossen, soweit der Datensatz diese Angaben liefert.");
  else if (progression === "standard") warnings.add("Normaler Spielstand aktiv: Rezepte mit Tier > 6 und SAM-bezogene Rezepte werden ausgeschlossen. Rezepte ohne Tier-Angabe können nicht zuverlässig nach Fortschritt eingeordnet werden.");
  else warnings.add("Alle Fortschrittsstufen erlaubt; fortgeschrittene SAM-Rezepte können verwendet werden.");
  const unresolvedImports = keySort(chosen.raw).filter(([id]) => !data.items[id]?.raw);
  if (unresolvedImports.length) warnings.add(`Unvollständige Produktionskette: ${unresolvedImports.map(([id]) => data.items[id]?.name ?? id).join(", ")} konnte nicht vollständig hergestellt werden und bleibt als Import offen. Diese Variante ist keine fehlmengenfreie Komplettlösung.`);
  if (searchBudgetExhausted) warnings.add(`Die Rezeptsuche wurde sicher nach ${maxSearchStates} Zuständen begrenzt, damit die Oberfläche nicht einfriert. Ungelöste Bedarfe sind als Rohstoff/Import markiert; das Ergebnis ist nicht garantiert optimal.`);
  if (!options.allowOverclock) warnings.add("Overclocking ist deaktiviert; Maschinen werden höchstens mit 100 % berechnet.");
  if (!options.useSomersloops) warnings.add("Somersloops sind deaktiviert.");
  if (options.strategy === "maximum") warnings.add("Max. Output ist bei einer festen Zielrate eine heuristische Rezeptwahl. Ein globales Maximum unter Node-, Rohr-, Band- und Energielimits wird noch nicht bewiesen.");
  if (chosen.lines.some(l => l.inputs.some(x => x.form !== "Feststoff") || l.outputs.some(x => x.form !== "Feststoff"))) warnings.add("Flüssigkeiten und Gase werden als Mengenströme pro Minute verfolgt. Rohrkapazitäten sind noch keine harten Solver-Nebenbedingungen.");
  if (data.recipes.some(r => isPackagingRecipe(r, data))) warnings.add("Verpackungs- und Entpackungsrezepte werden als Transportumweg ignoriert, sofern das verpackte Produkt nicht selbst angefordert wird.");
  const mergedLines = orderLinesByDependencies(mergeLines(chosen.lines));
  const materialBalances = analyzeMaterialBalances(mergedLines, data, targetId);
  const raw = keySort(chosen.raw).map(([id,rate]) => flowFor({ item: id, rate }, data, rate));
  const rawUnits = raw.reduce((s,x)=>s+x.rate,0);
  return {
    target: { item: targetId, name: targetItem.name, rate: round(targetRate), form: normalizedForm(targetItem.form) },
    lines: mergedLines, raw, materialBalances,
    totals: { powerMW: round(chosen.power), machines: chosen.machines, rawUnitsPerMin: round(rawUnits), recipeSteps: mergedLines.length, somersloops: chosen.sloops, shards: chosen.shards },
    warnings: [...warnings], score: round(chosen.score), objective: options.objective, strategy: options.strategy,
    limitations: [
      `Die Rezeptsuche ist durch ein globales Budget von ${maxSearchStates} Zuständen begrenzt, damit alternative Rezepte die Oberfläche nicht blockieren. Bei Budgetüberschreitung wird kein Optimum behauptet.`,
      "Die Stoffbilanz summiert Ein- und Ausgänge über alle angezeigten Rezeptzeilen und markiert mögliche Überschüsse/Defizite. Diese Bilanz ist transparent, aber Nebenprodukte reduzieren den vorgelagerten Produktionsbedarf noch nicht automatisch.",
      "Flüssigkeiten und Gase werden wie Feststoffe als Mengenströme pro Minute durch die Rezeptkette verfolgt. Rohrkapazitäten sind noch keine globalen Nebenbedingungen; dadurch ist noch keine vollständige Turbofuel-Maximierung garantiert.",
      "Verpackungs- und Entpackungsrezepte werden als Transportumweg ausgeschlossen, außer das verpackte Produkt selbst wird angefordert.",
      "Produktionszeilen werden anhand ihrer Materialabhängigkeiten sortiert: vorgelagerte Erzeuger vor nachgelagerten Verbrauchern. Bei zyklischen Rezeptgraphen bleibt die Restreihenfolge stabil.",
      "Rohstoff-Nodes, Minerreinheit, Förderband-/Rohrkapazitäten und verfügbare Energie sind noch keine harten Solver-Nebenbedingungen.",
      "Somersloops werden für unterstützte Maschinen modelliert; ein begrenzter Sloop-Vorrat und eine globale optimale Verteilung sind noch nicht implementiert.",
      "Die Fortschrittsfilter nutzen Rezept-Tier-Angaben, sofern vorhanden, plus einen SAM-Ausschluss. Der Quelldatensatz enthält nicht für jedes Rezept verlässliche Freischaltbedingungen."
    ]
  };
}

/** Returns distinct candidate graphs for one objective. Candidate ranking is heuristic;
 * duplicate recipe graphs are removed so the UI never presents cosmetic duplicates. */
export function planProductionVariants(bundle: DataBundle, targetId: string, targetRate: number, options: SolverOptions, limit = 5): PlanResult[] {
  const results: PlanResult[] = [];
  const signatures = new Set<string>();
  for (let i = 0; i < Math.max(1, limit); i++) {
    const result = planProduction(bundle, targetId, targetRate, { ...options, variantIndex: i });
    const signature = result.lines.map(line => `${line.recipeId}:${line.machineCount}:${line.clock}:${line.somersloops}`).sort().join("|") + `#${result.raw.map(x => `${x.item}:${x.rate}`).sort().join("|")}`;
    if (signatures.has(signature)) continue;
    signatures.add(signature); results.push(result);
  }
  // Prefer complete production graphs; if none exist, put the least incomplete candidates first.
  const unresolved = (plan: PlanResult) => plan.raw.filter(x => !bundle.gameData.items[x.item]?.raw).reduce((sum, x) => sum + x.rate, 0);
  return results.sort((a, b) => {
    const aOpen = unresolved(a), bOpen = unresolved(b);
    if ((aOpen <= 1e-5) !== (bOpen <= 1e-5)) return aOpen <= 1e-5 ? -1 : 1;
    return aOpen - bOpen || a.score - b.score;
  });
}
