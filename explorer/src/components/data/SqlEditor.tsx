import { useRef, useEffect, useCallback } from 'react'
import { EditorView, keymap, placeholder as placeholderExt, lineNumbers } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { sql } from '@codemirror/lang-sql'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { autocompletion } from '@codemirror/autocomplete'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { Play, RotateCcw } from 'lucide-react'

import { cn } from '../../lib/cn'
import type { TableMeta } from '../../lib/results-warehouse-api'

interface SqlEditorProps {
  readonly initialValue?: string
  readonly value?: string
  readonly tables: readonly TableMeta[]
  readonly onExecute: (sql: string) => void
  readonly onChange?: (sql: string) => void
  readonly editorRef?: React.MutableRefObject<EditorView | null>
  readonly disabled?: boolean
  readonly isExecuting?: boolean
  readonly chrome?: 'standalone' | 'embedded'
}

function buildSchemaCompletions(tables: readonly TableMeta[]) {
  const schema: Record<string, readonly string[]> = {}
  for (const table of tables) {
    schema[table.name] = table.columns.map(column => column.name)
  }
  return schema
}

export function SqlEditor({
  initialValue = '',
  value,
  tables,
  onExecute,
  onChange,
  editorRef,
  disabled,
  isExecuting,
  chrome = 'standalone',
}: SqlEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onExecuteRef = useRef(onExecute)
  const onChangeRef = useRef(onChange)

  onExecuteRef.current = onExecute
  onChangeRef.current = onChange

  const executeCurrentQuery = useCallback(() => {
    const view = viewRef.current
    if (!view) return
    const text = view.state.doc.toString().trim()
    if (text) {
      onExecuteRef.current(text)
    }
  }, [])

  const clearEditor = useCallback(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: '' },
    })
    view.focus()
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    const schema = buildSchemaCompletions(tables)
    const initialDoc = value ?? initialValue

    const runQueryKeymap = keymap.of([
      {
        key: 'Mod-Enter',
        run: () => {
          executeCurrentQuery()
          return true
        },
      },
    ])

    const state = EditorState.create({
      doc: initialDoc,
      extensions: [
        runQueryKeymap,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        history(),
        sql({ schema, upperCaseKeywords: true }),
        syntaxHighlighting(defaultHighlightStyle),
        autocompletion({ defaultKeymap: true }),
        lineNumbers(),
        placeholderExt(`WITH final_runs AS (
  SELECT run_id, gini, info_avg_distance
  FROM run_metric_snapshots
  WHERE snapshot = 'final'
)
SELECT *
FROM final_runs
ORDER BY gini DESC
LIMIT 10`),
        EditorView.updateListener.of(update => {
          if (!update.docChanged) return
          onChangeRef.current?.(update.state.doc.toString())
        }),
        EditorView.theme({
          '&': {
            fontSize: '12px',
            fontFamily: '"SF Mono", "SFMono-Regular", Menlo, Monaco, Consolas, monospace',
            backgroundColor: 'transparent',
          },
          '.cm-content': {
            padding: '14px 0 16px',
            caretColor: 'var(--color-accent, #2563EB)',
          },
          '.cm-line': {
            padding: '0 14px 0 8px',
          },
          '&.cm-focused .cm-cursor': {
            borderLeftColor: 'var(--color-accent, #2563EB)',
          },
          '&.cm-focused': {
            outline: 'none',
          },
          '.cm-gutters': {
            backgroundColor: 'rgba(0, 0, 0, 0.02)',
            borderRight: '1px solid rgba(0, 0, 0, 0.05)',
            color: 'rgba(0, 0, 0, 0.24)',
            fontSize: '10px',
            minWidth: '36px',
          },
          '.cm-activeLineGutter': {
            backgroundColor: 'rgba(37, 99, 235, 0.04)',
            color: 'rgba(0, 0, 0, 0.5)',
          },
          '.cm-activeLine': {
            backgroundColor: 'rgba(37, 99, 235, 0.03)',
          },
          '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
            backgroundColor: 'rgba(37, 99, 235, 0.12)',
          },
          '.cm-placeholder': {
            color: 'rgba(0, 0, 0, 0.22)',
            fontStyle: 'italic',
          },
          '.cm-tooltip.cm-tooltip-autocomplete': {
            border: '1px solid rgba(0, 0, 0, 0.08)',
            borderRadius: '12px',
            backgroundColor: 'rgba(255,255,255,0.97)',
            boxShadow: '0 10px 28px rgba(0, 0, 0, 0.10), 0 0 0 1px rgba(0, 0, 0, 0.03)',
            fontSize: '11px',
            fontFamily: '"SF Mono", "SFMono-Regular", Menlo, Monaco, Consolas, monospace',
          },
          '.cm-tooltip.cm-tooltip-autocomplete ul li[aria-selected]': {
            backgroundColor: 'rgba(37, 99, 235, 0.08)',
            color: 'inherit',
          },
        }),
        EditorView.lineWrapping,
        EditorState.readOnly.of(disabled ?? false),
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view
    if (editorRef) {
      editorRef.current = view
    }

    return () => {
      view.destroy()
      viewRef.current = null
      if (editorRef) {
        editorRef.current = null
      }
    }
    // Re-create editor when schema or readonly state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, executeCurrentQuery, initialValue, tables])

  useEffect(() => {
    if (value == null) return
    const view = viewRef.current
    if (!view) return
    const currentText = view.state.doc.toString()
    if (currentText === value) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    })
  }, [value])

  return (
    <div
      className={cn(
        chrome === 'standalone'
          ? 'overflow-hidden rounded-[18px] border border-black/[0.08] bg-white/[0.96] shadow-[0_6px_24px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.02)]'
          : 'overflow-hidden rounded-[14px] border border-black/[0.06] bg-white/[0.78]',
        'transition-shadow focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.12),0_12px_32px_rgba(0,0,0,0.08)]',
        disabled && 'opacity-60',
      )}
    >
      <div className="flex flex-col gap-3 border-b border-black/[0.06] bg-[linear-gradient(180deg,rgba(37,99,235,0.05),rgba(37,99,235,0.015))] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-primary/55">
            Query canvas
          </div>
          <p className="mt-1 text-[11px] leading-5 text-muted/60">
            Server-side DuckDB, read-only SQL, single statement, and warehouse autocomplete.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={clearEditor}
            disabled={disabled}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white/[0.86] px-3 py-1.5',
              'text-[11px] font-medium text-muted/60',
              'transition-[transform,background-color,border-color,color] duration-150',
              'hover:border-accent/20 hover:bg-accent/[0.04] hover:text-accent',
              'focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]',
              'active:scale-[0.96]',
              'disabled:pointer-events-none disabled:opacity-40',
            )}
            title="Clear the current draft"
          >
            <RotateCcw className="h-3 w-3" />
            Clear
          </button>

          <button
            onClick={executeCurrentQuery}
            disabled={disabled || isExecuting}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5',
              'text-[11px] font-semibold text-white',
              'bg-[var(--color-accent,#2563EB)] shadow-[0_8px_18px_rgba(37,99,235,0.26)]',
              'transition-[transform,filter] duration-150 hover:brightness-110 active:scale-[0.96]',
              'focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(37,99,235,0.18),0_8px_18px_rgba(37,99,235,0.26)]',
              'disabled:pointer-events-none disabled:opacity-45',
            )}
          >
            {isExecuting ? (
              <div className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-white/40 border-t-white" />
            ) : (
              <Play className="h-3 w-3 fill-current" />
            )}
            {isExecuting ? 'Running' : 'Run query'}
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="min-h-[220px] max-h-[420px] overflow-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(250,250,252,0.98))]"
      />

      <div className="flex flex-col gap-2 border-t border-black/[0.06] bg-black/[0.02] px-4 py-3 text-[10px] text-muted/50 sm:flex-row sm:items-center sm:justify-between">
        <span className="font-mono">
          {disabled ? 'Warehouse metadata is still loading.' : 'Cmd+Enter runs the current statement.'}
        </span>
        <span>
          Read-only queries only. Use <span className="font-mono">LIMIT</span> when you are exploring wide trace tables.
        </span>
      </div>
    </div>
  )
}
