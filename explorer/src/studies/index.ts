import { GEO_CENTRALIZATION_STUDY } from './geo-centralization'
import type { StudyPackage } from './types'

export const ACTIVE_STUDY_ID = 'geo-centralization'

const STUDY_REGISTRY: Readonly<Record<string, StudyPackage>> = {
  [GEO_CENTRALIZATION_STUDY.id]: GEO_CENTRALIZATION_STUDY,
}

export function getStudyPackage(studyId = ACTIVE_STUDY_ID): StudyPackage {
  const study = STUDY_REGISTRY[studyId]
  if (!study) {
    throw new Error(`Unknown study package: ${studyId}`)
  }
  return study
}

export function getActiveStudy(): StudyPackage {
  return getStudyPackage()
}

export * from './quality'
export * from './types'
