FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip python3-venv ca-certificates git git-lfs \
  && git lfs install \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

COPY explorer/package.json explorer/package-lock.json ./explorer/
WORKDIR /app/explorer
RUN npm ci

WORKDIR /app
COPY . .

# Resolve Git LFS pointers to actual file content (dashboard/simulations/*.json)
# Railway sends .git in the build context so git-lfs can pull the real objects.
# Fail loudly if LFS resolution doesn't work — serving pointer stubs breaks the app.
RUN if [ -d .git ]; then \
      git lfs pull && rm -rf .git; \
    else \
      echo "WARNING: .git missing — checking if LFS files are already resolved..."; \
    fi \
 && if head -c 40 dashboard/simulations/baseline/SSP/cost_0.002/data.json 2>/dev/null | grep -q 'version https://git-lfs'; then \
      echo "ERROR: dashboard/simulations still contains Git LFS pointers." >&2; \
      echo "The build context must include .git so that 'git lfs pull' can resolve them." >&2; \
      exit 1; \
    fi

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
