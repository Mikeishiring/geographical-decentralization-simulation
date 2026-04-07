# Contributing

Thank you for your interest in contributing to the Geographical Decentralization Simulation.

## Development Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- npm 9+

### Python Simulation (root)

```bash
pip install -r requirements.txt
```

### Explorer Frontend

```bash
cd explorer
npm install
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env
npm run dev          # Frontend on :3200
npx tsx server/index.ts  # API server on :3201
```

### Environment Variables

Copy `explorer/.env.example` to `explorer/.env` and fill in:

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Yes (for Agent tab) | Claude API access for AI-powered exploration |
| `VITE_STUDY_ID` | No | Override the default study |
| `PORT` | No | API server port (default: 3201) |

Never commit `.env` files. The `.gitignore` excludes them, but always verify before pushing.

## Code Standards

### General

- Immutable patterns only (spread operators, never mutate)
- Files under 800 lines, functions under 50 lines
- No `console.log` in committed code
- No hardcoded secrets or API keys

### Frontend (TypeScript / React)

- **Styling:** Tailwind only (no CSS modules). Use `cn()` for conditional classes.
- **State:** React Query for server state. No `useState` for API data.
- **Animation:** Spring physics via theme constants (`SPRING`, `SPRING_SNAPPY`, `SPRING_POPUP`). No `ease` or `linear`.
- **Validation:** Zod at API boundaries.
- **Types:** Strict TypeScript. No `as any` or `@ts-ignore`.

### Commit Messages

Format: `<type>: <description>`

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

Examples:
```
feat: add latency overlay to validator map
fix: resolve tooltip clipping on KPI cards
refactor: extract sparkline into shared component
```

## Pull Requests

1. Create a feature branch from `main`
2. Keep PRs focused (one concern per PR)
3. Ensure `npm run build` passes with zero errors
4. Include a brief summary and test plan in the PR description

## Security

If you discover a security vulnerability, please report it privately rather than opening a public issue. Email the maintainers or use GitHub's private vulnerability reporting.

Before submitting any PR, verify:

- No `.env` files or API keys are staged (`git diff --cached`)
- No hardcoded credentials in code
- User inputs are validated at boundaries

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
