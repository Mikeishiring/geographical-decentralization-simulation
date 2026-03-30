export function Header() {
  return (
    <header className="border-b border-rule">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[0.9375rem] sm:text-base font-medium text-text-primary leading-tight tracking-[-0.01em]">
              Geographical Decentralization in Ethereum
            </h1>
            <p className="text-[0.75rem] text-muted mt-1">
              Yang, Oz, Wu, Zhang (2025)
              <span className="text-rule"> · </span>
              <span className="text-text-faint">arXiv:2509.21475</span>
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 pt-0.5">
            <a
              href="https://arxiv.org/abs/2509.21475"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-white px-2.5 py-1 text-[0.6875rem] text-muted transition-colors hover:text-accent"
            >
              Paper →
            </a>
            <a
              href="https://github.com/syang-ng/geographical-decentralization-simulation"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-white px-2.5 py-1 text-[0.6875rem] text-muted transition-colors hover:text-accent"
            >
              Source →
            </a>
          </div>
        </div>
      </div>
    </header>
  )
}
