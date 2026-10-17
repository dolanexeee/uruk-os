import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  childrenOf,
  ensureHomeFolder,
  formatBytes,
  homeFolder,
  useFS,
  type FSNode,
} from "@/lib/fs";
import { inTrash, isAudioNode } from "@/lib/associations";
import { useOS, type WinState } from "@/store/os";
import { useSystem } from "@/store/system";

/**
 * Music — plays the real audio files stored in the file system.
 * “Music folder” shows the Music home folder; “All Audio” scans the
 * whole file system (Trash excluded). Playback is a plain HTMLAudio
 * element fed with object URLs of the stored blobs.
 */

type RepeatMode = "off" | "all" | "one";

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Music({ win }: { win: WinState }) {
  const nodes = useFS((s) => s.nodes);
  const fs = useFS.getState;
  const os = useOS();
  const focused = os.focusedId === win.id;

  const [view, setView] = useState<"folder" | "all">("folder");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // Master volume lives in the system store: Control Center's Sound
  // slider and this app's slider are the same control.
  const volume = useSystem((s) => s.volume);
  const setVolume = useSystem((s) => s.setVolume);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [srcUrl, setSrcUrl] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wantPlayRef = useRef(false);
  const stateRef = useRef({ currentId, shuffle, repeat, view });
  stateRef.current = { currentId, shuffle, repeat, view };

  /* seed the Music folder on first use */
  useEffect(() => {
    void ensureHomeFolder("Music");
  }, []);

  const tracks = useMemo(() => {
    const musicFolder = homeFolder(nodes, "Music");
    let list: FSNode[];
    if (view === "folder") {
      list = musicFolder ? childrenOf(nodes, musicFolder.id).filter(isAudioNode) : [];
    } else {
      list = Object.values(nodes).filter((n) => isAudioNode(n) && !inTrash(nodes, n));
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, view]);

  const current = currentId ? nodes[currentId] : undefined;

  /* lazily read durations from file metadata */
  useEffect(() => {
    let live = true;
    for (const t of tracks) {
      if (durations[t.id] !== undefined || !t.blob) continue;
      const u = URL.createObjectURL(t.blob);
      const a = new Audio();
      a.preload = "metadata";
      a.onloadedmetadata = () => {
        if (live && Number.isFinite(a.duration)) {
          setDurations((d) => (d[t.id] === undefined ? { ...d, [t.id]: a.duration } : d));
        }
        URL.revokeObjectURL(u);
      };
      a.onerror = () => URL.revokeObjectURL(u);
      a.src = u;
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  /* feed the audio element when the current track changes */
  useEffect(() => {
    if (!current?.blob) {
      setSrcUrl(null);
      return;
    }
    const u = URL.createObjectURL(current.blob);
    setSrcUrl(u);
    setCurrentTime(0);
    setDuration(0);
    return () => URL.revokeObjectURL(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume, srcUrl]);

  useEffect(() => {
    os.setWindowTitle(win.id, current ? `Lyre — ${current.name}` : "Lyre");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.name, win.id]);

  const playTrack = (id: string) => {
    wantPlayRef.current = true;
    if (id === currentId && audioRef.current) {
      void audioRef.current.play().catch(() => setPlaying(false));
      return;
    }
    setCurrentId(id);
  };

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (!current && tracks.length) {
      playTrack(tracks[0].id);
      return;
    }
    if (a.paused) {
      wantPlayRef.current = true;
      void a.play().catch(() => setPlaying(false));
    } else {
      wantPlayRef.current = false;
      a.pause();
    }
  };
  const togglePlayRef = useRef(togglePlay);
  togglePlayRef.current = togglePlay;

  /* publish now-playing + register play/pause for system widgets */
  const setNowPlaying = useSystem((s) => s.setNowPlaying);
  const registerPlaybackToggle = useSystem((s) => s.registerPlaybackToggle);
  useEffect(() => {
    registerPlaybackToggle(() => togglePlayRef.current());
    return () => {
      registerPlaybackToggle(null);
      setNowPlaying(null);
    };
  }, [registerPlaybackToggle, setNowPlaying]);
  useEffect(() => {
    if (current) {
      setNowPlaying({ title: current.name, subtitle: "Lyre", playing });
    } else {
      setNowPlaying(null);
    }
  }, [current, playing, setNowPlaying]);

  const stepTrack = (delta: number) => {
    if (!tracks.length) return;
    const { currentId: cid, shuffle: sh } = stateRef.current;
    const idx = tracks.findIndex((t) => t.id === cid);
    if (sh && tracks.length > 1) {
      let next = idx;
      while (next === idx) next = Math.floor(Math.random() * tracks.length);
      playTrack(tracks[next].id);
      return;
    }
    const next = idx + delta;
    if (next < 0 || next >= tracks.length) {
      if (stateRef.current.repeat === "all") {
        playTrack(tracks[(next + tracks.length) % tracks.length].id);
      }
      return;
    }
    playTrack(tracks[next].id);
  };

  const onEnded = () => {
    const { repeat: rep } = stateRef.current;
    if (rep === "one" && audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play().catch(() => setPlaying(false));
      return;
    }
    const idx = tracks.findIndex((t) => t.id === stateRef.current.currentId);
    if (idx >= 0 && idx < tracks.length - 1) {
      playTrack(tracks[idx + 1].id);
    } else if (rep === "all" && tracks.length) {
      playTrack(tracks[0].id);
    } else {
      setPlaying(false);
      wantPlayRef.current = false;
    }
  };

  /* opened with a file (association): play it */
  useEffect(() => {
    if (win.props.fileId && nodes[win.props.fileId]) {
      setView("all");
      playTrack(win.props.fileId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.props.fileId]);

  useEffect(() => {
    if (!focused) return;
    os.setFileMenuItems([
      { label: "Import Audio…", action: () => fileInputRef.current?.click() },
      {
        label: view === "folder" ? "Show All Audio" : "Show Music Folder",
        action: () => setView(view === "folder" ? "all" : "folder"),
      },
    ]);
    return () => os.setFileMenuItems(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, view]);

  const doImport = async (files: File[]) => {
    const folder = await ensureHomeFolder("Music");
    if (files.length) await fs().importFiles(folder.id, files);
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-white dark:bg-neutral-900"
      data-testid="music"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void doImport(Array.from(e.dataTransfer.files));
      }}
    >
      {/* library header */}
      <div className="flex items-center gap-2 border-b border-black/10 px-3 py-2 dark:border-white/10">
        <div className="flex overflow-hidden rounded-md border border-black/10 dark:border-white/10">
          <button
            data-testid="music-view-folder"
            className={`px-2.5 py-1 text-[13px] ${view === "folder" ? "bg-[var(--accent)] text-white" : "hover:bg-black/5 dark:hover:bg-white/10"}`}
            onClick={() => setView("folder")}
          >
            Music Folder
          </button>
          <button
            data-testid="music-view-all"
            className={`px-2.5 py-1 text-[13px] ${view === "all" ? "bg-[var(--accent)] text-white" : "hover:bg-black/5 dark:hover:bg-white/10"}`}
            onClick={() => setView("all")}
          >
            All Audio
          </button>
        </div>
        <span className="text-[12px] text-neutral-500 dark:text-neutral-400">
          {tracks.length} track{tracks.length === 1 ? "" : "s"}
        </span>
        <button
          data-testid="music-import"
          className="ml-auto rounded-md bg-[var(--accent)] px-2.5 py-1 text-[13px] font-medium text-white"
          onClick={() => fileInputRef.current?.click()}
        >
          Import
        </button>
      </div>

      {/* track list */}
      <div className="uruk-scroll min-h-0 flex-1 overflow-y-auto">
        {tracks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
            <div className="text-[15px] font-semibold text-neutral-600 dark:text-neutral-300">
              No music yet
            </div>
            <p className="max-w-sm text-[13px] leading-5 text-neutral-400">
              Import audio files with the Import button or by dragging them
              into this window. Files land in your Music folder and play
              right here — nothing is uploaded anywhere.
            </p>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-black/10 text-left text-neutral-500 dark:border-white/10 dark:text-neutral-400">
                <th className="py-1.5 pl-3 pr-2 font-medium">Title</th>
                <th className="w-20 py-1.5 pr-2 font-medium">Time</th>
                <th className="w-20 py-1.5 pr-3 font-medium">Size</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((t) => {
                const active = t.id === currentId;
                return (
                  <tr
                    key={t.id}
                    data-testid={`music-track-${t.name}`}
                    className={`cursor-default border-b border-black/[0.04] dark:border-white/[0.05] ${
                      active ? "bg-[var(--accent)]/12" : "hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
                    }`}
                    onDoubleClick={() => playTrack(t.id)}
                    onClick={() => {
                      if (!active) setCurrentId(t.id);
                    }}
                  >
                    <td className="py-1.5 pl-3 pr-2">
                      <span className="mr-2 inline-block w-4 text-center">
                        {active ? (playing ? "♪" : "❚❚") : ""}
                      </span>
                      <span className={active ? "font-semibold" : ""}>{t.name}</span>
                    </td>
                    <td className="py-1.5 pr-2 tabular-nums text-neutral-500 dark:text-neutral-400">
                      {durations[t.id] !== undefined ? fmtTime(durations[t.id]) : "–:––"}
                    </td>
                    <td className="py-1.5 pr-3 text-neutral-500 dark:text-neutral-400">
                      {formatBytes(t.size)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* transport */}
      <div className="border-t border-black/10 bg-neutral-100 px-3 py-2.5 dark:border-white/10 dark:bg-neutral-800">
        <div className="mb-1.5 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-semibold text-neutral-800 dark:text-neutral-100" data-testid="music-now-playing">
              {current ? current.name : "Nothing playing"}
            </div>
            <div className="text-[11.5px] text-neutral-500 dark:text-neutral-400">
              {current ? current.mime : "Pick a track, or double-click to play"}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              data-testid="music-shuffle"
              title="Shuffle"
              className={`rounded px-2 py-1 text-[14px] ${shuffle ? "bg-[var(--accent)] text-white" : "hover:bg-black/5 dark:hover:bg-white/10"}`}
              onClick={() => setShuffle((s) => !s)}
            >
              ⤨
            </button>
            <button
              data-testid="music-prev"
              className="rounded px-2 py-1 text-[16px] hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => stepTrack(-1)}
            >
              ⏮
            </button>
            <button
              data-testid="music-play"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-[15px] text-white"
              onClick={togglePlay}
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <button
              data-testid="music-next"
              className="rounded px-2 py-1 text-[16px] hover:bg-black/5 dark:hover:bg-white/10"
              onClick={() => stepTrack(1)}
            >
              ⏭
            </button>
            <button
              data-testid="music-repeat"
              title={`Repeat: ${repeat}`}
              className={`rounded px-2 py-1 text-[14px] ${repeat !== "off" ? "bg-[var(--accent)] text-white" : "hover:bg-black/5 dark:hover:bg-white/10"}`}
              onClick={() =>
                setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"))
              }
            >
              🔁{repeat === "one" ? "¹" : ""}
            </button>
          </div>
          <div className="flex w-28 items-center gap-1.5">
            <span className="text-[12px] text-neutral-500">🔊</span>
            <input
              data-testid="music-volume"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11.5px] tabular-nums text-neutral-500 dark:text-neutral-400">
          <span data-testid="music-time">{fmtTime(currentTime)}</span>
          <input
            data-testid="music-seek"
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (audioRef.current) audioRef.current.currentTime = v;
              setCurrentTime(v);
            }}
            className="flex-1 accent-[var(--accent)]"
          />
          <span>{fmtTime(duration)}</span>
        </div>
      </div>

      <audio
        ref={audioRef}
        data-testid="music-audio"
        src={srcUrl ?? undefined}
        autoPlay={false}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => {
          const a = audioRef.current;
          if (a) setCurrentTime(a.currentTime);
        }}
        onLoadedMetadata={() => {
          const a = audioRef.current;
          if (!a) return;
          setDuration(a.duration);
          if (current) {
            setDurations((d) => ({ ...d, [current.id]: a.duration }));
          }
          if (wantPlayRef.current) {
            void a.play().catch(() => setPlaying(false));
          }
        }}
        onEnded={onEnded}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        data-testid="music-file-input"
        onChange={(e) => {
          void doImport(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}
