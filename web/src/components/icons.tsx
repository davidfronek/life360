import type { ReactNode, SVGProps } from 'react';

function Svg({ children, size = 16, ...rest }: { children: ReactNode; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="icon"
      {...rest}
    >
      {children}
    </svg>
  );
}

type P = { size?: number };

export const MapPinIcon = (p: P) => (
  <Svg {...p}>
    <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </Svg>
);

export const CarIcon = (p: P) => (
  <Svg {...p}>
    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
    <circle cx="7" cy="17" r="2" />
    <path d="M9 17h6" />
    <circle cx="17" cy="17" r="2" />
  </Svg>
);

export const StraightLineIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="5" cy="19" r="2" />
    <circle cx="19" cy="5" r="2" />
    <path d="M6.5 17.5 17.5 6.5" strokeDasharray="2 3" />
  </Svg>
);

export const ClockIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const HomeIcon = (p: P) => (
  <Svg {...p}>
    <path d="m3 11 9-8 9 8" />
    <path d="M5 10v10h14V10" />
  </Svg>
);

export const ChevronIcon = ({ up, ...p }: P & { up?: boolean }) => (
  <Svg {...p}>
    <path d={up ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} />
  </Svg>
);

export const CopyIcon = (p: P) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
  </Svg>
);

export const ExternalLinkIcon = (p: P) => (
  <Svg {...p}>
    <path d="M14 4h6v6" />
    <path d="M20 4 10 14" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Svg>
);

export const CrosshairIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="7" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
  </Svg>
);

export const SunIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);

export const MoonIcon = (p: P) => (
  <Svg {...p}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </Svg>
);

export const PanelIcon = ({ open, ...p }: P & { open?: boolean }) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
    <path d={open ? 'm16 10-2 2 2 2' : 'm14 10 2 2-2 2'} />
  </Svg>
);

export const UsersIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
  </Svg>
);

export const GlobeIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.7-3.9-9S9.4 5.7 12 3Z" />
  </Svg>
);

export const NavigationIcon = (p: P) => (
  <Svg {...p}>
    <path d="m3 11 18-8-8 18-2-8-8-2Z" />
  </Svg>
);

// Baterie s výplní podle úrovně; při nabíjení s bleskem
export function BatteryIcon({ level, charging, size = 18 }: { level: number; charging?: boolean | null; size?: number }) {
  const pct = Math.max(0, Math.min(100, level));
  const color = charging ? '#16a34a' : pct <= 15 ? '#dc2626' : pct <= 40 ? '#f59e0b' : '#16a34a';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="icon">
      <rect x="2" y="7" width="17" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M21.5 10.5v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="4" y="9" width={(13 * pct) / 100} height="6" rx="1" fill={color} />
      {charging && (
        <path d="m11.5 7.5-3 5h4l-3 4.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}
