import type { CaveatBlock as CaveatBlockType } from '../../types/blocks'

interface CaveatBlockProps {
  block: CaveatBlockType
}

export function CaveatBlock({ block }: CaveatBlockProps) {
  return (
    <div className="border-l-2 border-warning pl-5 py-3">
      <div className="flex gap-2.5">
        <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0 mt-1.5" />
        <div>
          <span className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-text-faint">Caveat</span>
          <p className="mt-1 text-[0.8125rem] text-text-body leading-relaxed font-serif">
            {block.text}
          </p>
        </div>
      </div>
    </div>
  )
}
