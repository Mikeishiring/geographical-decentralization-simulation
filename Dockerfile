FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip python3-venv ca-certificates git git-lfs curl \
  && git lfs install \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

COPY package.json package-lock.json ./
COPY explorer/package.json ./explorer/package.json
COPY study-generator/package.json ./study-generator/package.json
COPY packages/study-schema/package.json ./packages/study-schema/package.json
RUN npm ci --workspace explorer --include-workspace-root=false \
 && npm install --workspace explorer --include-workspace-root=false \
 && node -e "const { createRequire } = require('module'); const req = createRequire('/app/explorer/package.json'); if (process.platform === 'linux' && process.arch === 'x64') { req.resolve('@rolldown/binding-linux-x64-gnu'); req.resolve('lightningcss-linux-x64-gnu'); } else if (process.platform === 'linux' && process.arch === 'arm64') { req.resolve('@rolldown/binding-linux-arm64-gnu'); req.resolve('lightningcss-linux-arm64-gnu'); }"

WORKDIR /app/explorer

WORKDIR /app
COPY . .

# ── Resolve Git LFS pointers to actual file content ──────────────────────────
# Strategy:
#   1. Try `git lfs pull` if .git exists (fast, uses local objects)
#   2. Fallback: download any still-unresolved pointers from GitHub raw API
#      (works even when Railway strips .git from the build context)
#   3. Fail the build if any pointer stubs remain
#
ENV LFS_REPO_URL=https://github.com/Mikeishiring/geographical-decentralization-simulation/raw/main

RUN echo "── Step 1: Attempting git lfs pull ──" \
 && if [ -d .git ]; then \
      git lfs pull && echo "git lfs pull succeeded" && rm -rf .git; \
    else \
      echo "WARNING: .git not in build context — skipping git lfs pull"; \
    fi \
 && echo "── Step 2: Checking for unresolved LFS pointers ──" \
 && UNRESOLVED=0 \
 && for f in $(find dashboard/simulations -name 'data.json' 2>/dev/null); do \
      if head -c 40 "$f" 2>/dev/null | grep -q 'version https://git-lfs'; then \
        echo "  LFS pointer: $f — downloading from GitHub..."; \
        curl -fsSL "${LFS_REPO_URL}/${f}" -o "${f}.tmp" \
          && mv "${f}.tmp" "$f" \
          && echo "  ✓ resolved $f ($(wc -c < "$f") bytes)" \
          || { echo "  ✗ FAILED to download $f"; UNRESOLVED=$((UNRESOLVED + 1)); }; \
      fi; \
    done \
 && echo "── Step 3: Final verification ──" \
 && STILL_BAD=0 \
 && for f in $(find dashboard/simulations -name 'data.json' 2>/dev/null); do \
      if head -c 40 "$f" 2>/dev/null | grep -q 'version https://git-lfs'; then \
        echo "ERROR: still a pointer: $f" >&2; \
        STILL_BAD=$((STILL_BAD + 1)); \
      fi; \
    done \
 && if [ "$STILL_BAD" -gt 0 ]; then \
      echo "ERROR: $STILL_BAD LFS files could not be resolved. Build aborted." >&2; \
      exit 1; \
    fi \
 && echo "All simulation data files verified ✓"

WORKDIR /app/explorer
RUN npm run build

ENV NODE_ENV=production \
    PORT=8080 \
    PYTHON_EXECUTABLE=python3 \
    SIMULATION_REPO_ROOT=/app \
    SIMULATION_WORKERS=6 \
    SIMULATION_QUEUE_TTL_MS=900000

EXPOSE 8080

CMD ["npm", "run", "start"]
