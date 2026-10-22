# Satisfactory Factory Planner

**Plan production chains. Compare recipes. Design your factory.**

[**Open the live demo →**](https://protheanreact.github.io/satisfactory-factory-planner-v7/) · [Report a bug](https://github.com/Protheanreact/satisfactory-factory-planner-v7/issues) · [View source](https://github.com/Protheanreact/satisfactory-factory-planner-v7)

Satisfactory Factory Planner is a browser-based companion for planning production in *Satisfactory*. It brings a production-chain optimizer, a visual factory editor, a resource map, and game-data checks together in one interface.

> **Planning aid, not an in-game simulator.** Results depend on the loaded game dataset and the options you select. Check important production rates against the game version you play.

## At a glance

- Compare production chains and recipe variants for a target item.
- Explore optimization goals such as fewer machines, lower power use, or reduced raw-resource demand.
- Sketch a factory layout and import or export project JSON.
- Explore resource nodes by resource type and purity.
- Review the loaded game-data version and run structural recipe checks.
- Use local cached game data when an update source is unavailable.
- Use Supabase-backed cloud saving when the required cloud configuration is enabled.

## Screenshots

### Production optimizer

Compare candidate production paths, machine counts, power use, and required inputs. Configure optimization goals, alternate recipes, overclocking, and Somersloops.

![Production optimizer showing production-chain calculations and optimization options](docs/screenshots/production-optimizer.png)

### Visual factory editor

Place production nodes, configure machines, and connect elements to sketch a factory layout. Project layouts can be imported and exported as JSON.

![Visual factory editor with connected production nodes](docs/screenshots/factory-editor.png)

### Resource map

Explore resource-node locations and filter the map by resource and node purity.

![Resource map with resource-node filters](docs/screenshots/resource-map.png)

### Game data and recipe audit

Inspect the loaded dataset version, item and recipe counts, and structural recipe-audit results.

![Game data and recipe audit panel](docs/screenshots/game-data-audit.png)

## Features

| Area | What it does |
| --- | --- |
| Production planning | Calculates a target production chain and compares available recipe variants. |
| Optimization | Offers objectives such as best combination, low power use, fewer machines, or lower raw-resource demand. |
| Production strategies | Includes Direct, Efficient, and Maximum Output strategies. |
| Recipe options | Can include alternate recipes, overclocking, and Somersloops. |
| Material balances | Shows inputs, outputs, potential deficits, and surplus by-products in the calculated chain. |
| Factory editor | Lets you place and connect production elements, adjust machine and belt settings, and import/export project JSON. |
| Resource map | Displays resource nodes with resource and purity filters. |
| Game-data checks | Displays dataset version/build, supports refreshes, and audits recipe references. |
| Local cache | Keeps the last successfully validated game-data snapshot available as a fallback. |
| Cloud saving | Supabase-backed saving is available when the app is configured with the required Supabase settings. |
| Desktop packaging | Includes an Electron-based portable Windows x64 packaging script; a ready-made release executable is not included by default. |

## Live demo and deployment

**Live app:** [protheanreact.github.io/satisfactory-factory-planner-v7](https://protheanreact.github.io/satisfactory-factory-planner-v7/)

The app is published to GitHub Pages through GitHub Actions. A push to the `main` branch triggers the workflow, which installs dependencies, builds the app, and deploys the generated `dist/` directory.

The browser demo and a locally configured app may not have identical capabilities. In particular, cloud saving requires the corresponding Supabase configuration; do not put private service-role keys or other secrets into client-side code or commit them to the repository.

## Run locally on Windows

### Requirements

- Node.js (Node 20 or newer recommended; the deployment workflow currently uses Node 22)
- npm, included with Node.js
- Git, if you want to clone the repository

### Install and start the development server

Open PowerShell or a terminal:

```powershell
git clone https://github.com/Protheanreact/satisfactory-factory-planner-v7.git
cd satisfactory-factory-planner-v7
npm ci
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

### Run tests and create a production build

```powershell
npm test
npm run build
```

The production build is written to `dist/`. The build command also runs the TypeScript project build before Vite creates the production assets.

### Create a portable Windows build

The repository defines this packaging command:

```powershell
npm run package:portable
```

This uses Electron Builder to attempt a portable Windows x64 package. Packaging may depend on the local environment and project configuration; the repository does not include a prebuilt executable by default.

## Game data and accuracy

The project uses versioned community game data from the [Ficsit Planner data repository](https://github.com/Albis0/ficsit_planner), stored in the project's `src/data` area. This is a community-maintained source, not an official Coffee Stain Studios API. The dataset may lag behind a new game patch, so verify important calculations against the exact game version you use.

## Known limitations

- **Heuristic optimization:** the production solver uses a bounded heuristic search. It finds useful candidate plans but does not prove that a result is globally optimal.
- **Not every constraint is solved together:** resource-node limits, belt and pipe capacities, available power, shard inventory, and Somersloop placement are not all jointly optimized as one global constraint system.
- **By-product reuse:** material balances are shown, but surplus by-products are not automatically reused to optimize every other branch of the chain.
- **Recipe audit scope:** structural checks help identify data/reference issues; they do not prove that every in-game mechanic is modeled perfectly.
- **Dataset freshness:** game data may lag behind the current game release.

## Reporting issues and contributing

Issues and pull requests are welcome. When reporting a problem, include:

- The app version and Satisfactory game version
- The target item and desired production rate
- Selected recipe and optimization options
- What you expected and what happened instead

Please do not include passwords, access tokens, Supabase secrets, or other credentials in issues or pull requests.

## Summary

Satisfactory Factory Planner combines production-chain planning, recipe comparisons, a visual factory editor, a resource map, and game-data checks. It supports configurable optimization goals, local game-data caching, and optional Supabase cloud saving. Because its solver is heuristic and its dataset can lag behind game updates, treat results as planning candidates and verify critical rates in-game.

**[Launch the live app →](https://protheanreact.github.io/satisfactory-factory-planner-v7/)**
