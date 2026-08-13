# Mentis Thought Graph

Interactive force-directed viewer for [MentisDB](https://github.com/faulknerpearce) thought chains — a visual map of agent memory: decisions, lessons, corrections, plans, and the relations that bind them.

![Mentis Thought Graph in dark mode, showing a dense force-directed network of color-coded thought nodes with the Browse facets sidebar and toolbar](docs/mentis-graph-dark.jpg)

## What it does

Mentis Graph connects to a local MentisDB daemon over REST and renders every loaded thought as a node in a 2D or 3D force graph. Edges encode how thoughts relate:

| Edge kind | Meaning |
|-----------|---------|
| **Relations** | Typed links (`DerivedFrom`, `Supports`, `Corrects`, …) |
| **Refs** | Positional references within a chain |
| **Hash spine** | Append-order chain backbone via `prev_hash` |

Click a node to open its markdown content over the graph and inspect full metadata, tags, and neighbors in the slide-out detail panel.

## Features

- **2D + 3D modes** — canvas force layout by default; optional WebGL 3D view
- **Facet explorer** — browse and filter by thought **type** or **chain** in the left sidebar
- **Search & type chips** — narrow the visible graph from the toolbar
- **Edge toggles** — show/hide relations, refs, and hash spine independently
- **Selection focus** — neighborhood dimming, content modal, and detail slide-out without recentering the camera
- **Light & dark themes** — ink-and-paper light mode and obsidian dark mode, with theme-aware node colors
- **Safe markdown** — thought content rendered with restricted URL schemes

## Prerequisites

1. **MentisDB daemon** running locally with REST on `http://127.0.0.1:9472`
2. **Node.js** 20+ (npm)

Verify MentisDB:

```bash
curl -s http://127.0.0.1:9472/health
# {"service":"mentisdb","status":"ok"}
```

Chain data is read from MentisDB storage (default `~/.cloudllm/mentisdb/`) via REST — this app never opens `.tcbin` files directly.

## Run locally

```bash
cd mentis_graph
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Vite proxies `/api/*` → `http://127.0.0.1:9472/*` so the browser avoids CORS. The same proxy applies to `npm run preview`.

## Usage

- **Browse** (left): filter by **Types** or **Chain**. Clear resets facet filters.
- **Edges**: toggle typed **Relations**, positional **Refs**, and append-order **Hash spine** (on by default).
- **Graph mode**: switch between 2D and 3D from the toolbar.
- **Types / search**: all thought types are shown by default; use chips or search to narrow the graph.
- **Click a node**: content opens as a modal over the graph; the right panel shows metadata and inbound/outbound neighbors. Close with Esc or the Close button.
- **Theme**: toggle light/dark from the header control.

First load with many chains can take a moment while thoughts are traversed from MentisDB.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server (port 5173) |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview production build (with MentisDB proxy) |
| `npm test` | Run unit tests (Vitest) |
| `npm run lint` | Lint with oxlint |

## Stack

- **App:** Vite + React 19 + TypeScript
- **Graph:** [`react-force-graph-2d`](https://github.com/vasturiano/react-force-graph) / [`react-force-graph-3d`](https://github.com/vasturiano/react-force-graph) + `d3-force-3d`
- **Content:** `react-markdown` + `remark-gfm`
- **Data:** MentisDB REST (`/v1/chains`, `/v1/thoughts/traverse`)
