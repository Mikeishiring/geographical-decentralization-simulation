import * as React from 'react'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, FileText, FlaskConical, BarChart3, Users } from 'lucide-react'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_SNAPPY } from '../../lib/theme'

export type TabId = 'paper' | 'original' | 'results' | 'agent' | 'community'

interface TabNavProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  onTabIntent?: (tab: TabId) => void
}

const tabs: { id: TabId; label: string; icon: typeof BookOpen; hint: string }[] = [
  { id: 'paper', label: 'Paper', icon: BookOpen, hint: 'Editorial reading with visual evidence and community annotations' },
  { id: 'original', label: 'Original', icon: FileText, hint: 'Full PDF with dark mode and annotation tools' },
  { id: 'results', label: 'Results', icon: BarChart3, hint: 'Simulation lab — run scenarios, compare paradigms, export artifacts' },
  { id: 'agent', label: 'Agent', icon: FlaskConical, hint: 'Ask questions and run autonomous research loops' },
  { id: 'community', label: 'Community', icon: Users, hint: 'Published human notes over paper and exact-run evidence' },
]

export function TabNav({ activeTab, onTabChange, onTabIntent }: TabNavProps) {
  const tabRefs = React.useRef<Map<TabId, HTMLButtonElement>>(new Map())
  const [hoveredTab, setHoveredTab] = useState<TabId | null>(null)

  return (
    <div className="sticky top-0 z-20 border-b border-rule bg-white/92 backdrop-blur-lg shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 overflow-x-auto hide-scrollbar">
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
                    'relative flex items-center gap-2 px-3.5 py-3 text-13 transition-colors',
                    isActive
                      ? 'text-text-primary font-medium'
                      : 'text-muted hover:text-text-primary',
                  )}
                >
                  <Icon className={cn(
                    'h-3.5 w-3.5 shrink-0 transition-colors',
                    isActive ? 'text-accent' : 'text-muted/60',
                  )} />
                  <span className="text-xs sm:text-sm">{tab.label}</span>

                  {/* Hover background pill */}
                  {isHovered && !isActive && (
                    <motion.div
                      layoutId="tab-hover-bg"
                      className="absolute inset-x-1 inset-y-1.5 rounded-lg bg-surface-active -z-10"
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
                      <div className="relative rounded-lg bg-text-primary/92 px-3 py-2 text-11 text-white/90 shadow-lg backdrop-blur-sm">
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
