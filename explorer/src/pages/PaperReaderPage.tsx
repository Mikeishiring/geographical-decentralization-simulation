import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { SPRING_SOFT } from '../lib/theme'
import { PAPER_METADATA, PAPER_SECTIONS } from '../data/paper-sections'
import { createExploration, publishExploration, listExplorations, type Exploration } from '../lib/api'
import { MOCK_COMMUNITY_NOTES } from '../data/mock-community-notes'
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
  const queryClient = useQueryClient()

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
  const [notesVisible, setNotesVisible] = useState(true)

  // Text selection for community notes
  const { containerRef, selection, selectionRect, clearSelection } = useTextSelection(readerMode)

  // Fetch published reading notes for inline display
  const notesQuery = useQuery({
    queryKey: ['explorations', 'reading-notes'],
    queryFn: () => listExplorations({ publishedOnly: true, surface: 'reading', limit: 100 }),
    enabled: isActive,
    staleTime: 30_000,
    refetchInterval: isActive ? 60_000 : false,
  })

  // Use real notes when available, fall back to mock data for demo
  const resolvedNotes = useMemo(() => {
    const real = notesQuery.data ?? []
    return real.length > 0 ? real : [...MOCK_COMMUNITY_NOTES]
  }, [notesQuery.data])

  // Group notes by sectionId
  const notesBySection = useMemo(() => {
    const map = new Map<string, Exploration[]>()
    for (const note of resolvedNotes) {
      const sectionId = note.anchor?.sectionId
      if (!sectionId) continue
      const existing = map.get(sectionId) ?? []
      map.set(sectionId, [...existing, note])
    }
    return map
  }, [resolvedNotes])

  const totalNoteCount = resolvedNotes.length

  const selectionSectionNoteCount = selection?.sectionId
    ? (notesBySection.get(selection.sectionId)?.length ?? 0)
    : 0

  const handleAddNote = useCallback(async (anchor: TextAnchor, comment: string) => {
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

      await publishExploration(created.id, {
        title: `Note on: ${anchor.excerpt.slice(0, 60)}${anchor.excerpt.length > 60 ? '...' : ''}`,
        takeaway: comment,
      })

      clearSelection()
      window.getSelection()?.removeAllRanges()

      // Refresh notes so the new one appears inline
      void queryClient.invalidateQueries({ queryKey: ['explorations'] })
    } catch {
      // Silently fail — user can retry
    }
  }, [clearSelection, queryClient])

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
    <div ref={containerRef} className="space-y-12 overflow-x-hidden">
      {/* Text selection popover for community notes */}
      <SelectionPopover
        anchor={selection}
        rect={selectionRect}
        onAddNote={handleAddNote}
        onDismiss={clearSelection}
        sectionNoteCount={selectionSectionNoteCount}
      />

      {/* Paper title hero */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING_SOFT}
        className="max-w-4xl"
      >
        <h1 className="text-3xl font-medium leading-tight text-text-primary font-serif sm:text-4xl">
          {PAPER_METADATA.title}
        </h1>
        <p className="mt-2 text-sm text-muted">{PAPER_METADATA.citation}</p>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted font-serif">
          {PAPER_METADATA.abstract}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {PAPER_METADATA.keyClaims.map(claim => (
            <span key={claim} className="lab-chip">{claim}</span>
          ))}
        </div>
      </motion.section>

      {/* Sticky reading-mode bar */}
      <PaperViewModeBar
        readerMode={readerMode}
        onModeChange={setReaderMode}
        activeSectionIndex={activeSectionIndex}
        guideOpen={guideOpen}
        onGuideToggle={() => setGuideOpen(prev => !prev)}
        onSectionClick={setActiveSectionId}
        onTabChange={onTabChange}
        notesVisible={notesVisible}
        onNotesToggle={() => setNotesVisible(prev => !prev)}
        noteCount={totalNoteCount}
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
          notesVisible={notesVisible}
          notesBySection={notesBySection}
        />
      )}
    </div>
  )
}
