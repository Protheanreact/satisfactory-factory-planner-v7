# Satisfactory Factory Planner — Development 0.8

Responsive React + TypeScript + Vite prototype for planning Satisfactory production chains. It now includes a version-aware game-data loader, recipe audit, a first heuristic production-chain planner, and switches for alternate recipes, overclocking and Somersloops.

## Run on Windows
Requirements: Node.js LTS (20+ recommended).

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite (usually http://localhost:5173).

## What's included
- Production planner page with four objectives: Best combination, low power, few machines, low raw-resource use.
- Production strategies: Direct, Efficient and Maximum Output.
- Alternative recipes toggle, overclocking toggle and adjustable maximum clock (100–250%), plus Somersloop toggle.
- Automatic data-version check at startup, when the tab/app becomes active, and every six hours while the app is open, plus manual refresh. A browser app cannot run checks while fully closed; it checks immediately when reopened.
- Current dataset is cached in IndexedDB for offline fallback. A newer dataset replaces the cached one only after structural validation.
- Data/recipe audit with item, recipe, machine and alternate-recipe counts; checks missing references and invalid durations.
- Original draggable factory editor, connections, project JSON import/export and local save.
- Responsive layout for desktop and phone.

## Data source and updates
The prototype checks the version metadata and loads `gamedata.json` and `world.json` from the public repository:
`https://github.com/Albis0/ficsit_planner` (data path: `src/data`). The UI shows the imported game version/build. This is a community data source, not an official Coffee Stain Studios API. If the source is unavailable, the last successfully cached dataset is used. First-time data download requires internet access and a browser that can reach `raw.githubusercontent.com`.

## Important limitations of 0.3
- The optimizer is a bounded heuristic prototype, not a proven global linear/integer optimizer. “Maximum Output” currently ranks recipes for a user-specified target; it does not yet calculate the true maximum from limited resource nodes, pipes, belts and available power. Its ranking is explanatory but should not yet be treated as guaranteed optimal.
- It expands one selected recipe path recursively; global sharing of byproducts between branches is not implemented yet. Thus it can show packaging/unpackaging recipes when present in the data, but it does not yet guarantee the best closed-loop fluid/container balance.
- Somersloop support uses a simplified maximum-slot assumption. Inventory limits, per-machine placement choices and the complete in-game rules still need validation.
- Overclocking currently applies the configured maximum clock uniformly in the heuristic model. Shard inventory, optimal distribution and building-specific exceptions need a later solver pass.
- The audit verifies data structure and references, not every game mechanic. The real map is not yet rendered in the editor, and the original canvas connection labels still show belt capacity rather than calculated flow.
- Always compare results with the exact Satisfactory build you play. The dataset can lag behind a newly released patch.

## Next engineering milestone
Replace the heuristic search with a proper linear/integer optimization engine that jointly handles recipe choices, fluid/packaging loops, coproduct balancing, node limits, belt/pipe throughput, machine-specific clock/power formulas, finite Somersloop/shard inventories and power limits. Then connect its result to the visual factory editor and real world-node map.


## Version 0.4 – rekursive Rezeptvarianten

Die Produktions-Engine bewertet nun mehrere vollständige, rekursiv aufgebaute Rezeptvarianten statt nur das direkt benötigte Rezept. Dabei werden upstream Rohstoffbedarf, Maschinenzahl und Stromverbrauch in die Bewertung einbezogen. Die Suche ist bewusst begrenzt, damit sie im Browser reagiert.

- Optimierungsziele: Beste Kombination, wenig Strom, wenig Maschinen, wenig Rohstoffe.
- Strategien: Direkt, Effizient, Max. Output (bei fixer Zielrate weiterhin heuristisch).
- Alternative Rezepte können in die Suche aufgenommen werden.
- Overclocking und Somersloops sind separat schaltbar. Somersloop-Verstärkung wird für unterstützte Maschinen modelliert; Bestand und optimale Verteilung sind noch keine globale Nebenbedingung.
- Rezept-Audit erkennt fehlende Item-Referenzen, fehlende Maschinendaten, Flüssigkeitsrezepte und Hinweise auf Verpackungs-/Entpackungsrezepte.

### Bekannte Grenzen

Der Solver verrechnet Nebenprodukte noch nicht als globalen gemeinsamen Bestand und beweist kein globales Maximum unter Rohstoff-Node-, Rohr-, Förderband- und Stromgrenzen. Verpacken und Entpacken werden als normale Rezepte berücksichtigt, wenn sie im importierten Datensatz enthalten sind; Behälterkreisläufe werden noch nicht global gelöst. Die importierten Spieldaten sollten vor realen Bauentscheidungen mit der tatsächlich installierten Spielversion abgeglichen werden.

### Entwicklung prüfen

Nach erfolgreicher Installation der Abhängigkeiten: `npm test` und `npm run build`. In der aktuellen Entwicklungsumgebung war die Installation der npm-Abhängigkeiten zeitlich nicht erfolgreich; diese Version wurde deshalb hier nicht als vollständig gebaut oder ausgeführt bestätigt.

## Portable Windows app (no Node.js required on the target PC)

The project now includes the packaging configuration for an installer-free Electron portable executable. The generated EXE is not included in this source ZIP; it must be built and smoke-tested on a Windows build machine first.

On the build machine only, install Node.js LTS and run PowerShell in the project directory:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\build-portable.ps1
```

The script installs dependencies, runs the test suite, creates the production web build, and packages a portable EXE in `release\`. The target PC does not need Node.js or npm. Do not distribute a build until `npm test`, `npm run build`, and a manual Windows launch test all pass. The app still needs internet for first-time game-data download and updates; cached data is intended to support offline use afterward.

## Version 0.5 – packaging groundwork

- Added an Electron main process with renderer sandboxing and external-link handling.
- Added electron-builder configuration for a portable Windows x64 executable.
- Added `build-portable.ps1`, which refuses to package if tests or the production build fail.
- This is packaging groundwork only; no compiled EXE is included yet because dependencies/build tooling must be installed and verified on a Windows build machine.


## Version 0.6 — globale Stoffbilanz als transparenter Zwischenschritt

- Jede berechnete Produktionskette erhält eine zusammengefasste Stoffbilanz über alle angezeigten Rezeptzeilen.
- Der Planer markiert Zielprodukt, Rohstoffbedarf, ausgeglichene Stoffe sowie mögliche Zwischenprodukt-Defizite und Überschüsse/Nebenprodukte.
- Das Ergebnis zeigt Ein- und Ausgänge je Stoff in Einheiten pro Minute.
- Tests für sichtbare Nebenprodukt-Überschüsse und nicht gedeckte Zwischenprodukt-Eingänge wurden ergänzt.

**Wichtige Grenze:** Das ist noch keine globale Stoffflussoptimierung. Ein angezeigter Überschuss wird in dieser Version noch nicht automatisch verwendet, um eine andere Produktionslinie zu reduzieren. Diese Anzeige ist absichtlich transparent und soll den nächsten Solver-Schritt absichern, statt eine nicht vorhandene Optimierung vorzutäuschen.


## Version 0.7 — Flüssigkeitsketten und sichere Alternativsuche

- Flüssigkeiten und Gase werden über dieselbe rekursive Rezeptlogik wie Feststoffe verfolgt; die Oberfläche zeigt für Flüssigkeiten/Gase `m³/min` und für Feststoffe `Stk/min`.
- Rezeptauflösung wird nicht mehr allein durch ein `raw`-Flag gestoppt, wenn der Datensatz zugleich ein Rezept zum Erzeugen dieses Items enthält. Das hilft bei Flüssigkeits-/Verpackungspfaden und fehlerhaft klassifizierten Einträgen.
- Die Suche mit alternativen Rezepten hat ein globales Budget (1.800 Suchzustände; ohne Alternativen 900), begrenzte Rezeptvarianten pro Item und begrenzte Kombinationen von vorgelagerten Rezepten. Bei Erreichen des Budgets wird eine Warnung ausgegeben statt unbegrenzt weiterzusuchen.
- Flüssigkeitstests decken eine beispielhafte Rohöl → Heavy Oil Residue → alternativer Fuel → Turbofuel-Kette ab. Ein zusätzlicher Verzweigungstest prüft, dass alternative Rezepte nicht unbegrenzt durchsucht werden.

**Grenzen:** Das ist weiterhin ein begrenzter heuristischer Solver, kein globaler LP/MILP-Optimierer. Flüssigkeitsmengen werden entlang vorhandener Rezepte berechnet, aber Rohrdurchsatz, Packaging-Container-Kreisläufe, globale Nebenproduktverwertung und das mathematische Maximum sind noch nicht vollständig gelöst. Der vollständige React/Vite-Build und die Vitest-Suite konnten in der Entwicklungsumgebung nicht ausgeführt werden, da die npm-Abhängigkeiten wegen fehlendem Netzwerkzugriff nicht installiert werden konnten. Die Solver-Kernmodule ließen sich separat mit TypeScript kompilieren und ein Laufzeittest der Flüssigkeitskette war erfolgreich.


## Version 0.8 — unterscheidbare Produktionsvarianten

- Die Produktionsplanung kann mehrere Kandidaten für dasselbe Optimierungsziel bereitstellen.
- Die Oberfläche zeigt einen Variantenwähler nur dann, wenn tatsächlich unterschiedliche Rezeptgraphen gefunden wurden; doppelte Rezeptgraphen werden ausgefiltert.
- Jede Variante zeigt ihre eigene Maschinen-, Energie- und Rohstoffbilanz.
- Die Kandidatenrangfolge bleibt heuristisch und durch das Suchbudget begrenzt. Varianten sind daher Alternativen, kein mathematischer Optimalitätsnachweis.
- Validierung: TypeScript-Kernmodule werden separat geprüft. Ein vollständiger Vite-/Vitest-Build benötigt die vollständigen npm-Abhängigkeiten; diese konnten in der aktuellen Umgebung nicht installiert werden.


## Version 0.9 – Fortschritt und vollständige Ketten bevorzugen

- Neue Auswahl für den Spiel-Fortschritt: **Früher Spielstand**, **Normaler Spielstand** oder **Alles freigeschaltet**.
- SAM-bezogene Rezepte werden standardmäßig ausgeschlossen; sie sind erst bei „Alles freigeschaltet“ erlaubt.
- Bei früheren Stufen werden Rezepte mit höherem Tier ausgeschlossen, sofern der Community-Datensatz die Tier-Angabe liefert.
- Produktionsvarianten, die herstellbare Zwischenprodukte als offene Importe zurücklassen, werden deutlich schlechter bewertet. Varianten ohne solche offenen Importe werden in der Auswahl nach vorne sortiert.
- Bleibt ein Zwischenprodukt unaufgelöst, wird es ausdrücklich als offener Import gekennzeichnet; eine solche Variante wird nicht als vollständig lösbar ausgegeben.

**Einschränkung:** Der zugrunde liegende Datensatz enthält nicht für jedes Rezept verlässliche Freischaltbedingungen. Der Fortschrittsfilter ist deshalb eine vorsichtige Näherung und kein vollständiger Ersatz für den Ingame-Milestone-/MAM-Forschungsstatus. Außerdem fehlen in dieser Umgebung die installierten Vitest-Abhängigkeiten; der vollständige Testlauf und der Vite-Build konnten hier nicht ausgeführt werden. Der TypeScript-Compiler konnte den Solver-Kern prüfen.
