import React from 'react'

type SvgProps = React.SVGProps<SVGSVGElement>

const ICONS: Record<string, () => React.ReactNode> = {
  doc: () => <>
    <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
  </>,
  db: () => <>
    <ellipse cx="12" cy="5" rx="9" ry="3"/>
    <path d="M3 5v14a9 3 0 0 0 18 0V5M3 12a9 3 0 0 0 18 0"/>
  </>,
  export: () => <path d="M12 15V3m-5 5 5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>,
  import: () => <path d="M12 3v12m-5-5 5 5 5-5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>,
  slides: () => <>
    <rect x="2" y="4" width="20" height="12" rx="2"/>
    <path d="M12 16v4M8 20h8"/>
  </>,
  print: () => <>
    <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/>
    <rect x="6" y="14" width="12" height="7" rx="1"/>
  </>,
  template: () => <>
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <path d="M3 9h18M9 21V9"/>
  </>,
  toc: () => <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>,
  history: () => <>
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 7v5l3 2"/>
  </>,
  backlink: () => <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5"/>,
  comment: () => <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>,
  focus: () => <>
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
  </>,
  star: () => <path d="m12 3 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.6 6.7 19.2l1-5.8-4.2-4.1 5.9-.9Z"/>,
  'star-fill': () => <path fill="currentColor" d="m12 3 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.6 6.7 19.2l1-5.8-4.2-4.1 5.9-.9Z"/>,
  lock: () => <>
    <rect x="5" y="11" width="14" height="10" rx="2"/>
    <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
  </>,
  unlock: () => <>
    <rect x="5" y="11" width="14" height="10" rx="2"/>
    <path d="M8 11V7a4 4 0 0 1 8 0"/>
  </>,
  share: () => <>
    <circle cx="18" cy="5" r="3"/>
    <circle cx="6" cy="12" r="3"/>
    <circle cx="18" cy="19" r="3"/>
    <path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5"/>
  </>,
  power: () => <path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0"/>,
  gear: () => <>
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
  </>,
  users: () => <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
  </>,
  plus: () => <path d="M12 5v14M5 12h14"/>,
  'chev-down': () => <path d="m6 9 6 6 6-6"/>,
  'chev-right': () => <path d="m9 18 6-6-6-6"/>,
  menu: () => <path d="M3 6h18M3 12h18M3 18h18"/>,
  search: () => <>
    <circle cx="11" cy="11" r="7"/>
    <path d="m21 21-4.3-4.3"/>
  </>,
  bell: () => <>
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
    <path d="M21 16c-2-2-3-4-3-9a6 6 0 0 0-12 0c0 5-1 7-3 9Z"/>
  </>,
  trash: () => <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>,
  restore: () => <>
    <path d="M3 4v6h6"/>
    <path d="M3.5 10a9 9 0 1 0 2.1-3.4L3 10"/>
  </>,
  leaf: () => <>
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/>
    <path d="M2 21c0-3 1.85-5.36 5.08-6"/>
  </>,
  user: () => <>
    <circle cx="12" cy="8" r="4"/>
    <path d="M20 21a8 8 0 1 0-16 0"/>
  </>,
  sun: () => <>
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
  </>,
  asterisk: () => <>
    <path d="M12 6v12"/>
    <path d="m17.196 9-10.392 6"/>
    <path d="m6.804 9 10.392 6"/>
  </>,
  loader: () => <>
    <path d="M12 2v4"/>
    <path d="m16.24 7.76 2.83-2.83"/>
    <path d="M20 12h-4"/>
    <path d="m16.24 16.24 2.83 2.83"/>
    <path d="M12 18v4"/>
    <path d="m7.76 16.24-2.83 2.83"/>
    <path d="M6 12H2"/>
    <path d="m7.76 7.76-2.83-2.83"/>
  </>,
  moon: () => <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>,
  minimize: () => <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>,
  edit: () => <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>,
  copy: () => <>
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </>,
  link: () => <path d="M15 7h3a5 5 0 0 1 0 10h-3m-6 0H6A5 5 0 0 1 6 7h3M8 12h8"/>,
  box: () => <>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
    <path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>
  </>,
  more: () => <>
    <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none"/>
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
    <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none"/>
  </>,
  ban: () => <>
    <circle cx="12" cy="12" r="10"/>
    <path d="m4.9 4.9 14.2 14.2"/>
  </>,
  warning: () => <>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <path d="M12 9v4M12 17h.01"/>
  </>,
  smile: () => <>
    <circle cx="12" cy="12" r="9"/>
    <path d="M8 13s1.5 2 4 2 4-2 4-2"/>
    <line x1="9" y1="9" x2="9.01" y2="9"/>
    <line x1="15" y1="9" x2="15.01" y2="9"/>
  </>,
  image: () => <>
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <path d="M21 15l-5-5L5 21"/>
  </>,
}

export function Icon({ name, size = 16, style, className }: { name: string; size?: number; style?: React.CSSProperties; className?: string }) {
  const content = ICONS[name]
  if (!content) return null
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0, ...style }}
      className={className}
      aria-hidden="true"
    >
      {content()}
    </svg>
  )
}
