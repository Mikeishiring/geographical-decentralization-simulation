import { BookOpen, Code, Globe } from 'lucide-react'

const FOOTER_LINKS = [
  { label: 'Read Paper', href: 'https://arxiv.org/abs/2509.21475', icon: BookOpen },
  { label: 'View Source', href: 'https://github.com/syang-ng/geographical-decentralization-simulation', icon: Code },
  { label: 'Published Demo', href: 'https://geo-decentralization.github.io/', icon: Globe },
] as const

export function Footer() {
  return (
    <footer className="mt-12">
      {/* Gradient accent line — mirrors Header */}
      <div
        className="h-px"
        style={{
          background: 'linear-gradient(90deg, #2563EB 0%, #C2553A 50%, #16A34A 100%)',
          opacity: 0.25,
        }}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted">
            Yang, Oz, Wu, Zhang (2025) · arXiv:2509.21475 · MIT License
          </p>
          <div className="flex gap-2">
            {FOOTER_LINKS.map(({ label, href, icon: Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-muted border border-transparent hover:border-border-subtle hover:text-text-primary transition-colors"
              >
                <Icon className="w-3 h-3" />
                {label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
