import { GlobeWireframe } from '../decorative/GlobeWireframe'

export function Header() {
  return (
    <header className="border-b border-rule relative overflow-hidden">
      {/* Half-globe: canvas is taller than header, clipped by overflow-hidden.
          The globe's center sits at cy=92% of canvas height, so we see the top cap. */}
      <div
        className="absolute inset-0 pointer-events-none select-none"
        style={{ height: '220%', top: '-10%' }}
        aria-hidden="true"
      >
        <GlobeWireframe className="w-full h-full opacity-80" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 max-w-xl">
            {/* Eyebrow */}
            <p className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
              Interactive paper edition
            </p>

            {/* Title */}
            <h1 className="mt-1.5 text-base sm:text-lg font-semibold text-text-primary leading-snug tracking-[-0.01em]">
              Geographical Decentralization in Ethereum Block Building
            </h1>

            {/* Subtitle */}
            <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted max-w-lg">
              How validator geography and paradigm choice shape centralization pressure under SSP and MSP.
            </p>

            {/* Authors */}
            <p className="mt-2 text-[0.6875rem] text-text-faint">
              Yang, Oz, Wu, Zhang (2025)
              <span className="text-rule"> · </span>
              arXiv:2509.21475
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 pt-6">
            <a
              href="https://arxiv.org/abs/2509.21475"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-full border border-rule bg-white px-2.5 py-1 text-[0.6875rem] text-muted transition-colors hover:text-accent hover:border-accent/20"
            >
              Paper →
            </a>
            <a
              href="https://github.com/syang-ng/geographical-decentralization-simulation"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-full border border-rule bg-white px-2.5 py-1 text-[0.6875rem] text-muted transition-colors hover:text-accent hover:border-accent/20"
            >
              Source →
            </a>
          </div>
        </div>
      </div>
    </header>
  )
}
