/**
 * Per-account lock-screen PIN — Phase 3, made per-account in Phase 4A.
 *
 * Only a salted SHA-256 hash is ever stored (in localStorage, on this
 * device only, under a key scoped to the owning account). The
 * plaintext PIN exists in memory long enough to be hashed and is
 * then discarded. There is no server; this is a local lock, not a
 * network credential.
 */

import { getActiveAccountId, pinKeyFor } from "./accounts";

interface PinRecord {
  salt: string; // base64
  hash: string; // base64
}

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hashPin(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const data = new TextEncoder().encode(`${b64encode(salt)}::${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

function keyFor(accountId?: string): string {
  return pinKeyFor(accountId ?? getActiveAccountId());
}

function loadRecord(accountId?: string): PinRecord | null {
  try {
    const raw = localStorage.getItem(keyFor(accountId));
    if (!raw) return null;
    const rec = JSON.parse(raw) as PinRecord;
    return rec.salt && rec.hash ? rec : null;
  } catch {
    return null;
  }
}

export function hasPin(accountId?: string): boolean {
  return loadRecord(accountId) !== null;
}

export async function setPin(pin: string, accountId?: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPin(pin, salt);
  const rec: PinRecord = { salt: b64encode(salt), hash: b64encode(hash) };
  localStorage.setItem(keyFor(accountId), JSON.stringify(rec));
}

export async function verifyPin(pin: string, accountId?: string): Promise<boolean> {
  const rec = loadRecord(accountId);
  if (!rec) return false;
  const candidate = await hashPin(pin, b64decode(rec.salt));
  const expected = b64decode(rec.hash);
  if (candidate.length !== expected.length) return false;
  // Constant-time comparison, so the check itself leaks nothing useful.
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) diff |= candidate[i] ^ expected[i];
  return diff === 0;
}

export function removePin(accountId?: string): void {
  localStorage.removeItem(keyFor(accountId));
}
