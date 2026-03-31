interface FollowUpPromptsProps {
  readonly prompts: readonly string[]
  readonly title: string
  readonly onSelect: (query: string) => void
}

export function FollowUpPrompts({ prompts, title, onSelect }: FollowUpPromptsProps) {
  if (prompts.length === 0) return null

  return (
    <div className="mt-6 pt-4 border-t border-rule">
      <span className="text-xs text-muted mb-2 block">{title}</span>
      <div className="flex flex-wrap gap-2 stagger-reveal">
        {prompts.map((query, index) => (
          <button
            key={`${query}-${index}`}
            onClick={() => onSelect(query)}
            className="follow-up-chip"
            title={`Ask: ${query}`}
          >
            {query}
            <span aria-hidden="true" className="follow-up-chip-arrow">→</span>
          </button>
        ))}
      </div>
    </div>
  )
}
