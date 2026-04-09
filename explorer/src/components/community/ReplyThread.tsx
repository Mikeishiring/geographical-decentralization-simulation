import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ThumbsUp, Send } from 'lucide-react'
import { addReply, voteReply, type Reply } from '../../lib/api'
import type { MockReply } from '../../data/mock-community-notes'
import { cn } from '../../lib/cn'
import { SPRING_CRISP } from '../../lib/theme'

interface ReplyThreadProps {
  readonly explorationId: string
  readonly realReplies: readonly Reply[]
  readonly mockReplies: readonly MockReply[]
  readonly composerOpen?: boolean
  readonly onComposerChange?: (open: boolean) => void
}

function formatReplyDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function ReplyThread({ explorationId, realReplies, mockReplies, composerOpen: composerOpenProp, onComposerChange }: ReplyThreadProps) {
  const queryClient = useQueryClient()
  const [composerOpenLocal, setComposerOpenLocal] = useState(false)
  const composerOpen = composerOpenProp ?? composerOpenLocal
  const setComposerOpen = (open: boolean) => {
    setComposerOpenLocal(open)
    onComposerChange?.(open)
  }
  const [body, setBody] = useState('')
  const [author, setAuthor] = useState('')

  const merged = useMemo(() => {
    const realIds = new Set(realReplies.map(r => r.id))
    const combined: Reply[] = [
      ...realReplies,
      ...mockReplies
        .filter(m => !realIds.has(m.id))
        .map(m => ({ id: m.id, explorationId, author: m.author, body: m.body, createdAt: m.createdAt, votes: m.votes })),
    ]
    return [...combined].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }, [realReplies, mockReplies])

  const addMutation = useMutation({
    mutationFn: (input: { author?: string; body: string }) =>
      addReply(explorationId, input.body, input.author),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['explorations'] })
      setBody('')
      setComposerOpen(false)
    },
  })

  const voteMutation = useMutation({
    mutationFn: ({ replyId, delta }: { replyId: string; delta: 1 | -1 }) =>
      voteReply(explorationId, replyId, delta),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['explorations'] })
    },
  })

  const atLimit = merged.length >= 50

  return (
    <div className="mt-4 rounded-lg bg-canvas/60 px-3 py-3">
      {merged.length > 0 && (
        <>
          <span className="mb-2 block text-2xs font-medium uppercase tracking-wide text-text-faint">
            {merged.length} {merged.length === 1 ? 'reply' : 'replies'}
          </span>
          <div className="space-y-2">
            {merged.map(reply => (
              <div key={reply.id} className="flex gap-2.5 rounded-lg bg-white px-3 py-2">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rule text-2xs font-medium text-text-faint">
                  {reply.author.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium text-text-primary">{reply.author}</span>
                    <span className="text-2xs text-text-faint">{formatReplyDate(reply.createdAt)}</span>
                    {reply.votes > 0 && (
                      <button
                        onClick={() => voteMutation.mutate({ replyId: reply.id, delta: 1 })}
                        className="ml-auto inline-flex items-center gap-1 text-2xs text-muted transition-colors hover:text-accent"
                      >
                        <ThumbsUp className="h-2.5 w-2.5" />
                        {reply.votes}
                      </button>
                    )}
                    {reply.votes === 0 && (
                      <button
                        onClick={() => voteMutation.mutate({ replyId: reply.id, delta: 1 })}
                        className="ml-auto text-2xs text-transparent transition-colors hover:text-muted"
                        aria-label="Upvote reply"
                      >
                        <ThumbsUp className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs leading-[1.5] text-muted">{reply.body}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {atLimit && (
        <p className="mt-2 text-2xs text-text-faint">Reply limit reached for this note.</p>
      )}

      <AnimatePresence>
        {composerOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING_CRISP}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2 rounded-lg border border-rule bg-surface-active px-3 py-2.5">
              <input
                type="text"
                value={author}
                onChange={e => setAuthor(e.target.value)}
                placeholder="Your name (optional)"
                maxLength={80}
                className="w-full bg-transparent text-xs text-text-primary placeholder:text-muted/60 outline-none"
              />
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Reply to this note..."
                rows={2}
                maxLength={500}
                className="w-full resize-none bg-transparent text-xs leading-[1.5] text-text-primary placeholder:text-muted/60 outline-none"
                autoFocus
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => { setComposerOpen(false); setBody('') }}
                  className="rounded-md px-2.5 py-1 text-2xs font-medium text-muted transition-colors hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => addMutation.mutate({ author: author.trim() || undefined, body })}
                  disabled={!body.trim() || addMutation.isPending}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-2xs font-medium transition-colors',
                    body.trim()
                      ? 'bg-accent text-white hover:bg-accent/90'
                      : 'bg-rule text-muted cursor-not-allowed',
                  )}
                >
                  <Send className="h-2.5 w-2.5" />
                  {addMutation.isPending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
