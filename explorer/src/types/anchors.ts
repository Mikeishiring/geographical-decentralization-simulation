export interface TextAnchor {
  /** Paper section ID where the selection was made */
  readonly sectionId?: string
  /** Block ID within the section (if selecting from a block) */
  readonly blockId?: string
  /** The selected text excerpt */
  readonly excerpt: string
  /** Which view mode the selection was made in */
  readonly viewMode?: string
}
