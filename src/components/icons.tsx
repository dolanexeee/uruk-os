import React from "react";

/**
 * Iconography — the approved URUK identity set (Phase 4B).
 *
 * Every app icon is original artwork drawn for this project with a
 * Mesopotamian / URUK identity (see design/NAMES.md for the naming
 * rationale and design/icons/ for the source SVGs). The components
 * below render those exact SVG files from /icons — no vendor icon
 * files or artwork are used anywhere.
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


/** Render one of the approved identity SVGs at a square size. */
function IdentityIcon({
  src,
  size = 48,
  className,
}: IconProps & { src: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      draggable={false}
      className={className}
      style={{ display: "block", borderRadius: Math.max(4, Math.round(size * 0.2)) }}
    />
  );
}

export function FinderIcon(props: IconProps) {
  return <IdentityIcon src="/icons/files.svg" {...props} />;
}

export function TerminalIcon(props: IconProps) {
  return <IdentityIcon src="/icons/shell.svg" {...props} />;
}

export function EditorIcon(props: IconProps) {
  return <IdentityIcon src="/icons/scribe.svg" {...props} />;
}

export function SettingsIcon(props: IconProps) {
  return <IdentityIcon src="/icons/settings.svg" {...props} />;
}

export function TrashIcon(props: IconProps & { full?: boolean }) {
  // The approved set has a single Shard icon; the Dock tooltip and
  // Finder show the item count for the full state.
  return <IdentityIcon src="/icons/trash.svg" {...props} />;
}

export function FolderIcon(props: IconProps) {
  return <IdentityIcon src="/icons/folder.svg" {...props} />;
}

export function FileIcon(props: IconProps & { image?: boolean }) {
  return <IdentityIcon src="/icons/file.svg" {...props} />;
}

export function PhotosIcon(props: IconProps) {
  return <IdentityIcon src="/icons/gallery.svg" {...props} />;
}

export function PreviewIcon(props: IconProps) {
  return <IdentityIcon src="/icons/preview.svg" {...props} />;
}

export function NotesIcon(props: IconProps) {
  return <IdentityIcon src="/icons/notes.svg" {...props} />;
}

export function CalculatorIcon(props: IconProps) {
  return <IdentityIcon src="/icons/calculator.svg" {...props} />;
}

export function CalendarIcon(props: IconProps) {
  return <IdentityIcon src="/icons/calendar.svg" {...props} />;
}

export function MusicIcon(props: IconProps) {
  return <IdentityIcon src="/icons/music.svg" {...props} />;
}

export function BrowserIcon(props: IconProps) {
  return <IdentityIcon src="/icons/browser.svg" {...props} />;
}

export function CodeIcon(props: IconProps) {
  return <IdentityIcon src="/icons/code.svg" {...props} />;
}

export function ClockIcon(props: IconProps) {
  return <IdentityIcon src="/icons/clock.svg" {...props} />;
}

export function WeatherIcon(props: IconProps) {
  return <IdentityIcon src="/icons/weather.svg" {...props} />;
}

export function MapsIcon(props: IconProps) {
  return <IdentityIcon src="/icons/maps.svg" {...props} />;
}

export function ToolsIcon(props: IconProps) {
  return <IdentityIcon src="/icons/tools.svg" {...props} />;
}

export function AppIcon({ app, size = 48, className }: { app: string; size?: number; className?: string }) {
  const props = { size, className };
  switch (app) {
    case "finder":
      return <FinderIcon {...props} />;
    case "terminal":
      return <TerminalIcon {...props} />;
    case "editor":
      return <EditorIcon {...props} />;
    case "settings":
      return <SettingsIcon {...props} />;
    case "photos":
      return <PhotosIcon {...props} />;
    case "preview":
      return <PreviewIcon {...props} />;
    case "notes":
      return <NotesIcon {...props} />;
    case "calculator":
      return <CalculatorIcon {...props} />;
    case "calendar":
      return <CalendarIcon {...props} />;
    case "music":
      return <MusicIcon {...props} />;
    case "browser":
      return <BrowserIcon {...props} />;
    case "code":
      return <CodeIcon {...props} />;
    case "clock":
      return <ClockIcon {...props} />;
    case "weather":
      return <WeatherIcon {...props} />;
    case "maps":
      return <MapsIcon {...props} />;
    case "tools":
      return <ToolsIcon {...props} />;
    default:
      return <FileIcon {...props} />;
  }
}

export function LaunchpadIcon(props: IconProps) {
  return <IdentityIcon src="/icons/launchpad.svg" {...props} />;
}
