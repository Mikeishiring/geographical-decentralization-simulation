const FOOTER_LINKS = [
  { label: 'Read the paper', href: 'https://arxiv.org/abs/2509.21475' },
  { label: 'View source', href: 'https://github.com/syang-ng/geographical-decentralization-simulation' },
  { label: 'Published demo', href: 'https://geo-decentralization.github.io/' },
] as const

export function Footer() {
  return (
    <footer className="mt-16">
      <div className="h-px bg-rule" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col gap-5">
          {/* Arrow links — Agentation-style lightweight CTAs */}
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {FOOTER_LINKS.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="arrow-link"
              >
                {label}
              </a>
            ))}
          </div>

          {/* Attribution */}
          <p className="text-[0.6875rem] text-text-faint">
            Yang, Oz, Wu, Zhang (2025) · arXiv:2509.21475 · MIT License
          </p>
        </div>
      </div>
    </footer>
  )
}
