import { motion } from 'framer-motion'
import { SPRING_SOFT } from '../../lib/theme'
import type { EquationBlock as EquationBlockType } from '../../types/blocks'

interface EquationBlockProps {
  block: EquationBlockType
}

/**
 * Renders LaTeX as styled plain text with common math symbol substitutions.
 * A lightweight approach that avoids the heavy KaTeX/MathJax bundle.
 * Handles fractions, subscripts, superscripts, Greek letters, and operators.
 */
function renderLatexText(latex: string): string {
  let result = latex
    // Greek letters
    .replace(/\\alpha/g, 'α').replace(/\\beta/g, 'β').replace(/\\gamma/g, 'γ')
    .replace(/\\delta/g, 'δ').replace(/\\epsilon/g, 'ε').replace(/\\zeta/g, 'ζ')
    .replace(/\\eta/g, 'η').replace(/\\theta/g, 'θ').replace(/\\lambda/g, 'λ')
    .replace(/\\mu/g, 'μ').replace(/\\nu/g, 'ν').replace(/\\pi/g, 'π')
    .replace(/\\rho/g, 'ρ').replace(/\\sigma/g, 'σ').replace(/\\tau/g, 'τ')
    .replace(/\\phi/g, 'φ').replace(/\\chi/g, 'χ').replace(/\\psi/g, 'ψ')
    .replace(/\\omega/g, 'ω')
    .replace(/\\Gamma/g, 'Γ').replace(/\\Delta/g, 'Δ').replace(/\\Sigma/g, 'Σ')
    .replace(/\\Omega/g, 'Ω').replace(/\\Pi/g, 'Π').replace(/\\Phi/g, 'Φ')
    // Operators
    .replace(/\\sum/g, '∑').replace(/\\prod/g, '∏').replace(/\\int/g, '∫')
    .replace(/\\infty/g, '∞').replace(/\\partial/g, '∂').replace(/\\nabla/g, '∇')
    .replace(/\\forall/g, '∀').replace(/\\exists/g, '∃')
    .replace(/\\in/g, '∈').replace(/\\notin/g, '∉')
    .replace(/\\subset/g, '⊂').replace(/\\supset/g, '⊃')
    .replace(/\\cup/g, '∪').replace(/\\cap/g, '∩')
    .replace(/\\leq/g, '≤').replace(/\\geq/g, '≥').replace(/\\neq/g, '≠')
    .replace(/\\approx/g, '≈').replace(/\\equiv/g, '≡')
    .replace(/\\times/g, '×').replace(/\\cdot/g, '·').replace(/\\ldots/g, '…')
    .replace(/\\rightarrow/g, '→').replace(/\\leftarrow/g, '←').replace(/\\Rightarrow/g, '⇒')
    // Simple fractions: \frac{a}{b} → a/b
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)')
    // Subscripts: _{text} → _text (simplified)
    .replace(/\_\{([^}]+)\}/g, '₍$1₎')
    // Superscripts: ^{text} → ^text
    .replace(/\^\{([^}]+)\}/g, '⁽$1⁾')
    // Simple sub/super with single char
    .replace(/_(\w)/g, '₍$1₎')
    .replace(/\^(\w)/g, '⁽$1⁾')
    // Clean up remaining braces and commands
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\mathrm\{([^}]+)\}/g, '$1')
    .replace(/\\mathbf\{([^}]+)\}/g, '$1')
    .replace(/\\left/g, '').replace(/\\right/g, '')
    .replace(/\{/g, '').replace(/\}/g, '')
    .replace(/\\\\/g, '')

  return result
}

export function EquationBlock({ block }: EquationBlockProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_SOFT}
      className="overflow-hidden rounded-xl border border-rule bg-white"
    >
      <div className="px-5 py-4">
        <div className="rounded-lg bg-surface-active px-6 py-5 text-center">
          <div
            className="font-mono text-base sm:text-lg text-text-primary tracking-wide leading-relaxed"
            aria-label={`Equation: ${block.latex}`}
          >
            {renderLatexText(block.latex)}
          </div>
        </div>

        {(block.label || block.description) && (
          <div className="mt-3 text-center">
            {block.label && (
              <div className="text-xs font-medium text-muted uppercase tracking-[0.1em]">
                {block.label}
              </div>
            )}
            {block.description && (
              <div className="mt-1 text-xs text-muted">
                {block.description}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}
