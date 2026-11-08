/** The Mentis mark: an M folded into an infinity loop. Drawn in currentColor. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 56 40"
      fill="none"
      stroke="currentColor"
      strokeWidth={4.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13 27V13l21 21h9a9 9 0 0 0 9-9V15a9 9 0 0 0-9-9h-8" />
      <path d="M43 27V13L22 34h-9a9 9 0 0 1-9-9V15a9 9 0 0 1 9-9h8" />
    </svg>
  )
}
