import React, { useMemo, useState } from "react";
import type { WinState } from "@/store/os";

/**
 * Forge — the workshop of the system (Phase 5).
 *
 * A tabbed utility suite; every tool computes locally in the browser:
 * JSON format/validate (error positions from a hand-written scanner,
 * not the engine's varying messages), Base64 + URL codecs (UTF-8
 * safe), UUID generation (crypto.randomUUID), SHA-256 (WebCrypto),
 * a color picker with HEX/RGB/HSL conversion, a regex tester with
 * counted + highlighted matches, and a text counter.
 */

/* ------------------------------------------------------------------ */
/* JSON: a small scanner that finds the FIRST error position.         */
/* ------------------------------------------------------------------ */

function validateJson(src: string): { ok: true } | { ok: false; index: number; message: string } {
  let i = 0;
  const n = src.length;
  const fail = (index: number, message: string) => ({ ok: false as const, index, message });
  const ws = () => {
    while (i < n && (src[i] === " " || src[i] === "\t" || src[i] === "\n" || src[i] === "\r")) i++;
  };

  type R = { ok: true } | { ok: false; index: number; message: string };

  function parseString(): R {
    // src[i] === '"'
    i++;
    while (i < n) {
      const c = src[i];
      if (c === '"') {
        i++;
        return { ok: true };
      }
      if (c === "\\") {
        i++;
        if (i >= n) break;
        const e = src[i];
        if ("\"\\/bfnrt".includes(e)) i++;
        else if (e === "u") {
          const hex = src.slice(i + 1, i + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) return fail(i, "Invalid \\u escape in string");
          i += 5;
        } else return fail(i, `Invalid escape \\${e} in string`);
        continue;
      }
      if (c < " ") return fail(i, "Unescaped control character in string");
      i++;
    }
    return fail(n, "Unterminated string");
  }

  function parseNumber(): R {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(src.slice(i));
    if (!m) return fail(i, "Invalid number");
    i += m[0].length;
    return { ok: true };
  }

  function parseValue(): R {
    ws();
    if (i >= n) return fail(i, "Unexpected end of input — a value was expected");
    const c = src[i];
    if (c === "{") return parseObject();
    if (c === "[") return parseArray();
    if (c === '"') return parseString();
    if (c === "-" || (c >= "0" && c <= "9")) return parseNumber();
    if (src.startsWith("true", i)) {
      i += 4;
      return { ok: true };
    }
    if (src.startsWith("false", i)) {
      i += 5;
      return { ok: true };
    }
    if (src.startsWith("null", i)) {
      i += 4;
      return { ok: true };
    }
    return fail(i, `Unexpected token '${c}'`);
  }

  function parseObject(): R {
    i++; // {
    ws();
    if (src[i] === "}") {
      i++;
      return { ok: true };
    }
    for (;;) {
      ws();
      if (src[i] !== '"') return fail(i, "Object keys must be strings");
      const k = parseString();
      if (!k.ok) return k;
      ws();
      if (src[i] !== ":") return fail(i, "Expected ':' after object key");
      i++;
      const v = parseValue();
      if (!v.ok) return v;
      ws();
      if (src[i] === ",") {
        i++;
        continue;
      }
      if (src[i] === "}") {
        i++;
        return { ok: true };
      }
      return fail(i, "Expected ',' or '}' in object");
    }
  }

  function parseArray(): R {
    i++; // [
    ws();
    if (src[i] === "]") {
      i++;
      return { ok: true };
    }
    for (;;) {
      const v = parseValue();
      if (!v.ok) return v;
      ws();
      if (src[i] === ",") {
        i++;
        continue;
      }
      if (src[i] === "]") {
        i++;
        return { ok: true };
      }
      return fail(i, "Expected ',' or ']' in array");
    }
  }

  const r = parseValue();
  if (!r.ok) return r;
  ws();
  if (i < n) return fail(i, "Trailing characters after the JSON value");
  return { ok: true };
}

function lineCol(src: string, index: number): { line: number; col: number } {
  const upto = src.slice(0, index);
  const line = upto.split("\n").length;
  const col = index - upto.lastIndexOf("\n");
  return { line, col };
}

/* ------------------------------------------------------------------ */
/* Codecs                                                             */
/* ------------------------------------------------------------------ */

function b64Encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function b64Decode(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/* ------------------------------------------------------------------ */

type ToolTab = "json" | "base64" | "url" | "uuid" | "sha256" | "color" | "regex" | "text";

const TABS: [ToolTab, string][] = [
  ["json", "JSON"],
  ["base64", "Base64"],
  ["url", "URL"],
  ["uuid", "UUID"],
  ["sha256", "SHA-256"],
  ["color", "Color"],
  ["regex", "Regex"],
  ["text", "Text"],
];

const inputCls =
  "w-full rounded-md border border-black/10 bg-white px-2.5 py-1.5 font-mono text-[12.5px] outline-none focus:border-[var(--accent)] dark:border-white/10 dark:bg-neutral-800";
const btnCls =
  "rounded-md bg-[var(--accent)] px-3 py-1.5 text-[13px] font-medium text-white";
const btnGhostCls =
  "rounded-md bg-black/5 px-3 py-1.5 text-[13px] dark:bg-white/10";
const labelCls =
  "mb-1 block text-[11px] font-semibold tracking-wide text-neutral-400 uppercase";

export default function Tools({ win }: { win: WinState }) {
  void win;
  const [tab, setTab] = useState<ToolTab>("json");

  /* JSON */
  const [jsonIn, setJsonIn] = useState("");
  const [jsonOut, setJsonOut] = useState("");
  const [jsonErr, setJsonErr] = useState("");
  const jsonFormat = (minify: boolean) => {
    const v = validateJson(jsonIn);
    if (!v.ok) {
      const { line, col } = lineCol(jsonIn, v.index);
      setJsonErr(`${v.message} — at line ${line}, column ${col} (position ${v.index})`);
      setJsonOut("");
      return;
    }
    setJsonErr("");
    const value = JSON.parse(jsonIn) as unknown;
    setJsonOut(minify ? JSON.stringify(value) : JSON.stringify(value, null, 2));
  };

  /* Base64 */
  const [b64In, setB64In] = useState("");
  const [b64Out, setB64Out] = useState("");
  const [b64Err, setB64Err] = useState("");
  const b64Run = (encode: boolean) => {
    try {
      setB64Out(encode ? b64Encode(b64In) : b64Decode(b64In));
      setB64Err("");
    } catch {
      setB64Out("");
      setB64Err(encode ? "Could not encode that text." : "That is not valid Base64.");
    }
  };

  /* URL */
  const [urlIn, setUrlIn] = useState("");
  const [urlOut, setUrlOut] = useState("");
  const [urlErr, setUrlErr] = useState("");
  const urlRun = (encode: boolean) => {
    try {
      setUrlOut(encode ? encodeURIComponent(urlIn) : decodeURIComponent(urlIn));
      setUrlErr("");
    } catch {
      setUrlOut("");
      setUrlErr("Malformed percent-encoding — the input cannot be decoded.");
    }
  };

  /* UUID */
  const [uuids, setUuids] = useState<string[]>([]);
  const [copied, setCopied] = useState("");
  const genUuids = (count: number) => {
    setUuids(Array.from({ length: count }, () => crypto.randomUUID()));
  };
  const copyText = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      setCopied("");
    }
  };

  /* SHA-256 */
  const [shaIn, setShaIn] = useState("");
  const [shaOut, setShaOut] = useState("");
  const shaRun = async () => {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(shaIn));
    setShaOut(
      Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(""),
    );
  };

  /* Color */
  const [colorHex, setColorHex] = useState("#c8952e");
  const rgb = hexToRgb(colorHex);
  const hsl = rgb ? rgbToHsl(rgb.r, rgb.g, rgb.b) : null;

  /* Regex */
  const [rxPattern, setRxPattern] = useState("\\d+");
  const [rxFlags, setRxFlags] = useState({ i: false, m: false });
  const [rxText, setRxText] = useState("");
  const rxResult = useMemo(() => {
    if (!rxPattern) return { error: "", count: 0, parts: [] as { text: string; match: boolean }[] };
    let re: RegExp;
    try {
      re = new RegExp(rxPattern, `g${rxFlags.i ? "i" : ""}${rxFlags.m ? "m" : ""}`);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Invalid pattern", count: 0, parts: [] };
    }
    const parts: { text: string; match: boolean }[] = [];
    let last = 0;
    let count = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(rxText)) !== null) {
      count++;
      if (m.index > last) parts.push({ text: rxText.slice(last, m.index), match: false });
      parts.push({ text: m[0], match: true });
      last = m.index + m[0].length;
      if (m[0].length === 0) {
        // Zero-width match: step over one char so we never spin forever.
        if (last < rxText.length) parts.push({ text: rxText[last], match: false });
        last++;
        re.lastIndex = last;
        if (last > rxText.length) break;
      }
      if (count > 5000) break;
    }
    if (last < rxText.length) parts.push({ text: rxText.slice(last), match: false });
    return { error: "", count, parts };
  }, [rxPattern, rxFlags, rxText]);

  /* Text counter */
  const [textIn, setTextIn] = useState("");
  const textStats = useMemo(() => {
    const chars = textIn.length;
    const words = textIn.trim() === "" ? 0 : textIn.trim().split(/\s+/).length;
    const lines = textIn === "" ? 0 : textIn.split(/\r\n|\r|\n/).length;
    return { chars, words, lines };
  }, [textIn]);

  return (
    <div className="flex min-h-0 flex-1 bg-white dark:bg-neutral-900" data-testid="tools">
      {/* tool rail */}
      <div className="flex w-32 shrink-0 flex-col gap-0.5 border-r border-black/10 p-2 dark:border-white/10">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            data-testid={`forge-tab-${id}`}
            onClick={() => setTab(id)}
            className={`rounded-md px-2.5 py-1.5 text-left text-[13px] ${
              tab === id
                ? "bg-[var(--accent)] font-medium text-white"
                : "hover:bg-black/5 dark:hover:bg-white/10"
            }`}
          >
            {label}
          </button>
        ))}
        <div className="mt-auto px-1 pt-3 text-[11px] leading-4 text-neutral-400">
          Every tool computes locally — nothing leaves this machine.
        </div>
      </div>

      <div className="uruk-scroll min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "json" && (
          <div>
            <span className={labelCls}>JSON input</span>
            <textarea
              data-testid="forge-json-input"
              value={jsonIn}
              onChange={(e) => setJsonIn(e.target.value)}
              rows={7}
              spellCheck={false}
              placeholder='{"city":"Uruk","river":"Euphrates"}'
              className={inputCls}
            />
            <div className="mt-2 flex gap-2">
              <button data-testid="forge-json-format" onClick={() => jsonFormat(false)} className={btnCls}>
                Format
              </button>
              <button data-testid="forge-json-minify" onClick={() => jsonFormat(true)} className={btnGhostCls}>
                Minify
              </button>
            </div>
            {jsonErr && (
              <div data-testid="forge-json-error" className="mt-2 rounded-md bg-red-500/10 px-3 py-2 font-mono text-[12.5px] text-red-600 dark:text-red-400">
                {jsonErr}
              </div>
            )}
            {jsonOut && (
              <>
                <span className={`${labelCls} mt-3`}>Result — valid JSON</span>
                <textarea
                  data-testid="forge-json-output"
                  value={jsonOut}
                  readOnly
                  rows={9}
                  spellCheck={false}
                  className={inputCls}
                />
              </>
            )}
          </div>
        )}

        {tab === "base64" && (
          <div>
            <span className={labelCls}>Text / Base64 (UTF-8 safe)</span>
            <textarea
              data-testid="forge-b64-input"
              value={b64In}
              onChange={(e) => setB64In(e.target.value)}
              rows={5}
              spellCheck={false}
              className={inputCls}
            />
            <div className="mt-2 flex gap-2">
              <button data-testid="forge-b64-encode" onClick={() => b64Run(true)} className={btnCls}>
                Encode →
              </button>
              <button data-testid="forge-b64-decode" onClick={() => b64Run(false)} className={btnGhostCls}>
                ← Decode
              </button>
            </div>
            {b64Err && (
              <div data-testid="forge-b64-error" className="mt-2 rounded-md bg-red-500/10 px-3 py-2 font-mono text-[12.5px] text-red-600 dark:text-red-400">
                {b64Err}
              </div>
            )}
            <span className={`${labelCls} mt-3`}>Result</span>
            <textarea data-testid="forge-b64-output" value={b64Out} readOnly rows={5} spellCheck={false} className={inputCls} />
          </div>
        )}

        {tab === "url" && (
          <div>
            <span className={labelCls}>URL component encoding</span>
            <textarea
              data-testid="forge-url-input"
              value={urlIn}
              onChange={(e) => setUrlIn(e.target.value)}
              rows={4}
              spellCheck={false}
              className={inputCls}
            />
            <div className="mt-2 flex gap-2">
              <button data-testid="forge-url-encode" onClick={() => urlRun(true)} className={btnCls}>
                Encode →
              </button>
              <button data-testid="forge-url-decode" onClick={() => urlRun(false)} className={btnGhostCls}>
                ← Decode
              </button>
            </div>
            {urlErr && (
              <div data-testid="forge-url-error" className="mt-2 rounded-md bg-red-500/10 px-3 py-2 font-mono text-[12.5px] text-red-600 dark:text-red-400">
                {urlErr}
              </div>
            )}
            <span className={`${labelCls} mt-3`}>Result</span>
            <textarea data-testid="forge-url-output" value={urlOut} readOnly rows={4} spellCheck={false} className={inputCls} />
          </div>
        )}

        {tab === "uuid" && (
          <div>
            <div className="flex gap-2">
              <button data-testid="forge-uuid-gen-1" onClick={() => genUuids(1)} className={btnCls}>
                Generate 1
              </button>
              <button data-testid="forge-uuid-gen-10" onClick={() => genUuids(10)} className={btnGhostCls}>
                Generate 10
              </button>
              {uuids.length > 0 && (
                <button
                  data-testid="forge-uuid-copy-all"
                  onClick={() => void copyText(uuids.join("\n"), "all")}
                  className={btnGhostCls}
                >
                  {copied === "all" ? "Copied ✓" : "Copy all"}
                </button>
              )}
            </div>
            <div className="mt-3 space-y-1">
              {uuids.map((u, i) => (
                <div key={u} className="flex items-center gap-2">
                  <code data-testid="forge-uuid-item" className="flex-1 rounded bg-black/[0.04] px-2.5 py-1.5 font-mono text-[12.5px] dark:bg-white/[0.06]">
                    {u}
                  </code>
                  <button
                    data-testid={`forge-uuid-copy-${i}`}
                    onClick={() => void copyText(u, u)}
                    className="rounded px-2 py-1 text-[12px] hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    {copied === u ? "Copied ✓" : "Copy"}
                  </button>
                </div>
              ))}
              {uuids.length === 0 && (
                <div className="text-[13px] text-neutral-400">Fresh RFC 4122 version-4 UUIDs, from crypto.randomUUID().</div>
              )}
            </div>
          </div>
        )}

        {tab === "sha256" && (
          <div>
            <span className={labelCls}>Text to hash (SHA-256, WebCrypto)</span>
            <textarea
              data-testid="forge-sha-input"
              value={shaIn}
              onChange={(e) => setShaIn(e.target.value)}
              rows={4}
              spellCheck={false}
              className={inputCls}
            />
            <button data-testid="forge-sha-run" onClick={() => void shaRun()} className={`${btnCls} mt-2`}>
              Hash
            </button>
            <span className={`${labelCls} mt-3`}>Digest (hex)</span>
            <textarea data-testid="forge-sha-output" value={shaOut} readOnly rows={3} spellCheck={false} className={inputCls} />
          </div>
        )}

        {tab === "color" && (
          <div>
            <div className="flex items-start gap-4">
              <input
                type="color"
                data-testid="forge-color-picker"
                value={rgb ? rgbToHex(rgb.r, rgb.g, rgb.b) : "#000000"}
                onChange={(e) => setColorHex(e.target.value)}
                className="h-24 w-24 cursor-pointer rounded-lg border border-black/10 bg-transparent dark:border-white/10"
              />
              <div className="flex-1 space-y-2">
                <label className="block">
                  <span className={labelCls}>HEX</span>
                  <input
                    data-testid="forge-color-hex"
                    value={colorHex}
                    onChange={(e) => setColorHex(e.target.value)}
                    spellCheck={false}
                    className={inputCls}
                  />
                </label>
                {rgb && hsl ? (
                  <div className="space-y-1 font-mono text-[13px]">
                    <div data-testid="forge-color-rgb">
                      RGB {rgb.r}, {rgb.g}, {rgb.b}
                    </div>
                    <div data-testid="forge-color-hsl">
                      HSL {hsl.h}°, {hsl.s}%, {hsl.l}%
                    </div>
                  </div>
                ) : (
                  <div className="text-[12.5px] text-red-500">Not a valid #rrggbb color.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "regex" && (
          <div>
            <span className={labelCls}>Pattern</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-neutral-400">/</span>
              <input
                data-testid="forge-regex-pattern"
                value={rxPattern}
                onChange={(e) => setRxPattern(e.target.value)}
                spellCheck={false}
                className={inputCls}
              />
              <span className="font-mono text-neutral-400">/g</span>
              <label className="flex items-center gap-1 text-[13px]">
                <input
                  type="checkbox"
                  data-testid="forge-regex-flag-i"
                  checked={rxFlags.i}
                  onChange={(e) => setRxFlags((f) => ({ ...f, i: e.target.checked }))}
                />
                i
              </label>
              <label className="flex items-center gap-1 text-[13px]">
                <input
                  type="checkbox"
                  data-testid="forge-regex-flag-m"
                  checked={rxFlags.m}
                  onChange={(e) => setRxFlags((f) => ({ ...f, m: e.target.checked }))}
                />
                m
              </label>
            </div>
            <span className={`${labelCls} mt-3`}>Test text</span>
            <textarea
              data-testid="forge-regex-text"
              value={rxText}
              onChange={(e) => setRxText(e.target.value)}
              rows={5}
              spellCheck={false}
              className={inputCls}
            />
            {rxResult.error ? (
              <div data-testid="forge-regex-error" className="mt-2 rounded-md bg-red-500/10 px-3 py-2 font-mono text-[12.5px] text-red-600 dark:text-red-400">
                {rxResult.error}
              </div>
            ) : (
              <>
                <div data-testid="forge-regex-count" className="mt-2 text-[13px] font-medium">
                  {rxResult.count} {rxResult.count === 1 ? "match" : "matches"}
                </div>
                <div
                  data-testid="forge-regex-matches"
                  className="mt-1 rounded-md bg-black/[0.03] px-3 py-2 font-mono text-[12.5px] break-words whitespace-pre-wrap dark:bg-white/[0.05]"
                >
                  {rxResult.parts.map((p, i) =>
                    p.match ? (
                      <mark key={i} className="rounded-sm bg-amber-300/70 px-0.5 dark:bg-amber-500/40">
                        {p.text}
                      </mark>
                    ) : (
                      <span key={i}>{p.text}</span>
                    ),
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {tab === "text" && (
          <div>
            <span className={labelCls}>Text</span>
            <textarea
              data-testid="forge-text-input"
              value={textIn}
              onChange={(e) => setTextIn(e.target.value)}
              rows={9}
              spellCheck={false}
              className={inputCls}
            />
            <div data-testid="forge-text-stats" className="mt-3 flex gap-6 text-[14px]">
              <span>
                <strong data-testid="forge-text-chars">{textStats.chars}</strong>{" "}
                <span className="text-neutral-500 dark:text-neutral-400">characters</span>
              </span>
              <span>
                <strong data-testid="forge-text-words">{textStats.words}</strong>{" "}
                <span className="text-neutral-500 dark:text-neutral-400">words</span>
              </span>
              <span>
                <strong data-testid="forge-text-lines">{textStats.lines}</strong>{" "}
                <span className="text-neutral-500 dark:text-neutral-400">lines</span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
