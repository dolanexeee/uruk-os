import React from "react";

/**
 * All icons in Uruk OS are ORIGINAL artwork, drawn from primitive shapes
 * for this project. They evoke the *function* of each app without copying
 * any vendor's icon files or artwork.
 */

interface IconProps {
  size?: number;
  className?: string;
}

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 64 64",
    style: { display: "block" } as React.CSSProperties,
  };
}

/** Uruk wordmark glyph — a stepped ziggurat, the suite's own mark. */
export function UrukMark({ size = 32, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-label="URUK">
      <g fill="currentColor">
        <rect x="8" y="48" width="48" height="8" rx="1.5" />
        <rect x="15" y="37" width="34" height="8" rx="1.5" />
        <rect x="22" y="26" width="20" height="8" rx="1.5" />
        <rect x="28" y="15" width="8" height="8" rx="1.5" />
      </g>
    </svg>
  );
}

export function FinderIcon({ size = 48, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <defs>
        <linearGradient id="ic-finder-l" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#59c2f0" />
          <stop offset="1" stopColor="#1f7fd6" />
        </linearGradient>
        <linearGradient id="ic-finder-r" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fd8ff" />
          <stop offset="1" stopColor="#3f9be0" />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="52" height="52" rx="12" fill="url(#ic-finder-l)" />
      <path d="M32 6 h14 a12 12 0 0 1 12 12 v28 a12 12 0 0 1 -12 12 H32 Z" fill="url(#ic-finder-r)" />
      <line x1="32" y1="8" x2="32" y2="56" stroke="#0d4d80" strokeWidth="1.6" opacity="0.5" />
      <circle cx="21.5" cy="26" r="2.6" fill="#083a5e" />
      <circle cx="42.5" cy="26" r="2.6" fill="#083a5e" />
      <path d="M32 22 v10" stroke="#083a5e" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      <path d="M18 40 q14 10 28 0" stroke="#083a5e" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function TerminalIcon({ size = 48, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <defs>
        <linearGradient id="ic-term" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3c3c43" />
          <stop offset="1" stopColor="#131316" />
        </linearGradient>
      </defs>
      <rect x="6" y="8" width="52" height="48" rx="9" fill="url(#ic-term)" stroke="#000" strokeOpacity="0.4" />
      <rect x="6" y="8" width="52" height="11" rx="5.5" fill="#ffffff" opacity="0.09" />
      <path d="M15 30 l9 7 l-9 7" stroke="#4ade80" strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="28" y="40.5" width="15" height="3.6" rx="1.8" fill="#e5e5e5" />
    </svg>
  );
}

export function EditorIcon({ size = 48, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <defs>
        <linearGradient id="ic-edit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e8e9ee" />
        </linearGradient>
      </defs>
      <path d="M18 5 h21 l12 12 v42 a3 3 0 0 1 -3 3 H18 a3 3 0 0 1 -3 -3 V8 a3 3 0 0 1 3 -3 Z" fill="url(#ic-edit)" stroke="#c3c6cf" />
      <path d="M39 5 l12 12 H41 a2 2 0 0 1 -2 -2 Z" fill="#cfd3dd" />
      <g stroke="#9aa0ae" strokeWidth="2.2" strokeLinecap="round">
        <line x1="21" y1="27" x2="44" y2="27" />
        <line x1="21" y1="34" x2="44" y2="34" />
        <line x1="21" y1="41" x2="37" y2="41" />
      </g>
      <g transform="rotate(38 44 46)">
        <rect x="41" y="34" width="6" height="19" rx="2.4" fill="#f5a623" />
        <polygon points="41,53 47,53 44,59" fill="#f6cf8b" />
        <polygon points="42.8,56.4 45.2,56.4 44,59" fill="#3c3c43" />
      </g>
    </svg>
  );
}

export function SettingsIcon({ size = 48, className }: IconProps) {
  const teeth = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
  return (
    <svg {...base(size)} className={className}>
      <defs>
        <linearGradient id="ic-gear" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d7d9de" />
          <stop offset="1" stopColor="#8e9096" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="24" fill="url(#ic-gear)" />
      {teeth.map((a, i) => (
        <rect
          key={i}
          x="28.4"
          y="3.4"
          width="7.2"
          height="12"
          rx="2.4"
          fill="url(#ic-gear)"
          transform={`rotate(${(a * 180) / Math.PI} 32 32)`}
        />
      ))}
      <circle cx="32" cy="32" r="14.5" fill="#6d6f75" />
      <circle cx="32" cy="32" r="8" fill="#e9eaee" />
    </svg>
  );
}

export function TrashIcon({ size = 48, full = false, className }: IconProps & { full?: boolean }) {
  return (
    <svg {...base(size)} className={className}>
      <defs>
        <linearGradient id="ic-trash" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2f2f5" />
          <stop offset="1" stopColor="#b9bcc4" />
        </linearGradient>
      </defs>
      {full && (
        <g fill="#e8e9ee" stroke="#a7abb5" strokeWidth="1">
          <circle cx="23" cy="14" r="6" />
          <circle cx="35" cy="10" r="7" />
          <circle cx="43" cy="15" r="5.4" />
        </g>
      )}
      <path d="M14 20 h36 l-3.4 34 a5 5 0 0 1 -5 4.6 H22.4 a5 5 0 0 1 -5 -4.6 Z" fill="url(#ic-trash)" stroke="#9ea2ab" />
      <rect x="10" y="15.5" width="44" height="5" rx="2.5" fill="#d4d6dc" stroke="#9ea2ab" />
      <g stroke="#8f939d" strokeWidth="2.4" strokeLinecap="round">
        <line x1="24" y1="27" x2="25.4" y2="51" />
        <line x1="32" y1="27" x2="32" y2="51" />
        <line x1="40" y1="27" x2="38.6" y2="51" />
      </g>
    </svg>
  );
}

export function FolderIcon({ size = 48, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <defs>
        <linearGradient id="ic-folder" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6fc3f7" />
          <stop offset="1" stopColor="#2f8fdd" />
        </linearGradient>
        <linearGradient id="ic-folder-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#57aef0" />
          <stop offset="1" stopColor="#1f7fd6" />
        </linearGradient>
      </defs>
      <path d="M6 16 a4 4 0 0 1 4 -4 h12 l5 6 h27 a4 4 0 0 1 4 4 v4 H6 Z" fill="url(#ic-folder-b)" />
      <rect x="6" y="22" width="52" height="30" rx="4.5" fill="url(#ic-folder)" />
      <rect x="6" y="22" width="52" height="6" fill="#ffffff" opacity="0.16" />
    </svg>
  );
}

export function FileIcon({ size = 48, image = false, className }: IconProps & { image?: boolean }) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20 4 h16 l12 12 v40 a4 4 0 0 1 -4 4 H20 a4 4 0 0 1 -4 -4 V8 a4 4 0 0 1 4 -4 Z" fill="#f7f7f9" stroke="#c3c6cf" />
      <path d="M36 4 l12 12 H38 a2 2 0 0 1 -2 -2 Z" fill="#d6d9e0" />
      {image ? (
        <g>
          <rect x="21" y="26" width="22" height="17" rx="2" fill="#bfe0f7" />
          <circle cx="27.5" cy="31.5" r="2.3" fill="#f5a623" />
          <polygon points="21,43 30,34 36,39 39,36.4 43,40 43,43" fill="#3f9be0" />
        </g>
      ) : (
        <g stroke="#a3a8b4" strokeWidth="2" strokeLinecap="round">
          <line x1="22" y1="28" x2="42" y2="28" />
          <line x1="22" y1="34.5" x2="42" y2="34.5" />
          <line x1="22" y1="41" x2="35" y2="41" />
        </g>
      )}
    </svg>
  );
}

export function AppIcon({ app, size = 48, className }: { app: string; size?: number; className?: string }) {
  switch (app) {
    case "finder":
      return <FinderIcon size={size} className={className} />;
    case "terminal":
      return <TerminalIcon size={size} className={className} />;
    case "editor":
      return <EditorIcon size={size} className={className} />;
    case "settings":
      return <SettingsIcon size={size} className={className} />;
    default:
      return <FileIcon size={size} className={className} />;
  }
}
