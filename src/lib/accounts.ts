/**
 * Local accounts — Phase 4A.
 *
 * Uruk OS accounts are REAL but LOCAL: the account registry, each
 * account's file system (its own IndexedDB database), its settings,
 * its PIN hash, and its notifications all live on this device, in
 * this browser. There is no server and no sign-up — creating an
 * account is instant and free, and deleting one erases only that
 * account's data. Cross-device sync remains the separate,
 * experimental bring-your-own-Supabase path.
 *
 * Migration: installs from before accounts existed had exactly one
 * implicit user whose data lives under the original, unprefixed
 * storage keys and the original `uruk-os-db` database. That data
 * becomes the first account (id "mustafa", default name "Mustafa",
 * renameable in Settings) — nothing is wiped or moved; the legacy
 * account simply keeps using the legacy storage locations.
 */

export interface Account {
  id: string;
  name: string;
  /** Avatar background color (hex). */
  color: string;
  /** Avatar glyph (single character / symbol). */
  glyph: string;
  guest?: boolean;
  createdAt: number;
}

export const LEGACY_ACCOUNT_ID = "mustafa";
export const GUEST_ACCOUNT_ID = "guest";

const REGISTRY_KEY = "uruk-os-accounts-v1";

interface Registry {
  accounts: Account[];
  lastAccountId: string | null;
}

/* ------------------------------------------------------------------ */
/* Avatar choices                                                      */
/* ------------------------------------------------------------------ */

export const AVATAR_COLORS = [
  "#0a84ff",
  "#bf5af2",
  "#ff375f",
  "#ff9f0a",
  "#30d158",
  "#64d2ff",
  "#ac8e68",
  "#98989d",
];

export const AVATAR_GLYPHS = ["★", "☾", "▲", "●", "◆", "♥", "⚡", "♪", "♞", "☀", "✿", "Ω"];

/** Default glyph: the first letter of the name. */
export function defaultGlyph(name: string): string {
  const ch = name.trim().charAt(0);
  return ch ? ch.toUpperCase() : "U";
}

/* ------------------------------------------------------------------ */
/* The account whose data the running OS is currently bound to.        */
/* Set by the session layer before any store hydrates.                 */
/* ------------------------------------------------------------------ */

let activeAccountId: string = LEGACY_ACCOUNT_ID;

export function setActiveAccountId(id: string): void {
  activeAccountId = id;
}
export function getActiveAccountId(): string {
  return activeAccountId;
}

/* ------------------------------------------------------------------ */
/* Per-account storage locations                                       */
/* ------------------------------------------------------------------ */

function scoped(base: string, accountId: string): string {
  return accountId === LEGACY_ACCOUNT_ID ? base : `${base}:${accountId}`;
}

export function dbNameFor(accountId: string): string {
  return accountId === LEGACY_ACCOUNT_ID ? "uruk-os-db" : `uruk-os-db-${accountId}`;
}
export function settingsKeyFor(accountId: string): string {
  return scoped("uruk-os-settings-v1", accountId);
}
export function systemKeyFor(accountId: string): string {
  return scoped("uruk-os-system-v1", accountId);
}
export function notificationsKeyFor(accountId: string): string {
  return scoped("uruk-os-notifications-v1", accountId);
}
export function pinKeyFor(accountId: string): string {
  return scoped("uruk-os-pin-v1", accountId);
}
export function syncKeyFor(accountId: string): string {
  return scoped("uruk-os-sync-v1", accountId);
}
export function weatherKeyFor(accountId: string): string {
  return scoped("uruk-os-weather-v1", accountId);
}
export function remindedKeyFor(accountId: string): string {
  return scoped("uruk-os-reminded-v1", accountId);
}
export function clockKeyFor(accountId: string): string {
  return scoped("uruk-os-clock-v1", accountId);
}

/** Every localStorage key that belongs to an account (for delete). */
export function accountStorageKeys(accountId: string): string[] {
  return [
    settingsKeyFor(accountId),
    systemKeyFor(accountId),
    notificationsKeyFor(accountId),
    pinKeyFor(accountId),
    syncKeyFor(accountId),
    weatherKeyFor(accountId),
    remindedKeyFor(accountId),
    clockKeyFor(accountId),
    `${weatherKeyFor(accountId)}-forecast`,
  ];
}

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

function loadRegistry(): Registry {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Registry;
      if (Array.isArray(parsed.accounts)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return { accounts: [], lastAccountId: null };
}

function saveRegistry(reg: Registry): void {
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(reg));
  } catch {
    /* ignore */
  }
}

export function listAccounts(): Account[] {
  return loadRegistry().accounts;
}

export function getAccount(id: string): Account | null {
  return loadRegistry().accounts.find((a) => a.id === id) ?? null;
}

export function getLastAccountId(): string | null {
  return loadRegistry().lastAccountId;
}

export function setLastAccountId(id: string | null): void {
  const reg = loadRegistry();
  reg.lastAccountId = id;
  saveRegistry(reg);
}

function newAccountId(): string {
  return (
    "acct-" +
    Math.random().toString(36).slice(2, 9) +
    Date.now().toString(36)
  );
}

export function createAccount(input: {
  name: string;
  color: string;
  glyph: string;
}): Account {
  const reg = loadRegistry();
  const account: Account = {
    id: newAccountId(),
    name: input.name.trim(),
    color: input.color,
    glyph: input.glyph || defaultGlyph(input.name),
    createdAt: Date.now(),
  };
  reg.accounts.push(account);
  saveRegistry(reg);
  return account;
}

export function updateAccount(
  id: string,
  patch: Partial<Pick<Account, "name" | "color" | "glyph">>,
): Account | null {
  const reg = loadRegistry();
  const idx = reg.accounts.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  reg.accounts[idx] = { ...reg.accounts[idx], ...patch };
  saveRegistry(reg);
  return reg.accounts[idx];
}

export function removeAccountFromRegistry(id: string): void {
  const reg = loadRegistry();
  reg.accounts = reg.accounts.filter((a) => a.id !== id);
  if (reg.lastAccountId === id) reg.lastAccountId = null;
  saveRegistry(reg);
}

export function ensureGuestAccount(): Account {
  const existing = getAccount(GUEST_ACCOUNT_ID);
  if (existing) return existing;
  const reg = loadRegistry();
  const guest: Account = {
    id: GUEST_ACCOUNT_ID,
    name: "Guest",
    color: "#98989d",
    glyph: "G",
    guest: true,
    createdAt: Date.now(),
  };
  reg.accounts.push(guest);
  saveRegistry(reg);
  return guest;
}

/**
 * Boot-time migration. Returns the account list the login screen
 * should show. If a registry already exists, it wins. Otherwise:
 *  - a browser that already holds pre-account data (the legacy
 *    IndexedDB database exists, or any legacy localStorage key is
 *    set) gets that data adopted as the first account, "Mustafa";
 *  - a truly fresh browser gets NO accounts, so the login screen
 *    opens on the create-account form (first-run setup).
 */
export async function ensureAccountsMigrated(): Promise<Account[]> {
  const reg = loadRegistry();
  if (reg.accounts.length > 0) return reg.accounts;

  let hasLegacyData = false;
  try {
    if (typeof indexedDB.databases === "function") {
      const dbs = await indexedDB.databases();
      hasLegacyData = dbs.some((d) => d.name === "uruk-os-db");
    }
  } catch {
    /* ignore */
  }
  if (!hasLegacyData) {
    try {
      hasLegacyData = [
        "uruk-os-settings-v1",
        "uruk-os-system-v1",
        "uruk-os-pin-v1",
        "uruk-os-notifications-v1",
      ].some((k) => localStorage.getItem(k) !== null);
    } catch {
      /* ignore */
    }
  }

  if (!hasLegacyData) return [];

  const legacy: Account = {
    id: LEGACY_ACCOUNT_ID,
    name: "Mustafa",
    color: "#0a84ff",
    glyph: "M",
    createdAt: Date.now(),
  };
  saveRegistry({ accounts: [legacy], lastAccountId: LEGACY_ACCOUNT_ID });
  return [legacy];
}
