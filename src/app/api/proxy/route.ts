/**
 * Ishtar Gate same-origin proxy — Phase 4A.
 *
 * The Browser app used to iframe sites directly, so any site sending
 * framing-protection headers (X-Frame-Options / CSP frame-ancestors)
 * simply refused to appear. This route fetches the page server-side
 * and returns it from OUR origin with its URLs rewritten back through
 * the proxy, so the page renders inside the OS browser.
 *
 * What it does:
 *  - GET and POST, manual redirect following (re-validated per hop),
 *  - a desktop user-agent,
 *  - HTML rewriting: href/src/action/poster/srcset attributes, CSS
 *    url()/@import (inline styles, <style> blocks, and stylesheets),
 *    <base> removal, plus an injected shim that routes link clicks,
 *    form submissions, and window.open calls that static rewriting
 *    cannot see,
 *  - non-HTML assets pass through with their content type.
 *
 * SSRF guards: only http/https; loopback, private, link-local, and
 * CGNAT addresses are refused — as literal IPs and as DNS results.
 * (The DNS check is a pre-flight; like every such guard it cannot
 * fully eliminate rebinding races, which is acceptable here: the
 * route fetches only public web content and never forwards cookies
 * or credentials.)
 *
 * Honest limits: cookies are not forwarded or stored, so logins do
 * not persist; JavaScript-heavy web apps that build their own
 * absolute URLs, use websockets, or demand service workers may not
 * fully work through a rewriting proxy. Content, news, reference,
 * and documentation sites are the target.
 */

import { NextRequest, NextResponse } from "next/server";
import dns from "node:dns/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const MAX_RESPONSE_BYTES = 25 * 1024 * 1024;
const MAX_REQUEST_BODY = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 25_000;

/* ------------------------------------------------------------------ */
/* SSRF guards                                                         */
/* ------------------------------------------------------------------ */

function isBlockedIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT shared space
    return false;
  }
  const low = ip.toLowerCase();
  if (low === "::1" || low === "::") return true;
  if (low.startsWith("::ffff:")) return isBlockedIp(low.slice(7));
  if (/^fe[89ab]/.test(low)) return true; // fe80::/10 link-local
  if (low.startsWith("fc") || low.startsWith("fd")) return true; // fc00::/7 ULA
  return false;
}

async function guardTarget(url: URL): Promise<string | null> {
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return "Only http:// and https:// pages can be proxied.";
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan") ||
    host.endsWith(".home")
  )
    return "Local network addresses are not proxied.";
  if (isBlockedIp(host)) return "That address is on a private or loopback network — not proxied.";
  try {
    const records = await dns.lookup(host, { all: true });
    if (records.some((r) => isBlockedIp(r.address)))
      return "That hostname resolves to a private or loopback address — not proxied.";
  } catch {
    /* DNS failure will surface as a fetch error below */
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Rewriting                                                           */
/* ------------------------------------------------------------------ */

const PROXY_PREFIX = "/api/proxy?url=";

function proxify(abs: string): string {
  // encodeURIComponent leaves ' unescaped, which could break out of a
  // single-quoted attribute — encode it too (it decodes back exactly).
  return PROXY_PREFIX + encodeURIComponent(abs).replace(/'/g, "%27");
}

/**
 * Attribute values are HTML-escaped in the source (& → &amp;). Undo
 * that before resolving, or proxied URLs end up with a literal
 * "amp;" inside their query strings — which silently broke
 * Wikipedia's load.php stylesheet/script URLs.
 */
function decodeAttrEntities(v: string): string {
  return v
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function resolveAndProxify(raw: string, base: URL): string | null {
  const v = decodeAttrEntities(raw.trim());
  if (!v || v.startsWith("#")) return null;
  if (/^(data|blob|javascript|mailto|tel|sms|about|chrome|view-source|ftp):/i.test(v)) return null;
  try {
    const u = new URL(v, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return proxify(u.toString());
  } catch {
    return null;
  }
}

function rewriteCss(css: string, base: URL): string {
  let out = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, _q, u: string) => {
    const next = resolveAndProxify(u, base);
    return next ? `url("${next}")` : m;
  });
  out = out.replace(/@import\s+(['"])([^'"]+)\1/gi, (m, _q, u: string) => {
    const next = resolveAndProxify(u, base);
    return next ? `@import "${next}"` : m;
  });
  return out;
}

function shimScript(target: URL): string {
  const t = JSON.stringify(target.toString());
  return (
    `<script>(function(){var T=${t};var P="/api/proxy?url=";` +
    `function px(u){try{var x=new URL(u,T);if(x.protocol==="http:"||x.protocol==="https:")return P+encodeURIComponent(x.toString());}catch(e){}return null;}` +
    `document.addEventListener("click",function(e){var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a)return;var h=a.getAttribute("href");if(!h||h.charAt(0)==="#"||h.indexOf("/api/proxy")===0)return;var n=px(h);if(n)a.setAttribute("href",n);},true);` +
    `document.addEventListener("submit",function(e){var f=e.target;if(!f||!f.getAttribute)return;var act=f.getAttribute("action")||T;if(act.indexOf("/api/proxy")===0)return;var n=px(act);if(n)f.setAttribute("action",n);},true);` +
    `var wo=window.open;window.open=function(u){if(typeof u==="string"){var n=px(u);if(n)return wo.call(window,n);}return wo.apply(window,arguments);};` +
    `})();</script>`
  );
}

function rewriteHtml(html: string, pageUrl: URL): string {
  let out = html;

  // A <base> from the origin site would defeat the rewriting.
  out = out.replace(/<base\b[^>]*>/gi, "");

  // URL-bearing attributes.
  out = out.replace(
    /\b(href|src|action|poster|cite|data)\s*=\s*("([^"]*)"|'([^']*)')/gi,
    (m, attr: string, q: string, dq?: string, sq?: string) => {
      const next = resolveAndProxify(dq ?? sq ?? "", pageUrl);
      if (!next) return m;
      const quote = q.startsWith('"') ? '"' : "'";
      return `${attr}=${quote}${next}${quote}`;
    },
  );

  // srcset (skip when it carries data: URIs — comma-splitting is unsafe there).
  out = out.replace(/\bsrcset\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, q: string, dq?: string, sq?: string) => {
    const val = dq ?? sq ?? "";
    if (val.includes("data:")) return m;
    const rewritten = val
      .split(",")
      .map((part) => {
        const bits = part.trim().split(/\s+/);
        if (!bits[0]) return part;
        const next = resolveAndProxify(bits[0], pageUrl);
        if (next) bits[0] = next;
        return bits.join(" ");
      })
      .join(", ");
    const quote = q.startsWith('"') ? '"' : "'";
    return `srcset=${quote}${rewritten}${quote}`;
  });

  // <style> blocks.
  out = out.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, open, css: string, close) => {
    return open + rewriteCss(css, pageUrl) + close;
  });

  // Inline style attributes.
  out = out.replace(/\bstyle\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, q: string, dq?: string, sq?: string) => {
    const quote = q.startsWith('"') ? '"' : "'";
    return `style=${quote}${rewriteCss(dq ?? sq ?? "", pageUrl)}${quote}`;
  });

  // Inject the runtime shim as early as possible.
  const shim = shimScript(pageUrl);
  if (/<head\b[^>]*>/i.test(out)) out = out.replace(/<head\b[^>]*>/i, (m) => m + shim);
  else if (/<html\b[^>]*>/i.test(out)) out = out.replace(/<html\b[^>]*>/i, (m) => m + shim);
  else out = shim + out;

  return out;
}

/* ------------------------------------------------------------------ */
/* Error page (the Browser app detects the marker and shows its own   */
/* honest state with an "Open in real tab" action)                     */
/* ------------------------------------------------------------------ */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function proxyErrorResponse(target: string, message: string): NextResponse {
  const html =
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<title>Could not load page</title></head>` +
    `<body style="font-family:system-ui,sans-serif;margin:40px;color:#333">` +
    `<div data-uruk-proxy-error="${escapeHtml(message)}" hidden></div>` +
    `<h1 style="font-size:20px">This page could not be loaded</h1>` +
    `<p>${escapeHtml(message)}</p>` +
    `<p style="color:#777;font-size:13px">Target: ${escapeHtml(target)}</p>` +
    `</body></html>`;
  return new NextResponse(html, {
    status: 502,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

/* ------------------------------------------------------------------ */
/* Fetch with manual, re-validated redirects                           */
/* ------------------------------------------------------------------ */

interface UpstreamResult {
  res: Response;
  finalUrl: URL;
}

async function fetchFollowing(
  start: URL,
  init: { method: string; headers: Record<string, string>; body?: ArrayBuffer },
): Promise<UpstreamResult> {
  let current = start;
  let method = init.method;
  let body = init.body;
  for (let hop = 0; hop <= 5; hop++) {
    const res = await fetch(current, {
      method,
      headers: init.headers,
      body: body && method !== "GET" && method !== "HEAD" ? body : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) return { res, finalUrl: current };
      const next = new URL(loc, current);
      const blocked = await guardTarget(next);
      if (blocked) throw new Error(`Redirect refused: ${blocked}`);
      if ([301, 302, 303].includes(res.status) && method !== "GET" && method !== "HEAD") {
        method = "GET";
        body = undefined;
      }
      current = next;
      continue;
    }
    return { res, finalUrl: current };
  }
  throw new Error("Too many redirects.");
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */

async function handle(req: NextRequest): Promise<NextResponse> {
  const targetRaw = req.nextUrl.searchParams.get("url");
  if (!targetRaw) return proxyErrorResponse("", "Missing ?url= parameter.");

  let target: URL;
  try {
    target = new URL(targetRaw);
  } catch {
    return proxyErrorResponse(targetRaw, "That is not a valid URL.");
  }

  const blocked = await guardTarget(target);
  if (blocked) {
    return new NextResponse(blocked, {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const headers: Record<string, string> = {
    "user-agent": DESKTOP_UA,
    accept: req.headers.get("accept") ?? "*/*",
    "accept-language": "en-US,en;q=0.9",
    referer: target.origin + "/",
  };

  let body: ArrayBuffer | undefined;
  if (req.method === "POST") {
    body = await req.arrayBuffer();
    if (body.byteLength > MAX_REQUEST_BODY)
      return proxyErrorResponse(targetRaw, "The form submission was too large to proxy.");
    const ct = req.headers.get("content-type");
    if (ct) headers["content-type"] = ct;
  }

  let upstream: UpstreamResult;
  try {
    upstream = await fetchFollowing(target, { method: req.method, headers, body });
  } catch (err) {
    return proxyErrorResponse(
      targetRaw,
      `URUK OS could not reach that site (${err instanceof Error ? err.message : String(err)}). It may be down, or it may refuse proxy access.`,
    );
  }

  const { res, finalUrl } = upstream;
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const lowerType = contentType.toLowerCase();

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_RESPONSE_BYTES)
    return proxyErrorResponse(targetRaw, "That response was too large to proxy.");

  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_RESPONSE_BYTES)
    return proxyErrorResponse(targetRaw, "That response was too large to proxy.");

  // Upstream server errors on document requests become our honest
  // error page; 4xx pages pass through (rewritten) as the site sent them.
  const accept = req.headers.get("accept") ?? "";
  if (res.status >= 500 && accept.includes("text/html")) {
    return proxyErrorResponse(
      targetRaw,
      `The site answered with an error (HTTP ${res.status}) when URUK OS asked for it.`,
    );
  }

  if (lowerType.includes("text/html")) {
    const charset = /charset=([\w-]+)/i.exec(contentType)?.[1] ?? "utf-8";
    let text: string;
    try {
      text = new TextDecoder(charset).decode(buf);
    } catch {
      text = new TextDecoder("utf-8").decode(buf);
    }
    return new NextResponse(rewriteHtml(text, finalUrl), {
      status: res.status,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  if (lowerType.includes("text/css")) {
    const text = new TextDecoder("utf-8").decode(buf);
    return new NextResponse(rewriteCss(text, finalUrl), {
      status: res.status,
      headers: { "content-type": "text/css; charset=utf-8", "cache-control": "no-cache" },
    });
  }

  // Everything else (images, fonts, scripts, media, downloads…)
  // passes through untouched with its own content type. Framing and
  // embedding protection headers are deliberately NOT forwarded.
  return new NextResponse(buf, {
    status: res.status,
    headers: { "content-type": contentType, "cache-control": "private, max-age=300" },
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
