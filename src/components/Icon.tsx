const PATHS = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  refresh: 'M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5',
  play: 'M7 5l12 7-12 7V5z',
  pause: 'M8 5v14M16 5v14',
  close: 'M6 6l12 12M18 6L6 18',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  arrowOut: 'M7 17L17 7M9 7h8v8',
  arrowIn: 'M17 7L7 17M15 17H7V9',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
  topics: 'M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M5 6m-1.5 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M19 7m-1.5 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M6 18m-1.5 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M18 18m-1.5 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M6.2 7l4.2 3.6M17.7 8.2l-4.1 2.6M7.3 17l3.2-3.6M16.7 17l-3.2-3.6',
  layout: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
