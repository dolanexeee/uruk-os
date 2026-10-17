import { parseBackupJSON, serializeBackupJSON, type BackupJSON } from "./backup";

/**
 * Optional cloud sync — EXPERIMENTAL (Phase 3).
 *
 * Bring-your-own-backend: the user points Uruk OS at THEIR OWN Supabase
 * project (URL + anon key + a sync id). We ship no server and hold no
 * credentials for anyone. A snapshot is the exact same serialized
 * backup document the .urukos file carries, stored as JSONB in one row
 * of a table the user creates in their project:
 *
 *   create table if not exists urukos_snapshots (
 *     sync_id   text primary key,
 *     payload   jsonb not null,
 *     updated_at timestamptz not null default now()
 *   );
 *   alter table urukos_snapshots enable row level security;
 *   create policy "urukos anon access" on urukos_snapshots
 *     for all using (true) with check (true);
 *
 * (That policy makes the snapshot readable by anyone holding the anon
 * key — the UI says so in plain language. Practical size limits apply:
 * the payload embeds every file as base64, so large libraries will hit
 * request-size limits. The .urukos backup file remains the guaranteed
 * path; sync is a convenience layered on top of it.)
 *
 * This client is written against Supabase's documented REST (PostgREST)
 * API and its serializer is covered by the backup round-trip tests, but
 * the live push/pull has NOT been verified end-to-end against a real
 * project — there is no project to verify against until the user
 * supplies one. It is labeled experimental everywhere it appears.
 */

export interface SyncConfig {
  url: string;
  anonKey: string;
  syncId: string;
}

const SYNC_KEY = "uruk-os-sync-v1";

export const SYNC_TABLE_SQL = `create table if not exists urukos_snapshots (
  sync_id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table urukos_snapshots enable row level security;
create policy "urukos anon access" on urukos_snapshots
  for all using (true) with check (true);`;

export function loadSyncConfig(): SyncConfig {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
    if (raw) return { url: "", anonKey: "", syncId: "my-uruk-os", ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { url: "", anonKey: "", syncId: "my-uruk-os" };
}

export function saveSyncConfig(cfg: SyncConfig) {
  try {
    localStorage.setItem(SYNC_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

function restBase(cfg: SyncConfig): string {
  return cfg.url.replace(/\/+$/, "") + "/rest/v1";
}

function headers(cfg: SyncConfig): Record<string, string> {
  return {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${cfg.anonKey}`,
    "Content-Type": "application/json",
  };
}

async function describeError(res: Response): Promise<string> {
  let detail = "";
  try {
    const body = (await res.json()) as { message?: string; hint?: string; code?: string };
    detail = body.message ?? "";
    if (res.status === 404 || body.code === "PGRST205")
      detail =
        "Table urukos_snapshots was not found. Create it in your Supabase project with the SQL shown below, then try again.";
  } catch {
    /* non-JSON error body */
  }
  return `HTTP ${res.status}${detail ? ` — ${detail}` : ""}`;
}

function assertConfigured(cfg: SyncConfig) {
  if (!cfg.url.trim() || !cfg.anonKey.trim() || !cfg.syncId.trim())
    throw new Error("Fill in the project URL, anon key, and a sync ID first.");
  try {
    new URL(cfg.url);
  } catch {
    throw new Error("The project URL does not look like a URL.");
  }
}

export async function testSyncConnection(cfg: SyncConfig): Promise<string> {
  assertConfigured(cfg);
  const res = await fetch(
    `${restBase(cfg)}/urukos_snapshots?select=sync_id&limit=1`,
    { headers: headers(cfg) },
  );
  if (!res.ok) throw new Error(await describeError(res));
  return "Connected — the urukos_snapshots table answers reads.";
}

export async function pushSnapshot(cfg: SyncConfig): Promise<{ bytes: number }> {
  assertConfigured(cfg);
  const payload: BackupJSON = await serializeBackupJSON();
  const body = JSON.stringify({
    sync_id: cfg.syncId,
    payload,
    updated_at: new Date().toISOString(),
  });
  const res = await fetch(`${restBase(cfg)}/urukos_snapshots`, {
    method: "POST",
    headers: { ...headers(cfg), Prefer: "resolution=merge-duplicates" },
    body,
  });
  if (!res.ok) throw new Error(await describeError(res));
  return { bytes: body.length };
}

export async function pullSnapshot(cfg: SyncConfig): Promise<BackupJSON> {
  assertConfigured(cfg);
  const res = await fetch(
    `${restBase(cfg)}/urukos_snapshots?sync_id=eq.${encodeURIComponent(cfg.syncId)}&select=payload,updated_at`,
    { headers: headers(cfg) },
  );
  if (!res.ok) throw new Error(await describeError(res));
  const rows = (await res.json()) as { payload: BackupJSON }[];
  if (!rows.length || !rows[0].payload)
    throw new Error(`No snapshot stored under sync ID "${cfg.syncId}" yet — push one first.`);
  // Validate the document before anyone tries to restore it.
  parseBackupJSON(rows[0].payload);
  return rows[0].payload;
}
