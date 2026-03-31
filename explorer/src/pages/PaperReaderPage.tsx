import { useCallback, useEffect, useState } from 'react'
import { PAPER_SECTIONS } from '../data/paper-sections'
import { createExploration, publishExploration } from '../lib/api'
import { PaperViewModeBar, type ReaderMode } from '../components/paper/PaperViewModeBar'
import { EditorialView } from '../components/paper/EditorialView'
import { ArgumentMapView } from '../components/paper/ArgumentMapView'
import { FullTextView } from '../components/paper/FullTextView'
import { SelectionPopover } from '../components/community/SelectionPopover'
import { useTextSelection } from '../hooks/useTextSelection'
import type { TextAnchor } from '../types/anchors'
import type { TabId } from '../components/layout/TabNav'

interface PaperReaderPageProps {
  readonly isActive?: boolean
  readonly onOpenCommunityExploration?: (explorationId: string) => void
  readonly onTabChange?: (tab: TabId) => void
}

export function PaperReaderPage({
  isActive = true,
  onOpenCommunityExploration,
  onTabChange,
}: PaperReaderPageProps) {
  const [readerMode, setReaderMode] = useState<ReaderMode>(() => {
    const stored = window.localStorage.getItem('paper-reader-mode')
    if (stored === 'focus' || stored === 'argument-map' || stored === 'paper') return stored
    return 'editorial'
  })

  const [activeSectionId, setActiveSectionId] = useState<string>(() => {
    const initialHash = window.location.hash.replace('#', '')
    return PAPER_SECTIONS.some(section => section.id === initialHash)
      ? initialHash
      : PAPER_SECTIONS[0].id
  })

  const [guideOpen, setGuideOpen] = useState(false)

  // Text selection for community notes
  const { containerRef, selection, selectionRect, clearSelection } = useTextSelection(readerMode)

  const handleAddNote = useCallback(async (anchor: TextAnchor) => {
    try {
      const section = anchor.sectionId
        ? PAPER_SECTIONS.find(s => s.id === anchor.sectionId)
        : null

      const created = await createExploration({
        query: section?.title ?? 'Community note',
        summary: `Selected text: "${anchor.excerpt.slice(0, 120)}${anchor.excerpt.length > 120 ? '...' : ''}"`,
        blocks: section ? [...section.blocks.slice(0, 2)] : [],
        followUps: [],
        model: '',
        cached: false,
        surface: 'reading',
        anchor,
      })

      // Auto-publish as a community note draft
      await publishExploration(created.id, {
        title: `Note on: ${anchor.excerpt.slice(0, 60)}${anchor.excerpt.length > 60 ? '...' : ''}`,
        takeaway: anchor.excerpt,
      })

      clearSelection()
      window.getSelection()?.removeAllRanges()

      // Navigate to community tab to see the note
      onTabChange?.('community')
    } catch {
      // Silently fail — user can retry
    }
  }, [clearSelection, onTabChange])

  // Persist mode to localStorage
  useEffect(() => {
    window.localStorage.setItem('paper-reader-mode', readerMode)
  }, [readerMode])

  // Scroll to hash on mount
  useEffect(() => {
    const initialHash = window.location.hash.replace('#', '')
    if (!initialHash) return

    const target = document.getElementById(initialHash)
    if (!target) return

    const raf = window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })

    return () => window.cancelAnimationFrame(raf)
  }, [])

  // Intersection observer for active section tracking
  useEffect(() => {
    const sections = PAPER_SECTIONS
      .map(section => document.getElementById(section.id))
      .filter((element): element is HTMLElement => element instanceof HTMLElement)

    if (sections.length === 0) return

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(entry => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)

        if (visible[0]?.target.id) {
          setActiveSectionId(visible[0].target.id)
        }
      },
      {
        rootMargin: '-22% 0px -55% 0px',
        threshold: [0.15, 0.35, 0.6],
      },
    )

    sections.forEach(section => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  // Sync hash with active section
  useEffect(() => {
    if (!activeSectionId) return
    const url = new URL(window.location.href)
    url.hash = activeSectionId
    window.history.replaceState({}, '', url.toString())
  }, [activeSectionId])

  const activeSectionIndex = Math.max(
    0,
    PAPER_SECTIONS.findIndex(section => section.id === activeSectionId),
  )

  return (
    <div ref={containerRef} className="space-y-6 overflow-x-hidden">
      {/* Text selection popover for community notes */}
      <SelectionPopover
        anchor={selection}
        rect={selectionRect}
        onAddNote={handleAddNote}
        onDismiss={clearSelection}
      />

      {/* Sticky reading-mode bar */}
      <PaperViewModeBar
        readerMode={readerMode}
        onModeChange={setReaderMode}
        activeSectionIndex={activeSectionIndex}
        guideOpen={guideOpen}
        onGuideToggle={() => setGuideOpen(prev => !prev)}
        onSectionClick={setActiveSectionId}
        onTabChange={onTabChange}
      />

      {/* Active view */}
      {readerMode === 'argument-map' ? (
        <ArgumentMapView />
      ) : readerMode === 'paper' ? (
        <FullTextView />
      ) : (
        <EditorialView
          isActive={isActive}
          focusMode={readerMode === 'focus'}
          activeSectionId={activeSectionId}
          onSectionClick={setActiveSectionId}
          onOpenCommunityExploration={onOpenCommunityExploration}
          onTabChange={onTabChange}
        />
      )}
    </div>
  )
}
