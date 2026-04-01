export interface StudySourceRef {
  readonly label: string
  readonly section?: string
  readonly url?: string
}

export interface StudyMetadata {
  readonly title: string
  readonly subtitle: string
  readonly citation: string
  readonly authors: readonly {
    readonly name: string
    readonly role?: string
    readonly url?: string
    readonly focus?: string
  }[]
  readonly abstract: string
  readonly keyClaims: readonly string[]
  readonly references: readonly StudySourceRef[]
}

export interface StudyPublishedScenarioLink {
  readonly label: string
  readonly evaluation: string
  readonly paradigm: 'External' | 'Local'
  readonly result: string
}

export interface StudyAppendixLink {
  readonly id: string
  readonly label: string
  readonly summary: string
  readonly url: string
}

export interface StudySimulationConfig {
  readonly paradigm: 'SSP' | 'MSP'
  readonly validators: number
  readonly slots: number
  readonly distribution: 'homogeneous' | 'homogeneous-gcp' | 'heterogeneous' | 'random'
  readonly sourcePlacement: 'homogeneous' | 'latency-aligned' | 'latency-misaligned'
  readonly migrationCost: number
  readonly attestationThreshold: number
  readonly slotTime: 6 | 8 | 12
  readonly seed: number
}

export interface StudyRuntimeConfig {
  readonly defaultSimulationConfig: StudySimulationConfig
  readonly paperReferenceOverrides: Partial<StudySimulationConfig>
  readonly simulationPresets: Readonly<Record<string, Partial<StudySimulationConfig>>>
  readonly canonicalPrewarmConfigs: readonly StudySimulationConfig[]
  readonly sourceBlockRefs: readonly StudySourceRef[]
}

export interface StudyNavigationConfig {
  readonly bestFirstStopIds: readonly string[]
  readonly pdfUrl: string
  readonly htmlUrl: string
  readonly sectionPageMap: Readonly<Record<string, number>>
  readonly sectionHtmlIdMap: Readonly<Record<string, string>>
  readonly appendices: readonly StudyAppendixLink[]
}
