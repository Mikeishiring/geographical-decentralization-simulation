import * as React from 'react'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_SNAPPY } from '../../lib/theme'

export type TabId = 'explore' | 'paper' | 'results' | 'community'

interface TabNavProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  onTabIntent?: (tab: TabId) => void
}

const tabs: { id: TabId; label: string; shortLabel: string; hint: string }[] = [
  { id: 'explore', label: 'Explore', shortLabel: 'Explore', hint: 'Canonical claims, guided readings, and note drafting' },
  { id: 'paper', label: 'Paper', shortLabel: 'Paper', hint: 'Full paper with reading guide & argument map' },
  { id: 'results', label: 'Results', shortLabel: 'Results', hint: 'Published replay workspace and exact-run reproduction' },
  { id: 'community', label: 'Community', shortLabel: 'Community', hint: 'Published human notes over paper and exact-run evidence' },
]

export function TabNav({ activeTab, onTabChange, onTabIntent }: TabNavProps) {
  const tabRefs = React.useRef<Map<TabId, HTMLButtonElement>>(new Map())
  const [hoveredTab, setHoveredTab] = useState<TabId | null>(null)

  React.useEffect(() => {
    tabRefs.current.get(activeTab)?.focus()
  }, [activeTab])

  return (
    <div className="sticky top-0 z-20 border-b border-rule bg-white/92 backdrop-blur-lg">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 overflow-x-auto hide-scrollbar">
        <nav className="flex gap-0.5 min-w-max" role="tablist" aria-label="Explorer sections">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id
            const isHovered = hoveredTab === tab.id
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
                  onFocus={() => onTabIntent?.(tab.id)}
                  onKeyDown={e => {
                    const currentIndex = tabs.findIndex(t => t.id === tab.id)
                    if (e.key === 'ArrowRight') {
                      e.preventDefault()
                      const next = tabs[(currentIndex + 1) % tabs.length]
                      onTabChange(next.id)
                    } else if (e.key === 'ArrowLeft') {
                      e.preventDefault()
                      const prev = tabs[(currentIndex - 1 + tabs.length) % tabs.length]
                      onTabChange(prev.id)
                    }
                  }}
                  aria-label={tab.label}
                  aria-selected={isActive}
                  tabIndex={isActive ? 0 : -1}
                  className={cn(
                    'relative flex items-center gap-1.5 px-3 py-2.5 text-[0.8125rem] transition-colors',
                    isActive
                      ? 'text-text-primary font-medium'
                      : 'text-muted hover:text-text-primary',
                  )}
                >
                  {isActive && (
                    <motion.span
                      className="w-1.5 h-1.5 rounded-full bg-accent shrink-0"
                      layoutId="tab-dot"
                      transition={SPRING}
                    />
                  )}
                  <span className="text-xs sm:text-sm">{tab.shortLabel}</span>

                  {/* Hover background pill */}
                  {isHovered && !isActive && (
                    <motion.div
                      layoutId="tab-hover-bg"
                      className="absolute inset-x-1 inset-y-1.5 rounded-md bg-surface-active -z-10"
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
                      className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-30 whitespace-nowrap pointer-events-none"
                    >
                      <div className="relative rounded-md bg-[#111]/92 px-2.5 py-1.5 text-[0.6875rem] text-white/85 shadow-lg">
                        {tab.hint}
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
