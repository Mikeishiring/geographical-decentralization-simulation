import * as React from 'react'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, FlaskConical, BarChart3, Users } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_SNAPPY, CONTENT_MAX_WIDTH } from '../../lib/theme'

export type TabId = 'paper' | 'results' | 'agent' | 'community'

interface TabNavProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  onTabIntent?: (tab: TabId) => void
}

const tabs: { id: TabId; label: string; icon: typeof BookOpen; hint: string }[] = [
  { id: 'paper', label: 'Paper', icon: BookOpen, hint: 'Editorial reading with visual evidence — 4 views from custom to original PDF' },
  { id: 'results', label: 'Results', icon: BarChart3, hint: 'Simulation lab — run scenarios, compare paradigms, export artifacts' },
  { id: 'agent', label: 'Agent', icon: FlaskConical, hint: 'Ask questions and run autonomous research loops' },
  { id: 'community', label: 'Community', icon: Users, hint: 'Published human notes over paper and exact-run evidence' },
]

export function TabNav({ activeTab, onTabChange, onTabIntent }: TabNavProps) {
  const tabRefs = React.useRef<Map<TabId, HTMLButtonElement>>(new Map())
  const navShellRef = React.useRef<HTMLDivElement | null>(null)
  const [hoveredTab, setHoveredTab] = useState<TabId | null>(null)
  const focusTab = React.useCallback((tab: TabId) => {
    window.requestAnimationFrame(() => {
      tabRefs.current.get(tab)?.focus()
    })
  }, [])

  React.useLayoutEffect(() => {
    const navShell = navShellRef.current
    if (!navShell) return

    const updateHeight = () => {
      document.documentElement.style.setProperty('--explorer-tab-nav-height', `${Math.ceil(navShell.getBoundingClientRect().height)}px`)
    }

    updateHeight()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateHeight)
      return () => window.removeEventListener('resize', updateHeight)
    }

    const observer = new ResizeObserver(() => updateHeight())
    observer.observe(navShell)

    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <div ref={navShellRef} data-testid="tab-nav-shell" className="sticky top-0 z-20 border-b border-rule bg-white/92 backdrop-blur-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className={`${CONTENT_MAX_WIDTH} mx-auto px-4 sm:px-6 overflow-x-auto hide-scrollbar tab-scroll-fade`}>
        <nav className="flex gap-1 min-w-max" role="tablist" aria-label="Explorer sections">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id
            const isHovered = hoveredTab === tab.id
            const Icon = tab.icon
            return (
              <div key={tab.id} className="relative">
                <button
                  ref={el => { if (el) tabRefs.current.set(tab.id, el) }}
                  role="tab"
                  onClick={() => onTabChange(tab.id)}
                  onMouseEnter={() => {
                    setHoveredTab(tab.id)
                    onTabIntent?.(tab.id)
                  }}
                  onMouseLeave={() => setHoveredTab(null)}
                  onFocus={() => {
                    setHoveredTab(tab.id)
                    onTabIntent?.(tab.id)
                  }}
                  onBlur={() => setHoveredTab(current => (current === tab.id ? null : current))}
                  onKeyDown={e => {
                    const currentIndex = tabs.findIndex(t => t.id === tab.id)
                    if (e.key === 'ArrowRight') {
                      e.preventDefault()
                      const next = tabs[(currentIndex + 1) % tabs.length]
                      onTabChange(next.id)
                      focusTab(next.id)
                    } else if (e.key === 'ArrowLeft') {
                      e.preventDefault()
                      const prev = tabs[(currentIndex - 1 + tabs.length) % tabs.length]
                      onTabChange(prev.id)
                      focusTab(prev.id)
                    } else if (e.key === 'Home') {
                      e.preventDefault()
                      onTabChange(tabs[0].id)
                      focusTab(tabs[0].id)
                    } else if (e.key === 'End') {
                      e.preventDefault()
                      const last = tabs[tabs.length - 1]
                      onTabChange(last.id)
                      focusTab(last.id)
                    }
                  }}
                  aria-label={tab.label}
                  aria-selected={isActive}
                  tabIndex={isActive ? 0 : -1}
                  className={cn(
                    'relative flex items-center gap-2 rounded-xl px-3.5 py-3 text-13 transition-colors',
                    isActive
                      ? 'bg-surface-active/70 text-text-primary font-medium'
                      : 'text-muted hover:text-text-primary',
                  )}
                >
                  <Icon className={cn(
                    'h-3.5 w-3.5 shrink-0 transition-colors',
                    isActive ? 'text-accent' : isHovered ? 'text-text-primary' : 'text-muted/60',
                  )} />
                  <span className="text-xs sm:text-sm">{tab.label}</span>

                  {/* Hover background pill */}
                  {isHovered && !isActive && (
                    <motion.div
                      layoutId="tab-hover-bg"
                      className="absolute inset-0 rounded-xl border border-rule/70 bg-white shadow-[0_6px_20px_-18px_rgba(15,23,42,0.25)] -z-10"
                      transition={SPRING_SNAPPY}
                    />
                  )}

                  {/* Active underline indicator */}
                  {isActive && (
                    <motion.div
                      layoutId="tab-indicator"
                      className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                      style={{
                        background: 'linear-gradient(90deg, var(--color-accent), var(--color-accent-warm))',
                      }}
                      transition={SPRING}
                    />
                  )}
                </button>

                {/* Spring-animated tooltip */}
                <AnimatePresence>
                  {isHovered && !isActive && (
                    <motion.div
                      initial={{ opacity: 0, y: 4, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 2, scale: 0.97 }}
                      transition={SPRING_SNAPPY}
                      className="absolute top-full left-1/2 z-30 mt-2 w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 pointer-events-none"
                    >
                      <div className="relative rounded-xl border border-white/10 bg-text-primary/94 px-3.5 py-3 text-left text-white/90 shadow-xl backdrop-blur-md">
                        <div className="absolute -top-[5px] left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-l border-t border-white/10 bg-text-primary/94" />
                        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/45">
                          Preview
                        </div>
                        <div className="mt-1 text-11 font-medium text-white">
                          {tab.label}
                        </div>
                        <div className="mt-1 text-11 leading-relaxed text-white/72">
                          {tab.hint}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
