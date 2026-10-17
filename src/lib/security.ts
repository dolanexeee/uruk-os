/**
 * Lock-screen PIN — Phase 3.
 *
 * Only a salted SHA-256 hash is ever stored (in localStorage, on this
 * device only). The plaintext PIN exists in memory long enough to be
 * hashed and is then discarded. There is no server; this is a local
 * lock, not an account credential.
 */

const PIN_KEY = "uruk-os-pin-v1";

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

function loadRecord(): PinRecord | null {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as PinRecord;
    return rec.salt && rec.hash ? rec : null;
  } catch {
    return null;
  }
}

export function hasPin(): boolean {
  return loadRecord() !== null;
}

export async function setPin(pin: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPin(pin, salt);
  const rec: PinRecord = { salt: b64encode(salt), hash: b64encode(hash) };
  localStorage.setItem(PIN_KEY, JSON.stringify(rec));
}

export async function verifyPin(pin: string): Promise<boolean> {
  const rec = loadRecord();
  if (!rec) return false;
  const candidate = await hashPin(pin, b64decode(rec.salt));
  const expected = b64decode(rec.hash);
  if (candidate.length !== expected.length) return false;
  // Constant-time comparison, so the check itself leaks nothing useful.
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) diff |= candidate[i] ^ expected[i];
  return diff === 0;
}

export function removePin(): void {
  localStorage.removeItem(PIN_KEY);
}
