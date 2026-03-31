import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sun, Moon, MessageSquarePlus, Trash2, ExternalLink } from 'lucide-react'
import { cn } from '../lib/cn'
import { SPRING, SPRING_SNAPPY } from '../lib/theme'
import { PAPER_METADATA } from '../data/paper-sections'
import type { TabId } from '../components/layout/TabNav'

const ARXIV_PDF_URL = 'https://arxiv.org/pdf/2509.21475'
const LOCAL_PDF_URL = '/paper.pdf'

interface Annotation {
  readonly id: string
  readonly page: number
  readonly text: string
  readonly color: 'accent' | 'accent-warm' | 'success' | 'warning'
  readonly createdAt: number
}

const ANNOTATION_STORAGE_KEY = 'paper-annotations'
const THEME_STORAGE_KEY = 'paper-viewer-theme'

function loadAnnotations(): Annotation[] {
  try {
    const stored = window.localStorage.getItem(ANNOTATION_STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function saveAnnotations(annotations: Annotation[]) {
  window.localStorage.setItem(ANNOTATION_STORAGE_KEY, JSON.stringify(annotations))
}

const ANNOTATION_COLORS: { id: Annotation['color']; label: string; cssClass: string }[] = [
  { id: 'accent', label: 'Blue', cssClass: 'bg-accent' },
  { id: 'accent-warm', label: 'Terracotta', cssClass: 'bg-accent-warm' },
  { id: 'success', label: 'Green', cssClass: 'bg-success' },
  { id: 'warning', label: 'Amber', cssClass: 'bg-warning' },
]

export function OriginalPaperPage({ onTabChange }: { onTabChange?: (tab: TabId) => void }) {
  const [darkMode, setDarkMode] = useState(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'dark'
  })
  const [annotations, setAnnotations] = useState<Annotation[]>(loadAnnotations)
  const [showAnnotationForm, setShowAnnotationForm] = useState(false)
  const [newAnnotation, setNewAnnotation] = useState({ text: '', color: 'accent' as Annotation['color'], page: 1 })
  const [showAnnotations, setShowAnnotations] = useState(true)

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    saveAnnotations(annotations)
  }, [annotations])

  const handleAddAnnotation = useCallback(() => {
    if (!newAnnotation.text.trim()) return

    const annotation: Annotation = {
      id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      page: newAnnotation.page,
      text: newAnnotation.text.trim(),
      color: newAnnotation.color,
      createdAt: Date.now(),
    }

    setAnnotations(prev => [...prev, annotation])
    setNewAnnotation({ text: '', color: 'accent', page: 1 })
    setShowAnnotationForm(false)
  }, [newAnnotation])

  const handleDeleteAnnotation = useCallback((id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id))
  }, [])

  // Use local PDF if available, fall back to arXiv
  const pdfSrc = LOCAL_PDF_URL

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="reveal-up">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
              Original publication
            </span>
            <h1 className="mt-1 text-xl font-medium text-text-primary font-serif">
              {PAPER_METADATA.title}
            </h1>
            <p className="mt-1 text-sm text-muted">{PAPER_METADATA.citation}</p>
            <p className="mt-2 text-xs text-muted">
              View the exact published paper — no editorial changes. Add your own annotations and switch between light and dark reading modes.
            </p>
          </div>
          {onTabChange && (
            <button
              onClick={() => onTabChange('paper')}
              className="arrow-link shrink-0"
            >
              Back to editorial view
            </button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="reveal-up flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          {/* Dark/Light mode toggle */}
          <div className="flex items-center gap-0.5 rounded-lg border border-rule bg-surface-active p-1">
            <motion.button
              onClick={() => setDarkMode(false)}
              whileTap={{ scale: 0.96 }}
              transition={SPRING_SNAPPY}
              className={cn(
                'relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors',
                !darkMode ? 'text-text-primary font-medium' : 'text-muted hover:text-text-primary',
              )}
            >
              {!darkMode && (
                <motion.span
                  layoutId="theme-pill"
                  className="absolute inset-0 rounded-md bg-white shadow-sm ring-1 ring-black/[0.04]"
                  transition={SPRING_SNAPPY}
                />
              )}
              <span className="relative flex items-center gap-1.5">
                <Sun className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Light</span>
              </span>
            </motion.button>
            <motion.button
              onClick={() => setDarkMode(true)}
              whileTap={{ scale: 0.96 }}
              transition={SPRING_SNAPPY}
              className={cn(
                'relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors',
                darkMode ? 'text-text-primary font-medium' : 'text-muted hover:text-text-primary',
              )}
            >
              {darkMode && (
                <motion.span
                  layoutId="theme-pill"
                  className="absolute inset-0 rounded-md bg-white shadow-sm ring-1 ring-black/[0.04]"
                  transition={SPRING_SNAPPY}
                />
              )}
              <span className="relative flex items-center gap-1.5">
                <Moon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Dark</span>
              </span>
            </motion.button>
          </div>

          {/* Annotation toggle */}
          <button
            onClick={() => setShowAnnotations(prev => !prev)}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors',
              showAnnotations
                ? 'border-accent/30 bg-accent/5 text-accent'
                : 'border-rule text-muted hover:text-text-primary',
            )}
          >
            <MessageSquarePlus className="h-3 w-3" />
            Notes ({annotations.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAnnotationForm(prev => !prev)}
            className="flex items-center gap-1.5 rounded-md border border-rule px-3 py-1.5 text-xs text-muted hover:text-text-primary hover:border-border-hover transition-colors"
          >
            <MessageSquarePlus className="h-3 w-3" />
            Add note
          </button>
          <a
            href={ARXIV_PDF_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-md border border-rule px-3 py-1.5 text-xs text-muted hover:text-text-primary hover:border-border-hover transition-colors shrink-0"
          >
            <ExternalLink className="h-3 w-3" />
            arXiv
          </a>
        </div>
      </div>

      {/* Annotation form */}
      <AnimatePresence>
        {showAnnotationForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-rule bg-white px-5 py-4">
              <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">New annotation</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                <textarea
                  value={newAnnotation.text}
                  onChange={e => setNewAnnotation(prev => ({ ...prev, text: e.target.value }))}
                  placeholder="Your note about this section of the paper..."
                  className="w-full rounded-lg border border-rule bg-surface-active px-3 py-2 text-sm text-text-primary placeholder:text-text-faint focus:border-accent focus:outline-none resize-none"
                  rows={2}
                />
                <div className="flex flex-col gap-2">
                  <label className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Page</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={newAnnotation.page}
                    onChange={e => setNewAnnotation(prev => ({ ...prev, page: parseInt(e.target.value, 10) || 1 }))}
                    className="w-16 rounded-lg border border-rule bg-surface-active px-2 py-1.5 text-sm text-text-primary text-center focus:border-accent focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Color</label>
                  <div className="flex gap-1.5">
                    {ANNOTATION_COLORS.map(color => (
                      <button
                        key={color.id}
                        onClick={() => setNewAnnotation(prev => ({ ...prev, color: color.id }))}
                        title={color.label}
                        className={cn(
                          'h-6 w-6 rounded-full transition-all',
                          color.cssClass,
                          newAnnotation.color === color.id ? 'ring-2 ring-offset-2 ring-text-primary scale-110' : 'opacity-50 hover:opacity-80',
                        )}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() => setShowAnnotationForm(false)}
                  className="rounded-md border border-rule px-3 py-1.5 text-xs text-muted hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddAnnotation}
                  disabled={!newAnnotation.text.trim()}
                  className="rounded-md bg-accent px-3 py-1.5 text-xs text-white transition-opacity disabled:opacity-40"
                >
                  Save note
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content area */}
      <div className={cn('grid gap-6', showAnnotations && annotations.length > 0 ? 'lg:grid-cols-[1fr_280px]' : '')}>
        {/* PDF Viewer */}
        <div
          className={cn(
            'rounded-xl border overflow-hidden transition-colors',
            darkMode
              ? 'border-white/10 bg-[#1a1a2e]'
              : 'border-rule bg-surface-active',
          )}
          style={{ height: 'calc(100vh - 14rem)' }}
        >
          <div className={cn(
            'w-full h-full transition-all',
            darkMode && 'invert hue-rotate-180',
          )}>
            <iframe
              src={pdfSrc}
              title="Paper PDF — Geographical Centralization Resilience in Ethereum's Block-Building Paradigms"
              className="w-full h-full border-0"
              loading="lazy"
            />
          </div>
        </div>

        {/* Annotations sidebar */}
        {showAnnotations && annotations.length > 0 && (
          <div className="space-y-3">
            <div className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
              Your annotations ({annotations.length})
            </div>
            <div className="stagger-reveal space-y-2 max-h-[calc(100vh-18rem)] overflow-y-auto">
              {[...annotations].sort((a, b) => a.page - b.page).map(annotation => (
                <div
                  key={annotation.id}
                  className="group rounded-lg border border-rule bg-white px-3 py-2.5 transition-colors hover:border-border-hover"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'h-2 w-2 rounded-full',
                        annotation.color === 'accent' && 'bg-accent',
                        annotation.color === 'accent-warm' && 'bg-accent-warm',
                        annotation.color === 'success' && 'bg-success',
                        annotation.color === 'warning' && 'bg-warning',
                      )} />
                      <span className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">
                        Page {annotation.page}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteAnnotation(annotation.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted hover:text-danger transition-all"
                      title="Delete annotation"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs leading-5 text-text-primary">
                    {annotation.text}
                  </p>
                  <div className="mt-1 text-[0.6rem] text-text-faint">
                    {new Date(annotation.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
