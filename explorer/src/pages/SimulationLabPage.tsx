import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ContributionComposer } from '../components/community/ContributionComposer'
import { ExactLabIntro } from '../components/simulation/ExactLabIntro'
import { ExactSimulationAnalyticsPanel } from '../components/simulation/ExactSimulationAnalyticsPanel'
import { PrecomputedSimulationSurface } from '../components/simulation/PrecomputedSimulationSurface'
import { SimConfigPanel } from '../components/simulation/SimConfigPanel'
import { SimCopilotPanel } from '../components/simulation/SimCopilotPanel'
import { SimJobStatus } from '../components/simulation/SimJobStatus'
import { ResearchDemoSurface } from '../components/simulation/ResearchDemoSurface'
import { SimResultsPanel } from '../components/simulation/SimResultsPanel'
import { SimulationSurfaceHeader } from '../components/simulation/SimulationSurfaceHeader'
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
import type { TabId } from '../components/layout/TabNav'
import {
  getSimulationManifest,
  getSimulationJob,
  type SimulationConfig,
} from '../lib/simulation-api'
import {
  PendingRunSurface,
} from '../components/simulation/PendingRunSurface'

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
    surfaceMode: routeState.surfaceMode,
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
    },
  })

  const paperComparability = describePaperComparability(config)
  const showPendingRunSurface = Boolean(routeState.currentJobId)
    && !manifest
    && (workflow.status === 'submitting' || workflow.status === 'queued' || workflow.status === 'running' || workflow.status === 'completed')
  const showJobStatus = Boolean(workflow.submitMutation.isError) || (Boolean(routeState.currentJobId) && !manifest)

  return (
    <div>
      <SimulationSurfaceHeader
        surfaceMode={routeState.surfaceMode}
        onSurfaceModeChange={routeState.setSurfaceMode}
      />

      {routeState.surfaceMode === 'research' ? (
        <ResearchDemoSurface
          catalogScriptUrl={routeState.researchCatalogScriptUrl}
          viewerBaseUrl={routeState.researchViewerBaseUrl}
          onOpenCommunityExploration={onOpenCommunityExploration}
          onTabChange={onTabChange}
        />
      ) : (
        <>
          {showJobStatus && (
            <SimJobStatus
              status={workflow.status}
              jobData={jobQuery.data ?? null}
              submitError={(workflow.submitMutation.error as Error | null) ?? null}
              cancelError={(workflow.cancelMutation.error as Error | null) ?? null}
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
                surfaceMode={routeState.surfaceMode}
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

          {!routeState.currentJobId ? (
            <PrecomputedSimulationSurface
              config={config}
              catalogScriptUrl={routeState.researchCatalogScriptUrl}
              viewerBaseUrl={routeState.researchViewerBaseUrl}
            />
          ) : null}

          <details open={!manifest} className="mb-5 overflow-hidden rounded-[24px] border border-rule bg-[linear-gradient(180deg,rgba(248,250,252,0.82),rgba(255,255,255,0.96))]">
            <summary className="flex cursor-pointer list-none flex-col gap-3 border-b border-rule/70 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="lab-section-title">Lab controls</div>
              <div className="flex flex-wrap gap-2 text-xs text-muted">
                <span className="lab-chip bg-white/85">{config.paradigm}</span>
                <span className="lab-chip bg-white/85">{config.validators.toLocaleString()} validators</span>
                <span className="lab-chip bg-white/85">{config.slots.toLocaleString()} slots</span>
                <span className="lab-chip bg-white/85">{paperComparability.title}</span>
              </div>
            </summary>

            <div className="px-4 py-4">
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
          </details>
        </>
      )}
    </div>
  )
}
