import { GEO_CENTRALIZATION_STUDY } from './geo-centralization'
import type { StudyPackage } from './types'

const STUDY_PACKAGES = [
  GEO_CENTRALIZATION_STUDY,
] as const

export const DEFAULT_STUDY_ID = GEO_CENTRALIZATION_STUDY.id
const viteEnv = import.meta as ImportMeta & { readonly env?: { readonly VITE_STUDY_ID?: string } }
export const ACTIVE_STUDY_ID = viteEnv.env?.VITE_STUDY_ID?.trim() || DEFAULT_STUDY_ID

const STUDY_REGISTRY = Object.fromEntries(
  STUDY_PACKAGES.map(study => [study.id, study]),
) as Readonly<Record<string, StudyPackage>>

export function listStudyPackages(): readonly StudyPackage[] {
  return STUDY_PACKAGES
}

export function getStudyPackage(studyId = DEFAULT_STUDY_ID): StudyPackage {
  const study = STUDY_REGISTRY[studyId]
  if (!study) {
    throw new Error(`Unknown study package: ${studyId}`)
  }
  return study
}

export function getActiveStudy(studyId = ACTIVE_STUDY_ID): StudyPackage {
  return getStudyPackage(studyId)
}

export * from './quality'
export * from './types'
