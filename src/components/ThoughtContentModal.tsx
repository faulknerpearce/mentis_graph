import { useEffect, useId, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { safeUrlTransform } from '../lib/safeUrl'
import type { GraphNode } from '../types'

interface ThoughtContentModalProps {
  node: GraphNode
  onClose: () => void
}

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export function ThoughtContentModal({
  node,
  onClose,
}: ThoughtContentModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const thought = node.thought

  useEffect(() => {
    const root = dialogRef.current
    if (!root) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    root.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab') return
      const focusables = [
        ...root.querySelectorAll<HTMLElement>(FOCUSABLE),
      ].filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1)
      if (focusables.length === 0) {
        event.preventDefault()
        root.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [onClose, node.id])

  return (
    <div className="thought-modal-backdrop" aria-hidden="true">
      <div
        ref={dialogRef}
        className="thought-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="thought-modal-header">
          <div>
            <div className="detail-eyebrow">
              {thought.chain_key} · #{thought.index} · {thought.thought_type}
            </div>
            <h2 id={titleId}>{node.title}</h2>
          </div>
          <button
            type="button"
            className="btn ghost"
            onClick={onClose}
            aria-label="Close content"
          >
            Close
          </button>
        </div>
        <div className="thought-modal-body markdown-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            urlTransform={safeUrlTransform}
          >
            {thought.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
