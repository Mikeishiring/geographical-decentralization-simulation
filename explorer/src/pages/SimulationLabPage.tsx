import { useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { ContributionComposer } from '../components/community/ContributionComposer'
import { GlobeNetwork } from '../components/decorative/GlobeNetwork'
import { ExactLabIntro } from '../components/simulation/ExactLabIntro'
import { ExactSimulationAnalyticsPanel } from '../components/simulation/ExactSimulationAnalyticsPanel'
import { PrecomputedEvidenceSurface } from '../components/simulation/PrecomputedEvidenceSurface'
import { SimConfigPanel } from '../components/simulation/SimConfigPanel'
import { SimCopilotPanel } from '../components/simulation/SimCopilotPanel'
import { SimJobStatus } from '../components/simulation/SimJobStatus'
import { SimResultsPanel } from '../components/simulation/SimResultsPanel'
import { useSimulationArtifactView } from '../components/simulation/useSimulationArtifactView'
import { useSimulationLabExports } from '../components/simulation/useSimulationLabExports'
import { useSimulationJobStream } from '../components/simulation/useSimulationJobStream'
import { useExactSimulationAnalytics } from '../components/simulation/useExactSimulationAnalytics'
import { useSimulationLabRouteState } from '../components/simulation/useSimulationLabRouteState'
import { useSimulationLabWorkflow } from '../components/simulation/useSimulationLabWorkflow'
import {
  DEFAULT_CONFIG,
  describePaperComparability,
  paperScenarioLabels,
  readOrCreateClientId,
} from '../components/simulation/simulation-constants'
import { cn } from '../lib/cn'
import { SPRING, SPRING_CRISP, STAGGER_CONTAINER, STAGGER_ITEM } from '../lib/theme'
import type { TabId } from '../components/layout/TabNav'
import {
  getSimulationManifest,
  getSimulationJob,
  type SimulationConfig,
} from '../lib/simulation-api'
import {
  PendingRunSurface,
} from '../components/simulation/PendingRunSurface'

type ResultsMode = 'evidence' | 'engine'

export function SimulationLabPage({
  onOpenCommunityExploration,
  onTabChange,
}: {
  onOpenCommunityExploration?: (explorationId: string) => void
  onTabChange?: (tab: TabId) => void
} = {}) {
  const routeState = useSimulationLabRouteState()
  const [config, setConfig] = useState<SimulationConfig>({ ...DEFAULT_CONFIG })
  const [clientId] = useState(readOrCreateClientId)
  const [resultsMode, setResultsMode] = useState<ResultsMode>('evidence')
  useSimulationJobStream(routeState.currentJobId)

  const updateConfig = <K extends keyof SimulationConfig>(key: K, value: SimulationConfig[K]) => {
    setConfig(previous => ({ ...previous, [key]: value }))
  }

  const applyPreset = (preset: Partial<SimulationConfig>) => {
    setConfig(previous => ({ ...previous, ...preset }))
  }

  const resetConfig = () => {
    setConfig({ ...DEFAULT_CONFIG })
  }

  const jobQuery = useQuery({
    queryKey: ['simulation-job', routeState.currentJobId],
    queryFn: () => getSimulationJob(routeState.currentJobId!),
    enabled: Boolean(routeState.currentJobId),
  })

  const manifestQuery = useQuery({
    queryKey: ['simulation-manifest', routeState.currentJobId],
    queryFn: () => getSimulationManifest(routeState.currentJobId!),
    enabled: jobQuery.data?.status === 'completed' && !jobQuery.data?.manifest,
  })

  const manifest = jobQuery.data?.manifest ?? manifestQuery.data ?? null
  const artifactView = useSimulationArtifactView({
    currentJobId: routeState.currentJobId,
    manifest,
  })

  const exactAnalytics = useExactSimulationAnalytics({
    surfaceMode: 'lab',
    currentJobId: routeState.currentJobId,
    manifest,
    config,
    appBaseUrl: routeState.appBaseUrl,
    researchCatalogScriptUrl: routeState.researchCatalogScriptUrl,
    researchViewerBaseUrl: routeState.researchViewerBaseUrl,
    analyticsView: routeState.exactAnalyticsView,
    analyticsMetric: routeState.exactAnalyticsMetric,
    analyticsCompareMode: routeState.exactAnalyticsCompareMode,
    requestedSlot: routeState.exactAnalyticsRequestedSlot,
    comparisonPath: routeState.exactComparisonPath,
    onRequestedSlotChange: routeState.setExactAnalyticsRequestedSlot,
    onAnalyticsMetricChange: routeState.setExactAnalyticsMetric,
    onAnalyticsCompareModeChange: routeState.setExactAnalyticsCompareMode,
  })
  const exports = useSimulationLabExports({
    currentJobId: routeState.currentJobId,
    manifest,
    analyticsView: routeState.exactAnalyticsView,
    analyticsMetric: routeState.exactAnalyticsMetric,
    analyticsCompareMode: routeState.exactAnalyticsCompareMode,
    exactAnalyticsShareUrl: exactAnalytics.shareUrl,
    exactAnalyticsExportJson: exactAnalytics.exportJson,
    exactAnalyticsExportCsv: exactAnalytics.exportCsv,
  })
  const workflow = useSimulationLabWorkflow({
    clientId,
    currentJobId: routeState.currentJobId,
    config,
    manifest,
    jobStatus: jobQuery.data?.status,
    overviewBlocks: artifactView.overviewBlocks,
    parsedBlocks: artifactView.parsedBlocks,
    onSubmitSuccess: job => {
      routeState.resetForSubmittedJob(job.id)
      artifactView.resetArtifactView()
      exports.resetExportState()
      setResultsMode('engine')
    },
  })

  const paperComparability = describePaperComparability(config)
  const showPendingRunSurface = Boolean(routeState.currentJobId)
    && !manifest
    && (workflow.status === 'submitting' || workflow.status === 'queued' || workflow.status === 'running' || workflow.status === 'completed')
  const showJobStatus = Boolean(workflow.submitMutation.isError) || (Boolean(routeState.currentJobId) && !manifest)

  return (
    <div>
      {/* ── Page header with mode switcher ── */}
      <motion.div
        className="relative mb-6 overflow-hidden rounded-3xl border border-rule bg-white/92 p-5 shadow-[0_12px_32px_rgba(15,23,42,0.05)] sm:p-6"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
      >
        <div className="pointer-events-none absolute -right-4 -top-2 h-28 w-28 opacity-20 sm:h-36 sm:w-36" aria-hidden="true">
          <GlobeNetwork className="h-full w-full text-muted" />
        </div>
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 shrink-0 rounded-full bg-accent dot-pulse" />
              <h1 className="text-lg font-semibold tracking-tight text-text-primary">Simulation Results</h1>
            </div>
            <p className="mt-1.5 max-w-lg text-xs leading-relaxed text-muted">
              {resultsMode === 'evidence'
                ? 'Pre-computed results from published paper scenarios, rendered in our block style.'
                : 'Run your own experiments and compare geographic decentralization outcomes.'}
            </p>
          </div>

          <div className="flex shrink-0 items-center rounded-full border border-rule bg-surface-active p-0.5">
            <button
              onClick={() => setResultsMode('evidence')}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-xs font-medium transition-all',
                resultsMode === 'evidence'
                  ? 'bg-white text-accent shadow-sm'
                  : 'text-muted hover:text-text-primary',
              )}
            >
              Evidence
            </button>
            <button
              onClick={() => setResultsMode('engine')}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-xs font-medium transition-all',
                resultsMode === 'engine'
                  ? 'bg-white text-accent shadow-sm'
                  : 'text-muted hover:text-text-primary',
              )}
            >
              Engine
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── Mode: Evidence — pre-computed published results ── */}
      {resultsMode === 'evidence' && (
        <PrecomputedEvidenceSurface
          catalogScriptUrl={routeState.researchCatalogScriptUrl}
          viewerBaseUrl={routeState.researchViewerBaseUrl}
        />
      )}

      {/* ── Mode: Engine — run your own simulation ── */}
      {resultsMode === 'engine' && (
        <>
          <motion.section
            className="mb-6 overflow-hidden rounded-3xl border border-rule bg-gradient-to-b from-surface-active/60 to-white/95"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 0.06 }}
          >
            <div className="px-5 py-4">
              <div className="lab-section-title">Run your own experiment</div>
              <div className="mt-1 text-xs leading-relaxed text-muted">Configure parameters and launch a fresh simulation against the exact paper engine.</div>
            </div>

            <div className="border-t border-rule/70 px-5 py-4">
              <ExactLabIntro
                config={config}
                comparabilityTitle={paperComparability.title}
                onApplyPreset={applyPreset}
              />

              <SimConfigPanel
                config={config}
                onConfigChange={updateConfig}
                onSubmit={workflow.onSubmit}
                onReset={resetConfig}
                isSubmitting={workflow.submitMutation.isPending}
                canCancel={workflow.canCancel}
                onCancel={workflow.onCancel}
                paperScenarioLabels={paperScenarioLabels(config)}
                paperComparability={paperComparability}
              />

              <SimCopilotPanel
                copilotQuestion={workflow.copilotQuestion}
                onQuestionChange={workflow.setCopilotQuestion}
                onAsk={question => workflow.copilotMutation.mutate(question)}
                onApplyConfig={setConfig}
                copilotResponse={workflow.copilotResponse}
                copilotAvailable={workflow.copilotAvailable}
                isHealthLoading={workflow.apiHealthQuery.isLoading}
                isMutating={workflow.copilotMutation.isPending}
                mutationError={(workflow.copilotMutation.error as Error | null) ?? null}
                hasManifest={Boolean(manifest)}
                promptSuggestions={workflow.copilotPromptSuggestions}
              />
            </div>
          </motion.section>

          {showJobStatus && (
            <SimJobStatus
              status={workflow.status}
              jobData={jobQuery.data ?? null}
              submitError={(workflow.submitMutation.error as Error | null) ?? null}
              cancelError={(workflow.cancelMutation.error as Error | null) ?? null}
              config={config}
            />
          )}

          {showPendingRunSurface && (
            <PendingRunSurface
              status={workflow.status}
              jobData={jobQuery.data ?? null}
              config={config}
            />
          )}

          {manifest && (
            <>
              <motion.div
                className="section-divider my-6"
                initial={{ opacity: 0, scaleX: 0.3 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={SPRING_CRISP}
              />

              <SimResultsPanel
                manifest={manifest}
                overviewBundleOptions={artifactView.overviewBundleOptions}
                selectedBundle={artifactView.selectedBundle}
                onSelectBundle={artifactView.setSelectedBundle}
                exactChartSeries={artifactView.exactChartSeries}
                isExactChartDeckLoading={artifactView.isExactChartDeckLoading}
                selectedOverviewBundleMetrics={artifactView.selectedOverviewBundleMetrics}
                overviewBlocks={artifactView.overviewBlocks}
                isOverviewLoading={artifactView.isOverviewLoading}
                selectedArtifact={artifactView.selectedArtifact}
                selectedArtifactName={artifactView.selectedArtifactName}
                onSelectArtifact={artifactView.onSelectArtifact}
                isArtifactFetching={artifactView.artifactQuery.isFetching}
                isParsing={artifactView.isParsing}
                parseError={artifactView.parseError}
                parsedBlocks={artifactView.parsedBlocks}
                copyState={exports.copyState}
                exportState={exports.exportState}
                exportError={exports.exportError}
                onCopy={exports.copyToClipboard}
                onExportData={exports.exportRunData}
              />

              <ExactSimulationAnalyticsPanel
                surfaceMode="lab"
                currentJobId={routeState.currentJobId}
                analyticsView={routeState.exactAnalyticsView}
                analyticsMetric={routeState.exactAnalyticsMetric}
                analyticsCompareMode={routeState.exactAnalyticsCompareMode}
                analyticsRequestedSlot={routeState.exactAnalyticsRequestedSlot}
                comparisonPath={routeState.exactComparisonPath}
                analytics={exactAnalytics}
                onAnalyticsViewChange={routeState.setExactAnalyticsView}
                onAnalyticsMetricChange={routeState.setExactAnalyticsMetric}
                onAnalyticsCompareModeChange={routeState.setExactAnalyticsCompareMode}
                onAnalyticsRequestedSlotChange={routeState.setExactAnalyticsRequestedSlot}
                onComparisonPathChange={routeState.setExactComparisonPath}
                onCopyShareUrl={targetUrl => void exports.copyExactAnalyticsUrl(targetUrl)}
                onCopyQueryJson={() => void exports.copyExactAnalyticsJson()}
                onDownloadExport={exports.downloadExactAnalyticsExport}
              />

              {workflow.simulationPublishContextKey && (
                <div className="lab-stage-soft p-4">
                  <div className="flex items-center justify-between">
                    <div
                      className="lab-section-title"
                      title="Publish a short human takeaway only if this run adds something beyond the published replay."
                    >
                      Publish findings
                    </div>
                  </div>

                  <div className="mt-3">
                    <ContributionComposer
                      key={workflow.simulationPublishContextKey}
                      sourceLabel="Share your findings from this run"
                      defaultTitle={workflow.simulationPublishTitle}
                      defaultTakeaway={workflow.simulationPublishTakeaway}
                      helperText="Add your own title and takeaway based on what you saw in the artifacts."
                      publishLabel="Publish note"
                      successLabel="Published"
                      viewPublishedLabel="Open Community"
                      published={workflow.publishedSimulationKey === workflow.simulationPublishContextKey}
                      isPublishing={workflow.publishMutation.isPending}
                      error={(workflow.publishMutation.error as Error | null)?.message ?? null}
                      onViewPublished={workflow.publishedSimulationExplorationId != null && onOpenCommunityExploration
                        ? () => onOpenCommunityExploration(workflow.publishedSimulationExplorationId!)
                        : onTabChange
                          ? () => onTabChange('community')
                          : undefined}
                      onPublish={payload => workflow.publishMutation.mutate({
                        contextKey: workflow.simulationPublishContextKey!,
                        ...payload,
                      })}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
      {/* Cross-tab navigation footer */}
      {onTabChange && (
        <motion.div
          className="mt-12 grid gap-3 sm:grid-cols-3"
          variants={STAGGER_CONTAINER}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
        >
          {([
            { tab: 'paper' as TabId, eyebrow: 'Read the paper', title: 'Paper', detail: 'Editorial reading with source provenance and visual evidence.' },
            { tab: 'agent' as TabId, eyebrow: 'Questions & experiments', title: 'Agent workspace', detail: 'Ask questions about the paper or run autonomous experiments.' },
            { tab: 'community' as TabId, eyebrow: 'Public responses', title: 'Community notes', detail: 'Human notes on readings and simulation runs.' },
          ] as const).map(item => (
            <motion.button
              key={item.tab}
              variants={STAGGER_ITEM}
              whileTap={{ scale: 0.98 }}
              transition={SPRING_CRISP}
              onClick={() => onTabChange(item.tab)}
              className="group relative overflow-hidden rounded-xl border border-rule bg-white p-4 text-left card-hover"
            >
              <span className="text-2xs font-medium uppercase tracking-[0.1em] text-text-faint">{item.eyebrow}</span>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-13 font-medium text-text-primary group-hover:text-accent transition-colors">{item.title}</span>
                <span className="text-xs text-text-faint transition-all group-hover:text-accent group-hover:translate-x-0.5">→</span>
              </div>
              <div className="mt-1 text-xs leading-5 text-muted">{item.detail}</div>
            </motion.button>
          ))}
        </motion.div>
      )}
    </div>
  )
}
