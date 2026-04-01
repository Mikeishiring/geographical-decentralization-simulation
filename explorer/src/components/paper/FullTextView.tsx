import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import {
  Sun, Moon, MessageSquarePlus, Trash2, ExternalLink,
  ChevronUp, ZoomIn, ZoomOut,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { SPRING, SPRING_SNAPPY, SPRING_CRISP } from '../../lib/theme'
import { getStudyPdfUrl } from './paper-helpers'
import { useFadeOnIdle } from '../../hooks/useFadeOnIdle'

// Configure pdf.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const LOCAL_PDF_URL = '/paper.pdf'
const ARXIV_PDF_URL = getStudyPdfUrl()

/* ── Annotations ──────────────────────────────── */

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

/* ── Zoom presets ──────────────────────────────── */

const ZOOM_STEPS = [0.6, 0.75, 0.9, 1.0, 1.15, 1.3, 1.5] as const
const DEFAULT_ZOOM_INDEX = 3 // 1.0

/* ── Component ────────────────────────────────── */

interface FullTextViewProps {
  /** When set, scroll to this page once the PDF loads */
  readonly initialPage?: number
}

export function FullTextView({ initialPage }: FullTextViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // PDF state
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(initialPage ?? 1)
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX)
  const zoom = ZOOM_STEPS[zoomIndex]

  // Theme
  const [darkMode, setDarkMode] = useState(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'dark'
  })

  // Annotations
  const [annotations, setAnnotations] = useState<Annotation[]>(loadAnnotations)
  const [showAnnotationForm, setShowAnnotationForm] = useState(false)
  const [newAnnotation, setNewAnnotation] = useState({ text: '', color: 'accent' as Annotation['color'], page: 1 })
  const [showAnnotations, setShowAnnotations] = useState(true)

  // Fade-on-idle (disabled when annotation form is open)
  const { visible: chromeVisible, show: showChrome } = useFadeOnIdle(containerRef, {
    enabled: !showAnnotationForm,
    idleMs: 3000,
  })

  // Persist theme
  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light')
  }, [darkMode])

  // Persist annotations
  useEffect(() => {
    saveAnnotations(annotations)
  }, [annotations])

  const handleDocumentLoadSuccess = useCallback(({ numPages: total }: { numPages: number }) => {
    setNumPages(total)
  }, [])

  // Scroll to initialPage once the PDF renders
  useEffect(() => {
    if (!initialPage || numPages === 0) return
    const scrollEl = scrollRef.current
    if (!scrollEl) return
    const target = scrollEl.querySelector(`[data-page="${initialPage}"]`)
    if (!target) return
    // Small delay to let react-pdf render the page element
    const raf = window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
    return () => window.cancelAnimationFrame(raf)
    // Only run when PDF first loads, not on every initialPage change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages])

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

  const handleZoomIn = useCallback(() => {
    setZoomIndex(prev => Math.min(prev + 1, ZOOM_STEPS.length - 1))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoomIndex(prev => Math.max(prev - 1, 0))
  }, [])

  // Track current page via intersection observer on page elements
  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl || numPages === 0) return

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible[0]?.target instanceof HTMLElement) {
          const page = parseInt(visible[0].target.dataset.page ?? '1', 10)
          setCurrentPage(page)
        }
      },
      { root: scrollEl, threshold: [0.3, 0.6] },
    )

    const pages = scrollEl.querySelectorAll('[data-page]')
    pages.forEach(p => observer.observe(p))
    return () => observer.disconnect()
  }, [numPages, zoom])

  // Page array for rendering
  const pageNumbers = useMemo(
    () => Array.from({ length: numPages }, (_, i) => i + 1),
    [numPages],
  )

  const hasAnnotations = showAnnotations && annotations.length > 0

  return (
    <div ref={containerRef} className="relative space-y-4">
      {/* ── Floating toolbar ── */}
      <motion.div
        animate={{
          opacity: chromeVisible ? 1 : 0,
          y: chromeVisible ? 0 : -12,
          pointerEvents: chromeVisible ? 'auto' as const : 'none' as const,
        }}
        transition={SPRING_CRISP}
        className="sticky top-[7.5rem] z-30"
      >
        <div className={cn(
          'flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2.5 shadow-sm backdrop-blur-md transition-colors',
          darkMode
            ? 'border-white/10 bg-slate-900/95 text-white/90'
            : 'border-rule bg-white/95 text-text-primary',
        )}>
          <div className="flex items-center gap-2">
            {/* Dark/Light toggle */}
            <div className={cn(
              'flex items-center gap-0.5 rounded-lg border p-0.5',
              darkMode ? 'border-white/10 bg-white/5' : 'border-rule bg-surface-active',
            )}>
              <motion.button
                onClick={() => setDarkMode(false)}
                whileTap={{ scale: 0.96 }}
                transition={SPRING_SNAPPY}
                className={cn(
                  'relative flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors',
                  !darkMode ? 'font-medium' : 'opacity-60 hover:opacity-90',
                )}
              >
                {!darkMode && (
                  <motion.span
                    layoutId="pdf-theme-pill"
                    className={cn(
                      'absolute inset-0 rounded-md shadow-sm ring-1',
                      darkMode ? 'bg-white/10 ring-white/10' : 'bg-white ring-rule',
                    )}
                    transition={SPRING_SNAPPY}
                  />
                )}
                <span className="relative flex items-center gap-1">
                  <Sun className="h-3 w-3" />
                  <span className="hidden sm:inline">Light</span>
                </span>
              </motion.button>
              <motion.button
                onClick={() => setDarkMode(true)}
                whileTap={{ scale: 0.96 }}
                transition={SPRING_SNAPPY}
                className={cn(
                  'relative flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors',
                  darkMode ? 'font-medium' : 'opacity-60 hover:opacity-90',
                )}
              >
                {darkMode && (
                  <motion.span
                    layoutId="pdf-theme-pill"
                    className={cn(
                      'absolute inset-0 rounded-md shadow-sm ring-1',
                      darkMode ? 'bg-white/10 ring-white/10' : 'bg-white ring-rule',
                    )}
                    transition={SPRING_SNAPPY}
                  />
                )}
                <span className="relative flex items-center gap-1">
                  <Moon className="h-3 w-3" />
                  <span className="hidden sm:inline">Dark</span>
                </span>
              </motion.button>
            </div>

            {/* Zoom controls */}
            <div className={cn(
              'flex items-center gap-1 rounded-lg border px-1.5 py-0.5',
              darkMode ? 'border-white/10' : 'border-rule',
            )}>
              <button
                onClick={handleZoomOut}
                disabled={zoomIndex <= 0}
                className="p-1 opacity-60 hover:opacity-100 disabled:opacity-20 transition-opacity"
                aria-label="Zoom out"
              >
                <ZoomOut className="h-3 w-3" />
              </button>
              <span className="w-9 text-center text-2xs tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                disabled={zoomIndex >= ZOOM_STEPS.length - 1}
                className="p-1 opacity-60 hover:opacity-100 disabled:opacity-20 transition-opacity"
                aria-label="Zoom in"
              >
                <ZoomIn className="h-3 w-3" />
              </button>
            </div>

            {/* Page indicator */}
            {numPages > 0 && (
              <span className="text-2xs tabular-nums opacity-60">
                {currentPage}/{numPages}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Notes toggle */}
            <button
              onClick={() => setShowAnnotations(prev => !prev)}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors',
                showAnnotations
                  ? darkMode
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-accent/30 bg-accent/5 text-accent'
                  : darkMode
                    ? 'border-white/10 opacity-60 hover:opacity-90'
                    : 'border-rule text-muted hover:text-text-primary',
              )}
            >
              <MessageSquarePlus className="h-3 w-3" />
              Notes ({annotations.length})
            </button>

            {/* Add note */}
            <button
              onClick={() => {
                setShowAnnotationForm(prev => !prev)
                showChrome()
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors',
                darkMode
                  ? 'border-white/10 opacity-60 hover:opacity-90'
                  : 'border-rule text-muted hover:text-text-primary hover:border-border-hover',
              )}
            >
              <MessageSquarePlus className="h-3 w-3" />
              Add note
            </button>

            {/* arXiv link */}
            <a
              href={ARXIV_PDF_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors shrink-0',
                darkMode
                  ? 'border-white/10 opacity-60 hover:opacity-90'
                  : 'border-rule text-muted hover:text-text-primary hover:border-border-hover',
              )}
            >
              <ExternalLink className="h-3 w-3" />
              arXiv
            </a>
          </div>
        </div>
      </motion.div>

      {/* ── Annotation form (expands below toolbar) ── */}
      <AnimatePresence>
        {showAnnotationForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING}
            className="overflow-hidden"
          >
            <div className={cn(
              'rounded-xl border px-5 py-4',
              darkMode ? 'border-white/10 bg-slate-900' : 'border-rule bg-white',
            )}>
              <div className={cn(
                'text-2xs font-medium uppercase tracking-[0.1em]',
                darkMode ? 'text-white/40' : 'text-text-faint',
              )}>New annotation</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                <textarea
                  value={newAnnotation.text}
                  onChange={e => setNewAnnotation(prev => ({ ...prev, text: e.target.value }))}
                  placeholder="Your note about this section of the paper..."
                  className={cn(
                    'w-full rounded-lg border px-3 py-2 text-sm placeholder:opacity-40 focus:border-accent focus:outline-none resize-none',
                    darkMode
                      ? 'border-white/10 bg-white/5 text-white placeholder:text-white/30'
                      : 'border-rule bg-surface-active text-text-primary placeholder:text-text-faint',
                  )}
                  rows={2}
                />
                <div className="flex flex-col gap-2">
                  <label className={cn(
                    'text-2xs font-medium uppercase tracking-[0.1em]',
                    darkMode ? 'text-white/40' : 'text-text-faint',
                  )}>Page</label>
                  <input
                    type="number"
                    min={1}
                    max={numPages || 30}
                    value={newAnnotation.page}
                    onChange={e => setNewAnnotation(prev => ({ ...prev, page: parseInt(e.target.value, 10) || 1 }))}
                    className={cn(
                      'w-16 rounded-lg border px-2 py-1.5 text-sm text-center focus:border-accent focus:outline-none',
                      darkMode
                        ? 'border-white/10 bg-white/5 text-white'
                        : 'border-rule bg-surface-active text-text-primary',
                    )}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className={cn(
                    'text-2xs font-medium uppercase tracking-[0.1em]',
                    darkMode ? 'text-white/40' : 'text-text-faint',
                  )}>Color</label>
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
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-xs transition-colors',
                    darkMode
                      ? 'border-white/10 text-white/60 hover:text-white'
                      : 'border-rule text-muted hover:text-text-primary',
                  )}
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

      {/* ── Main content area ── */}
      <div className={cn('grid gap-4', hasAnnotations ? 'lg:grid-cols-[1fr_260px]' : '')}>
        {/* PDF pages */}
        <div
          ref={scrollRef}
          className={cn(
            'relative overflow-y-auto rounded-xl border transition-colors',
            darkMode
              ? 'border-white/10 bg-slate-950'
              : 'border-rule bg-neutral-100',
          )}
          style={{ height: 'calc(100vh - 14rem)' }}
        >
          {/* Loading state */}
          {numPages === 0 && (
            <div className="flex h-full items-center justify-center">
              <div className={cn(
                'text-sm animate-pulse',
                darkMode ? 'text-white/40' : 'text-muted',
              )}>
                Loading paper...
              </div>
            </div>
          )}

          <Document
            file={LOCAL_PDF_URL}
            onLoadSuccess={handleDocumentLoadSuccess}
            loading={null}
            className="flex flex-col items-center gap-4 py-6"
          >
            {pageNumbers.map(pageNum => (
              <div
                key={pageNum}
                data-page={pageNum}
                className={cn(
                  'shadow-md transition-shadow',
                  darkMode ? 'shadow-black/30' : 'shadow-black/8',
                )}
              >
                <Page
                  pageNumber={pageNum}
                  width={Math.min(800, (typeof window !== 'undefined' ? window.innerWidth : 800) - 80) * zoom}
                  renderTextLayer
                  renderAnnotationLayer
                  canvasBackground={darkMode ? '#1e1e2e' : '#ffffff'}
                />
              </div>
            ))}
          </Document>
        </div>

        {/* ── Annotations sidebar ── */}
        <AnimatePresence>
          {hasAnnotations && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{
                opacity: chromeVisible ? 1 : 0.15,
                x: 0,
              }}
              exit={{ opacity: 0, x: 20 }}
              transition={SPRING_CRISP}
              className="space-y-3"
              onMouseEnter={showChrome}
            >
              <div className={cn(
                'text-2xs font-medium uppercase tracking-[0.1em]',
                darkMode ? 'text-white/40' : 'text-text-faint',
              )}>
                Your annotations ({annotations.length})
              </div>
              <div className="stagger-reveal space-y-2 max-h-[calc(100vh-18rem)] overflow-y-auto">
                {[...annotations].sort((a, b) => a.page - b.page).map(annotation => (
                  <div
                    key={annotation.id}
                    className={cn(
                      'group rounded-lg border px-3 py-2.5 transition-colors',
                      darkMode
                        ? 'border-white/10 bg-slate-900 hover:border-white/20'
                        : 'border-rule bg-white hover:border-border-hover',
                    )}
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
                        <button
                          onClick={() => {
                            const pageEl = scrollRef.current?.querySelector(`[data-page="${annotation.page}"]`)
                            pageEl?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          }}
                          className={cn(
                            'text-2xs font-medium uppercase tracking-[0.1em] hover:underline',
                            darkMode ? 'text-white/40' : 'text-text-faint',
                          )}
                        >
                          Page {annotation.page}
                        </button>
                      </div>
                      <button
                        onClick={() => handleDeleteAnnotation(annotation.id)}
                        className={cn(
                          'opacity-0 group-hover:opacity-100 transition-all',
                          darkMode ? 'text-white/40 hover:text-red-400' : 'text-muted hover:text-danger',
                        )}
                        aria-label="Delete annotation"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <p className={cn(
                      'mt-1.5 text-xs leading-5',
                      darkMode ? 'text-white/80' : 'text-text-primary',
                    )}>
                      {annotation.text}
                    </p>
                    <div className={cn(
                      'mt-1 text-[0.6rem]',
                      darkMode ? 'text-white/25' : 'text-text-faint',
                    )}>
                      {new Date(annotation.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Fade-in handle when chrome is hidden ── */}
      <AnimatePresence>
        {!chromeVisible && !showAnnotationForm && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={SPRING_SNAPPY}
            onClick={showChrome}
            className={cn(
              'fixed bottom-6 right-6 z-40 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs shadow-lg backdrop-blur-md transition-colors',
              darkMode
                ? 'border-white/10 bg-slate-900/90 text-white/60 hover:text-white'
                : 'border-rule bg-white/90 text-muted hover:text-text-primary',
            )}
            aria-label="Show controls"
          >
            <ChevronUp className="h-3 w-3" />
            Controls
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
