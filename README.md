# Mentis Thought Graph

Interactive force-directed viewer for MentisDB thought chains. Click nodes to inspect thoughts and follow typed relation edges.

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
cd ~/workspace/mentis_graph
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Vite proxies `/api/*` → `http://127.0.0.1:9472/*` so the browser avoids CORS.

## Usage

- **Chains** (left): all chains are selected on load (~2.3k thoughts — first load can be slow). Uncheck any you don’t need.
- **Edges**: toggle typed **Relations**, positional **Refs**, and append-order **Hash spine** (on by default).
- **Graph mode**: switch between the default 2D canvas and interactive 3D WebGL mode from the toolbar.
- **Types / search**: all thought types are shown by default; click a type chip to narrow the graph.
- **Click a node**: detail panel shows content, tags, and inbound/outbound neighbors.

## Scripts

| Command        | Description              |
|----------------|--------------------------|
| `npm run dev`  | Dev server (port 5173)   |
| `npm run build`| Typecheck + production build |
| `npm run preview` | Preview production build |

## Stack

Vite + React + TypeScript + [`react-force-graph-2d`](https://github.com/vasturiano/react-force-graph).
