import { useRef, useEffect, useCallback } from 'react'
import { EditorView, keymap, placeholder as placeholderExt, lineNumbers } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { sql } from '@codemirror/lang-sql'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { autocompletion } from '@codemirror/autocomplete'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { RotateCcw } from 'lucide-react'
import type { TableMeta } from '../../hooks/useDuckDB'
import { cn } from '../../lib/cn'

interface SqlEditorProps {
  readonly initialValue?: string
  readonly tables: readonly TableMeta[]
  readonly onExecute: (sql: string) => void
  readonly editorRef?: React.MutableRefObject<EditorView | null>
  readonly disabled?: boolean
  readonly isExecuting?: boolean
}

function buildSchemaCompletions(tables: readonly TableMeta[]) {
  const schema: Record<string, readonly string[]> = {}
  for (const table of tables) {
    schema[table.name] = table.columns.map(c => c.name)
  }
  return schema
}

export function SqlEditor({ initialValue = '', tables, onExecute, editorRef, disabled, isExecuting }: SqlEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onExecuteRef = useRef(onExecute)
  onExecuteRef.current = onExecute

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
      doc: initialValue,
      extensions: [
        runQueryKeymap,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        history(),
        sql({ schema, upperCaseKeywords: true }),
        syntaxHighlighting(defaultHighlightStyle),
        autocompletion({ defaultKeymap: true }),
        lineNumbers(),
        placeholderExt('SELECT country, COUNT(*) as peers\nFROM validators\nGROUP BY country\nORDER BY peers DESC\nLIMIT 10'),
        EditorView.theme({
          '&': {
            fontSize: '12px',
            fontFamily: '"Menlo", "Monaco", "SF Mono", ui-monospace, monospace',
            backgroundColor: 'transparent',
          },
          '.cm-content': {
            padding: '12px 0',
            caretColor: 'var(--color-accent, #2563EB)',
          },
          '.cm-line': {
            padding: '0 8px 0 4px',
          },
          '&.cm-focused .cm-cursor': {
            borderLeftColor: 'var(--color-accent, #2563EB)',
          },
          '&.cm-focused': {
            outline: 'none',
          },
          '.cm-gutters': {
            backgroundColor: 'transparent',
            borderRight: '1px solid rgba(0, 0, 0, 0.04)',
            color: 'rgba(0, 0, 0, 0.18)',
            fontSize: '10px',
            minWidth: '32px',
          },
          '.cm-activeLineGutter': {
            backgroundColor: 'transparent',
            color: 'rgba(0, 0, 0, 0.4)',
          },
          '.cm-activeLine': {
            backgroundColor: 'rgba(0, 0, 0, 0.02)',
          },
          '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
            backgroundColor: 'rgba(37, 99, 235, 0.12)',
          },
          '.cm-placeholder': {
            color: 'rgba(0, 0, 0, 0.2)',
            fontStyle: 'italic',
          },
          '.cm-tooltip.cm-tooltip-autocomplete': {
            border: '1px solid rgba(0, 0, 0, 0.08)',
            borderRadius: '10px',
            boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.12)',
            fontSize: '11px',
            fontFamily: '"Menlo", "Monaco", "SF Mono", ui-monospace, monospace',
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
    // Re-create editor when tables change (schema completions update)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables, disabled])

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className={cn(
          'min-h-[160px] max-h-[360px] overflow-auto',
          'rounded-2xl border border-rule bg-white/92',
          'shadow-[0_1px_3px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.02)]',
          'transition-shadow focus-within:shadow-[0_0_0_2px_rgba(37,99,235,0.15),0_4px_12px_-2px_rgba(0,0,0,0.08)]',
          disabled && 'opacity-50 pointer-events-none',
        )}
      />

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-medium tracking-wide text-muted/50 uppercase">
            {disabled ? 'Loading database...' : 'Cmd+Enter to run'}
          </span>
          {!disabled && (
            <button
              onClick={clearEditor}
              className="inline-flex items-center gap-1 text-[10px] font-medium text-muted/40 hover:text-muted/70 transition-colors"
              title="Clear editor"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              Clear
            </button>
          )}
        </div>
        <button
          onClick={executeCurrentQuery}
          disabled={disabled || isExecuting}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5',
            'text-xs font-medium text-white',
            'bg-[var(--color-accent,#2563EB)] hover:brightness-110',
            'active:scale-[0.95] transition-all',
            'disabled:opacity-40 disabled:pointer-events-none',
            'shadow-[0_1px_3px_rgba(37,99,235,0.3)]',
          )}
        >
          {isExecuting ? (
            <div className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-white/40 border-t-white" />
          ) : (
            <svg viewBox="0 0 12 14" fill="currentColor" className="h-3 w-3">
              <path d="M1 0.5v13l10.5-6.5z" />
            </svg>
          )}
          {isExecuting ? 'Running...' : 'Run'}
        </button>
      </div>
    </div>
  )
}
