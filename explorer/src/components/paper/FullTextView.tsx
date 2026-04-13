import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import {
  Sun,
  Moon,
  ExternalLink,
  ChevronUp,
  ZoomIn,
  ZoomOut,
  Highlighter,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { SPRING_SNAPPY, SPRING_CRISP } from '../../lib/theme'
import { getStudyPdfUrl } from './paper-helpers'
import { useFadeOnIdle } from '../../hooks/useFadeOnIdle'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const LOCAL_PDF_URL = '/paper.pdf'
const ARXIV_PDF_URL = getStudyPdfUrl()
const THEME_STORAGE_KEY = 'paper-viewer-theme'

const ZOOM_STEPS = [0.6, 0.75, 0.9, 1.0, 1.15, 1.3, 1.5] as const
const DEFAULT_ZOOM_INDEX = 3
const PDF_TOOLBAR_TOP = 'calc(var(--explorer-tab-nav-height, 3.75rem) + var(--explorer-paper-mode-bar-height, 4.75rem) + 0.5rem)'

interface FullTextViewProps {
  readonly initialPage?: number
}

export function FullTextView({ initialPage }: FullTextViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const [numPages, setNumPages] = useState(0)
  const [pdfError, setPdfError] = useState(false)
  const [pdfLoadKey, setPdfLoadKey] = useState(0)
  const [currentPage, setCurrentPage] = useState(initialPage ?? 1)
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX)
  const zoom = ZOOM_STEPS[zoomIndex]

  const [darkMode, setDarkMode] = useState(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'dark'
  })

  const { visible: chromeVisible, show: showChrome } = useFadeOnIdle(containerRef, {
    enabled: true,
    idleMs: 3000,
  })

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light')
  }, [darkMode])

  const handleDocumentLoadSuccess = useCallback(({ numPages: total }: { numPages: number }) => {
    setNumPages(total)
    setPdfError(false)
  }, [])

  useEffect(() => {
    if (numPages > 0 || pdfError) return
    const timer = setTimeout(() => setPdfError(true), 15_000)
    return () => clearTimeout(timer)
  }, [numPages, pdfError])

  useEffect(() => {
    if (!initialPage || numPages === 0) return
    const scrollEl = scrollRef.current
    if (!scrollEl) return
    const target = scrollEl.querySelector(`[data-page="${initialPage}"]`)
    if (!target) return
    const raf = window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
    return () => window.cancelAnimationFrame(raf)
  }, [initialPage, numPages])

  const handleZoomIn = useCallback(() => {
    setZoomIndex(prev => Math.min(prev + 1, ZOOM_STEPS.length - 1))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoomIndex(prev => Math.max(prev - 1, 0))
  }, [])

  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl || numPages === 0) return

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(entry => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)

        if (visible[0]?.target instanceof HTMLElement) {
          const page = parseInt(visible[0].target.dataset.page ?? '1', 10)
          setCurrentPage(page)
        }
      },
      { root: scrollEl, threshold: [0.3, 0.6] },
    )

    const pages = scrollEl.querySelectorAll('[data-page]')
    pages.forEach(page => observer.observe(page))
    return () => observer.disconnect()
  }, [numPages, zoom])

  const pageNumbers = useMemo(
    () => Array.from({ length: numPages }, (_, index) => index + 1),
    [numPages],
  )

  return (
    <div ref={containerRef} className="relative space-y-2.5 sm:space-y-4">
      <motion.div
        data-testid="pdf-viewer-toolbar"
        animate={{
          opacity: chromeVisible ? 1 : 0,
          y: chromeVisible ? 0 : -12,
          pointerEvents: chromeVisible ? 'auto' as const : 'none' as const,
        }}
        transition={SPRING_CRISP}
        className="sticky z-30"
        style={{ top: PDF_TOOLBAR_TOP }}
      >
        <div
          className={cn(
            'rounded-[18px] border px-3 py-2 shadow-sm backdrop-blur-md transition-colors sm:px-4 sm:py-2.5',
            darkMode
              ? 'border-white/10 bg-slate-900/95 text-white/90'
              : 'border-rule bg-white/95 text-text-primary',
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 sm:flex-nowrap sm:gap-2">
              <div
                className={cn(
                  'flex items-center gap-0.5 rounded-lg border p-0.5',
                  darkMode ? 'border-white/10 bg-white/5' : 'border-rule bg-surface-active',
                )}
              >
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

              <div
                className={cn(
                  'flex items-center gap-1 rounded-lg border px-1.5 py-0.5',
                  darkMode ? 'border-white/10' : 'border-rule',
                )}
              >
                <button
                  onClick={handleZoomOut}
                  disabled={zoomIndex <= 0}
                  className="p-1 opacity-60 transition-opacity hover:opacity-100 disabled:opacity-20"
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
                  className="p-1 opacity-60 transition-opacity hover:opacity-100 disabled:opacity-20"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="h-3 w-3" />
                </button>
              </div>

              {numPages > 0 && (
                <span className="text-2xs tabular-nums opacity-60">
                  {currentPage}/{numPages}
                </span>
              )}
            </div>

            <a
              href={ARXIV_PDF_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
                darkMode
                  ? 'border-white/10 opacity-60 hover:opacity-90'
                  : 'border-rule text-muted hover:border-border-hover hover:text-text-primary',
              )}
            >
              <ExternalLink className="h-3 w-3" />
              <span className="sm:hidden">PDF</span>
              <span className="hidden sm:inline">arXiv</span>
            </a>
          </div>
        </div>
      </motion.div>

      <div
        className={cn(
          'rounded-xl border px-3 py-2.5 sm:px-4 sm:py-3',
          darkMode
            ? 'border-white/10 bg-slate-900/80 text-white/80'
            : 'border-accent/12 bg-accent/[0.035] text-text-primary',
        )}
      >
        <div className="flex items-start gap-2 sm:gap-2.5">
          <span
            className={cn(
              'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full sm:h-6 sm:w-6',
              darkMode ? 'bg-white/8 text-accent' : 'bg-white text-accent shadow-sm',
            )}
          >
            <Highlighter className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          </span>
          <div>
            <div className="hidden text-[11px] font-medium sm:block sm:text-xs">
              Public community notes on highlighted PDF passages
            </div>
            <p
              className={cn(
                'text-[10.5px] leading-relaxed sm:mt-1 sm:text-xs',
                darkMode ? 'text-white/60' : 'text-muted',
              )}
            >
              <span className="sm:hidden">
                Public notes come from highlighted PDF text. Highlight a passage to publish a community note.
              </span>
              <span className="hidden sm:inline">
                Public notes come from highlighted PDF text. Highlight any passage in the PDF to open a community note tied directly to that source excerpt.
              </span>
            </p>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={cn(
          'relative overflow-y-auto rounded-xl border transition-colors',
          darkMode ? 'border-white/10 bg-slate-950' : 'border-rule bg-neutral-100',
        )}
        style={{ height: 'calc(100vh - clamp(13rem, 28vh, 15rem))' }}
      >
        {numPages === 0 && (
          <div className="flex h-full items-center justify-center">
            <div
              className={cn(
                'text-sm text-center',
                darkMode ? 'text-white/40' : 'text-muted',
              )}
            >
              {pdfError ? (
                <>
                  <div>Failed to load PDF.</div>
                  <button
                    onClick={() => {
                      setPdfError(false)
                      setNumPages(0)
                      setPdfLoadKey(current => current + 1)
                    }}
                    className={cn(
                      'mt-2 text-xs underline underline-offset-2',
                      darkMode ? 'text-white/50 hover:text-white/70' : 'text-muted hover:text-text-primary',
                    )}
                  >
                    Retry
                  </button>
                </>
              ) : (
                <span className="animate-pulse">Loading paper...</span>
              )}
            </div>
          </div>
        )}

        <Document
          key={pdfLoadKey}
          file={LOCAL_PDF_URL}
          onLoadSuccess={handleDocumentLoadSuccess}
          loading={null}
          className="flex flex-col items-center gap-3 py-4 sm:gap-4 sm:py-6"
        >
          {pageNumbers.map(pageNum => (
            <div
              key={pageNum}
              data-page={pageNum}
              className={cn(
                'shadow-md transition-shadow',
                darkMode ? 'shadow-black/30 pdf-page-dark' : 'shadow-black/8',
              )}
            >
              <Page
                pageNumber={pageNum}
                width={Math.min(800, (typeof window !== 'undefined' ? window.innerWidth : 800) - 80) * zoom}
                renderTextLayer
                renderAnnotationLayer
              />
            </div>
          ))}
        </Document>
      </div>

      <AnimatePresence>
        {!chromeVisible && (
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
