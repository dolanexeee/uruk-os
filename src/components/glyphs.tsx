import React from "react";

/**
 * Small monochrome glyphs for the system panels (menu bar, Control
 * Center, Notification Center). Original stroke art, currentColor.
 */

interface GProps {
  size?: number;
  className?: string;
}

function Svg({
  size = 16,
  className,
  children,
  filled = false,
}: GProps & { children: React.ReactNode; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function SearchGlyph(p: GProps) {
  return (
    <Svg {...p}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <line x1="15.5" y1="15.5" x2="21" y2="21" />
    </Svg>
  );
}

export function SlidersGlyph(p: GProps) {
  return (
    <Svg {...p}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="17" x2="20" y2="17" />
      <circle cx="9" cy="7" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="17" r="2.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function WifiGlyph(p: GProps) {
  return (
    <Svg {...p}>
      <path d="M2.5 9a15 15 0 0 1 19 0" />
      <path d="M5.5 12.5a10.5 10.5 0 0 1 13 0" />
      <path d="M8.6 16a6 6 0 0 1 6.8 0" />
      <circle cx="12" cy="19.4" r="1.3" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function WifiOffGlyph(p: GProps) {
  return (
    <Svg {...p}>
      <path d="M2.5 9a15 15 0 0 1 8-4.6M13.5 5.4A15 15 0 0 1 21.5 9" />
      <path d="M8.6 16a6 6 0 0 1 5-.8" />
      <circle cx="12" cy="19.4" r="1.3" fill="currentColor" stroke="none" />
      <line x1="4" y1="4" x2="20" y2="20" />
    </Svg>
  );
}

export function MoonGlyph(p: GProps) {
  return (
    <Svg {...p} filled>
      <path d="M20.4 14.2A8.5 8.5 0 0 1 9.8 3.6a8.5 8.5 0 1 0 10.6 10.6z" />
    </Svg>
  );
}

export function AirplaneGlyph(p: GProps) {
  return (
    <Svg {...p} filled>
      <path d="M21.5 15.5v-2l-8.5-5V4.2a1.2 1.2 0 0 0-2.4 0v4.3l-8.5 5v2l8.5-2.6v5l-2.4 1.7v1.5l3.5-1 3.5 1v-1.5L13 18.3v-5l8.5 2.2z" transform="scale(0.92) translate(1,1)" />
    </Svg>
  );
}

export function SunGlyph(p: GProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7" />
    </Svg>
  );
}

export function VolumeGlyph(p: GProps) {
  return (
    <Svg {...p}>
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" fill="currentColor" stroke="none" />
      <path d="M15 9.2a4.2 4.2 0 0 1 0 5.6M17.6 6.8a7.6 7.6 0 0 1 0 10.4" />
    </Svg>
  );
}

export function LockGlyph(p: GProps) {
  return (
    <Svg {...p}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </Svg>
  );
}

export function PlayGlyph(p: GProps) {
  return (
    <Svg {...p} filled>
      <path d="M8 5.5v13l11-6.5z" />
    </Svg>
  );
}

export function PauseGlyph(p: GProps) {
  return (
    <Svg {...p} filled>
      <rect x="6.5" y="5" width="4" height="14" rx="1" />
      <rect x="13.5" y="5" width="4" height="14" rx="1" />
    </Svg>
  );
}

export function BellGlyph(p: GProps) {
  return (
    <Svg {...p}>
      <path d="M6 16.5v-5a6 6 0 0 1 12 0v5l1.2 2.7H4.8L6 16.5z" />
      <path d="M10 21a2.2 2.2 0 0 0 4 0" />
    </Svg>
  );
}
