import { RefreshCw } from 'lucide-react'
import type { ExploreError } from '../../lib/api'

interface ErrorDisplayProps {
  error: ExploreError
  onRetry: () => void
}

export function ErrorDisplay({ error, onRetry }: ErrorDisplayProps) {
  const isRateLimit = error.status === 429
  const isAuth = error.status === 401
  const isNetwork = error.status === 0
  const isMissingConfig = error.status === 503 && error.error.includes('Anthropic API is not configured')

  const title = isRateLimit
    ? 'Rate limit reached'
    : isAuth || isMissingConfig
      ? 'API key not configured'
      : isNetwork
        ? 'Cannot reach API server'
        : 'Something went wrong'

  const detail = isRateLimit
    ? 'Too many requests. Wait a moment and try again.'
    : isAuth || isMissingConfig
      ? 'Set ANTHROPIC_API_KEY in explorer/.env or the server environment to enable fresh guided readings. Curated and history matches still work without it.'
      : isNetwork
        ? 'Make sure the API server is running (npx tsx server/index.ts).'
        : error.error

  return (
    <div className="rounded-xl border border-rule bg-white px-5 py-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="h-1.5 w-1.5 rounded-full bg-warning" />
        <h3 className="text-13 font-medium text-text-primary">
          {title}
        </h3>
      </div>

      <p className="text-13 leading-[1.6] text-muted max-w-md">
        {detail}
      </p>

      {!isAuth && !isMissingConfig && (
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-1.5 text-13 font-medium text-text-primary hover:text-accent transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Try again
        </button>
      )}
    </div>
  )
}
