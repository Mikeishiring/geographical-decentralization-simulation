# Cloudflare data demo

The separate `geo-explorer-demo` Worker serves the paper reader, recorded simulation
replays and a browser-local SQL Data Lab. It does not start Express, Python workers,
Claude requests or a community write API. The original full application remains
available through the normal build and Dockerfile.

## Build and publish

From the repository root with Node 24 and Git LFS installed:

```sh
git lfs pull
npm ci
npm --workspace explorer run build:demo
npx wrangler deploy --config wrangler.demo.toml
```

The build copies only the catalogued simulation JSON files and dashboard assets,
the paper assets, and the four research input files served by the original app.
It fails on unresolved LFS files, missing datasets or a dataset above Cloudflare's
25 MiB individual asset limit. No environment secrets or persistent community
records are included. `explorer/.env.demo` contains only the public build-mode flag.

The data build derives a browser warehouse index from all 31 recorded simulations.
The SQL catalog covers all published runs and their initial/final snapshots;
slot-level tables load the default Baseline / Local / cost_0.002 recording.
The complete recording set remains available through the Results scenario controls.
DuckDB WebAssembly loads from its versioned jsDelivr distribution; queries execute
in the visitor's browser. Results are limited to 10,000 displayed/exported rows.

For a local production preview:

```sh
npm --workspace explorer run preview -- --host 127.0.0.1 --port 4177
```

Verify paper views, Results scenario/paradigm changes, replay controls and a Data
Lab query before publishing. The deployment uses static assets without a live API
or container. It requires neither an Anthropic key nor a Railway subscription.
