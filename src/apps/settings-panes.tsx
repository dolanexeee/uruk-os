import React, { useRef, useState } from "react";
import { useOS } from "@/store/os";
import { useSystem } from "@/store/system";
import { useNotifications } from "@/store/notifications";
import { formatBytes } from "@/lib/fs";
import { hasPin, removePin, setPin, verifyPin } from "@/lib/security";
import {
  backupFilename,
  downloadBackup,
  exportBackupZip,
  parseBackupJSON,
  parseBackupZip,
  restoreBackup,
  type BackupData,
} from "@/lib/backup";
import {
  SYNC_TABLE_SQL,
  loadSyncConfig,
  pullSnapshot,
  pushSnapshot,
  saveSyncConfig,
  testSyncConnection,
  type SyncConfig,
} from "@/lib/sync";
import {
  AVATAR_COLORS,
  AVATAR_GLYPHS,
  listAccounts,
  updateAccount,
} from "@/lib/accounts";
import { deleteAccountCompletely } from "@/lib/session";
import Avatar from "@/components/Avatar";

/* ---------------------------------------------------------------- */
/* Account pane — rename, avatar, delete (Phase 4A)                   */
/* ---------------------------------------------------------------- */

export function AccountPane({ onGoSecurity }: { onGoSecurity: () => void }) {
  const os = useOS();
  const account = os.currentAccount;
  const [name, setName] = useState(account?.name ?? "");
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!account) {
    return (
      <div data-testid="settings-account">
        <h2 className="mb-4 text-[19px] font-bold">Account</h2>
        <p className="text-[13px] text-neutral-500">No account is signed in.</p>
      </div>
    );
  }

  const apply = (patch: { name?: string; color?: string; glyph?: string }, msg: string) => {
    const updated = updateAccount(account.id, patch);
    if (updated) {
      os.setCurrentAccount(updated);
      os.setAccounts(listAccounts(), true);
      setStatus({ ok: true, msg });
    }
  };

  const inputCls =
    "w-64 rounded-lg border border-black/10 bg-neutral-50 px-3 py-1.5 text-[13.5px] outline-none focus:border-[var(--accent)] dark:border-white/15 dark:bg-neutral-800";

  return (
    <div data-testid="settings-account">
      <h2 className="mb-4 text-[19px] font-bold">Account</h2>

      <div className="mb-5 flex items-center gap-3">
        <Avatar account={account} size={52} />
        <div className="leading-tight">
          <div className="text-[15px] font-semibold">{account.name}</div>
          <div className="text-[12px] text-neutral-500 dark:text-neutral-400">
            {account.guest ? "Guest space" : "Local account"} · on this device since{" "}
            {new Date(account.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>

      <p className="mb-6 max-w-md text-[12.5px] leading-5 text-neutral-500 dark:text-neutral-400">
        This account lives <b>only on this device, in this browser</b> —
        its files, settings, and PIN never leave the machine and there
        is no server and no sign-up. Other accounts on this device
        cannot see this account&apos;s files. To move between devices,
        use a .urukos backup (Backup pane) or the experimental
        bring-your-own-Supabase sync.
      </p>

      <div className="mb-2 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
        Display name
      </div>
      <div className="mb-6 flex items-center gap-2">
        <input
          data-testid="account-rename-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputCls}
        />
        <button
          data-testid="account-rename-save"
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
          disabled={!name.trim() || name.trim() === account.name}
          onClick={() => apply({ name: name.trim() }, "Name saved.")}
        >
          Save
        </button>
      </div>

      <div className="mb-2 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
        Avatar color
      </div>
      <div className="mb-5 flex items-center gap-2">
        {AVATAR_COLORS.map((c, i) => (
          <button
            key={c}
            data-testid={`account-avatar-color-${i}`}
            title={c}
            className={`h-7 w-7 rounded-full transition-transform hover:scale-110 ${
              account.color === c ? "ring-2 ring-neutral-400 ring-offset-2 dark:ring-offset-neutral-900" : ""
            }`}
            style={{ backgroundColor: c }}
            onClick={() => apply({ color: c }, "Avatar color saved.")}
          />
        ))}
      </div>

      <div className="mb-2 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
        Avatar symbol
      </div>
      <div className="mb-6 flex max-w-sm flex-wrap items-center gap-1.5">
        {AVATAR_GLYPHS.map((g, i) => (
          <button
            key={g}
            data-testid={`account-avatar-glyph-${i}`}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-[15px] ring-1 ring-black/10 dark:ring-white/15 ${
              account.glyph === g
                ? "bg-[var(--accent)] text-white"
                : "bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
            }`}
            onClick={() => apply({ glyph: g }, "Avatar symbol saved.")}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="mb-6 flex items-center gap-3 border-t border-black/10 pt-4 dark:border-white/10">
        <span className="text-[13px]">
          Lock-screen PIN: <b>{hasPin(account.id) ? "set" : "not set"}</b>
        </span>
        <button
          className="rounded-lg border border-black/10 px-3 py-1 text-[12.5px] hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
          onClick={onGoSecurity}
        >
          Manage in Security →
        </button>
      </div>

      <div className="border-t border-red-200 pt-4 dark:border-red-500/25">
        <div className="mb-1 text-[13.5px] font-semibold text-red-600 dark:text-red-400">
          {account.guest ? "Erase guest space" : "Delete this account"}
        </div>
        <p className="mb-3 max-w-md text-[12.5px] leading-5 text-neutral-500 dark:text-neutral-400">
          Permanently erases <b>this account&apos;s</b> files, settings,
          and PIN from this device. Every other account is left exactly
          as it is. This cannot be undone.
        </p>
        {!confirmingDelete ? (
          <button
            data-testid="account-delete"
            className="rounded-lg border border-red-300 px-3.5 py-1.5 text-[13px] font-medium text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10"
            onClick={() => setConfirmingDelete(true)}
          >
            {account.guest ? "Erase guest space…" : "Delete account…"}
          </button>
        ) : (
          <div className="flex items-center gap-2" data-testid="account-delete-confirm-box">
            <button
              data-testid="account-delete-confirm"
              disabled={deleting}
              className="rounded-lg bg-red-500 px-3.5 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
              onClick={() => {
                setDeleting(true);
                void deleteAccountCompletely(account.id);
              }}
            >
              {deleting ? "Erasing…" : "Yes, erase everything for this account"}
            </button>
            <button
              data-testid="account-delete-cancel"
              className="rounded-lg border border-black/10 px-3 py-1.5 text-[13px] dark:border-white/15"
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {status && (
        <div
          data-testid="account-status"
          className={`mt-4 text-[12.5px] ${status.ok ? "text-green-600 dark:text-green-400" : "text-red-500"}`}
        >
          {status.msg}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* System pane — weather city, screensaver idle, lock                 */
/* ---------------------------------------------------------------- */

export function SystemPane() {
  const os = useOS();
  const sys = useSystem();
  const [city, setCity] = useState(sys.weatherCity);
  const [citySaved, setCitySaved] = useState(false);

  return (
    <div data-testid="settings-system">
      <h2 className="mb-4 text-[19px] font-bold">System</h2>

      <div className="mb-2 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
        Weather City
      </div>
      <div className="mb-1 flex items-center gap-2">
        <input
          data-testid="settings-weather-city"
          value={city}
          onChange={(e) => {
            setCity(e.target.value);
            setCitySaved(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              sys.setWeatherCity(city);
              setCitySaved(true);
            }
          }}
          placeholder="Baghdad"
          className="w-56 rounded-lg border border-black/10 bg-neutral-50 px-3 py-1.5 text-[13.5px] outline-none focus:border-[var(--accent)] dark:border-white/15 dark:bg-neutral-800"
        />
        <button
          data-testid="settings-weather-apply"
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[13px] font-medium text-white"
          onClick={() => {
            sys.setWeatherCity(city);
            setCitySaved(true);
          }}
        >
          Apply
        </button>
        {citySaved && <span className="text-[12.5px] text-green-600 dark:text-green-400">Saved</span>}
      </div>
      <p className="mb-6 text-[12px] leading-5 text-neutral-500 dark:text-neutral-400">
        Used by the weather widget in Notification Center. Weather comes
        from the free Open-Meteo service — no key, no account.
      </p>

      <div className="mb-2 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
        Screensaver
      </div>
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[13.5px]">Start after</span>
        <select
          data-testid="settings-idle-timeout"
          value={String(sys.idleTimeoutSec)}
          onChange={(e) => sys.setIdleTimeoutSec(Number(e.target.value))}
          className="rounded-lg border border-black/10 bg-neutral-50 px-2 py-1.5 text-[13.5px] outline-none focus:border-[var(--accent)] dark:border-white/15 dark:bg-neutral-800"
        >
          <option value="0">Never</option>
          <option value="10">10 seconds (for testing)</option>
          <option value="60">1 minute</option>
          <option value="300">5 minutes</option>
          <option value="900">15 minutes</option>
        </select>
      </div>
      <p className="mb-6 text-[12px] leading-5 text-neutral-500 dark:text-neutral-400">
        When the screensaver starts, moving the mouse or pressing a key
        wakes the machine to the lock screen.
      </p>

      <button
        data-testid="settings-lock-now"
        className="rounded-lg border border-black/10 px-3.5 py-1.5 text-[13px] font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
        onClick={() => os.lock()}
      >
        Lock Screen Now
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Security pane — the lock-screen PIN                              */
/* ---------------------------------------------------------------- */

const PIN_RULE = /^\d{4,12}$/;

export function SecurityPane() {
  const [pinExists, setPinExists] = useState(() => hasPin());
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const fail = (msg: string) => setStatus({ ok: false, msg });
  const done = (msg: string) => {
    setStatus({ ok: true, msg });
    setCurrent("");
    setNext("");
    setConfirm("");
    setPinExists(hasPin());
  };

  const validateNew = (): boolean => {
    if (!PIN_RULE.test(next)) {
      fail("PIN must be 4–12 digits.");
      return false;
    }
    if (next !== confirm) {
      fail("The two PIN entries do not match.");
      return false;
    }
    return true;
  };

  const inputCls =
    "w-52 rounded-lg border border-black/10 bg-neutral-50 px-3 py-1.5 text-[13.5px] tracking-[0.25em] outline-none focus:border-[var(--accent)] dark:border-white/15 dark:bg-neutral-800";

  return (
    <div data-testid="settings-security">
      <h2 className="mb-4 text-[19px] font-bold">Security</h2>
      <div className="mb-2 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
        Lock-Screen PIN
      </div>
      <p className="mb-4 max-w-md text-[12.5px] leading-5 text-neutral-500 dark:text-neutral-400">
        {pinExists
          ? "A PIN is set for this account. The lock screen asks for it before unlocking. Only a salted SHA-256 hash of the PIN is stored on this device — never the PIN itself."
          : "Set a PIN to lock this account. Only a salted SHA-256 hash is stored on this device — never the PIN itself. This is a local lock, not a network password — each account has its own."}
      </p>

      {pinExists && (
        <div className="mb-3">
          <div className="mb-1 text-[12.5px] text-neutral-500 dark:text-neutral-400">Current PIN</div>
          <input
            data-testid="pin-current"
            type="password"
            inputMode="numeric"
            value={current}
            onChange={(e) => setCurrent(e.target.value.replace(/[^\d]/g, "").slice(0, 12))}
            className={inputCls}
          />
        </div>
      )}
      <div className="mb-3 flex flex-wrap gap-4">
        <div>
          <div className="mb-1 text-[12.5px] text-neutral-500 dark:text-neutral-400">
            {pinExists ? "New PIN" : "PIN"}
          </div>
          <input
            data-testid="pin-new"
            type="password"
            inputMode="numeric"
            value={next}
            onChange={(e) => setNext(e.target.value.replace(/[^\d]/g, "").slice(0, 12))}
            className={inputCls}
          />
        </div>
        <div>
          <div className="mb-1 text-[12.5px] text-neutral-500 dark:text-neutral-400">Confirm PIN</div>
          <input
            data-testid="pin-confirm"
            type="password"
            inputMode="numeric"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value.replace(/[^\d]/g, "").slice(0, 12))}
            className={inputCls}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          data-testid="pin-set"
          className="rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-[13px] font-medium text-white"
          onClick={() => {
            void (async () => {
              if (pinExists && !(await verifyPin(current))) {
                fail("The current PIN is not correct.");
                return;
              }
              if (!validateNew()) return;
              await setPin(next);
              done(pinExists ? "PIN changed." : "PIN set. The lock screen now asks for it.");
            })();
          }}
        >
          {pinExists ? "Change PIN" : "Set PIN"}
        </button>
        {pinExists && (
          <button
            data-testid="pin-remove"
            className="rounded-lg border border-red-300 px-3.5 py-1.5 text-[13px] font-medium text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-400 dark:hover:bg-red-500/10"
            onClick={() => {
              void (async () => {
                if (!(await verifyPin(current))) {
                  fail("Enter the current PIN to remove it.");
                  return;
                }
                removePin();
                done("PIN removed. The lock screen no longer asks for one.");
              })();
            }}
          >
            Remove PIN
          </button>
        )}
      </div>

      {status && (
        <div
          data-testid="pin-status"
          className={`mt-3 text-[12.5px] ${status.ok ? "text-green-600 dark:text-green-400" : "text-red-500"}`}
        >
          {status.msg}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Backup pane — export/import .urukos + experimental sync          */
/* ---------------------------------------------------------------- */

interface PendingRestore {
  data: BackupData;
  label: string;
  files: number;
}

export function BackupPane() {
  const notify = useNotifications((s) => s.notify);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingRestore | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const [sync, setSync] = useState<SyncConfig>(() => loadSyncConfig());
  const [syncStatus, setSyncStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);

  const doExport = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const bytes = await exportBackupZip();
      const name = backupFilename();
      downloadBackup(bytes, name);
      setStatus({
        ok: true,
        msg: `Backup downloaded: ${name} (${formatBytes(bytes.length)}). Keep it somewhere safe — it contains your whole file system.`,
      });
      notify({ source: "Backup", title: "Backup finished", body: `${name} · ${formatBytes(bytes.length)}. Store it somewhere safe.` });
    } catch (err) {
      setStatus({ ok: false, msg: `Export failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setBusy(false);
    }
  };

  const onImportFile = async (f: File) => {
    setStatus(null);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const data = parseBackupZip(bytes);
      setPending({
        data,
        label: `${f.name} · created ${new Date(data.createdAt).toLocaleString()}`,
        files: data.nodes.filter((n) => n.type === "file").length,
      });
    } catch (err) {
      setStatus({ ok: false, msg: `That file could not be read: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  const runRestore = async (mode: "replace" | "merge") => {
    if (!pending) return;
    setBusy(true);
    try {
      const { files } = await restoreBackup(pending.data, mode);
      setStatus({
        ok: true,
        msg: mode === "replace"
          ? `Restore complete — this machine now matches the backup (${files} files).`
          : `Merge complete — ${files} files from the backup were added alongside yours.`,
      });
      notify({ source: "Backup", title: "Restore complete", body: `${files} files restored (${mode}).` });
      setPending(null);
    } catch (err) {
      setStatus({ ok: false, msg: `Restore failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setBusy(false);
    }
  };

  const syncRun = async (fn: () => Promise<string>) => {
    setSyncBusy(true);
    setSyncStatus(null);
    saveSyncConfig(sync);
    try {
      setSyncStatus({ ok: true, msg: await fn() });
    } catch (err) {
      setSyncStatus({ ok: false, msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setSyncBusy(false);
    }
  };

  const syncField =
    "w-full rounded-lg border border-black/10 bg-neutral-50 px-3 py-1.5 text-[13px] outline-none focus:border-[var(--accent)] dark:border-white/15 dark:bg-neutral-800";

  return (
    <div data-testid="settings-backup">
      <h2 className="mb-4 text-[19px] font-bold">Backup &amp; Restore</h2>
      <p className="mb-4 max-w-lg text-[12.5px] leading-5 text-neutral-500 dark:text-neutral-400">
        This account lives in this browser. A backup is a single
        <code className="mx-1 rounded bg-black/5 px-1 dark:bg-white/10">.urukos</code>
        file holding this account's entire file system (files included)
        plus its settings — free forever, stored wherever you keep it.
        The lock-screen PIN is never part of a backup.
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          data-testid="backup-export"
          disabled={busy}
          className="rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
          onClick={() => void doExport()}
        >
          Export Backup (.urukos)
        </button>
        <button
          data-testid="backup-import"
          disabled={busy}
          className="rounded-lg border border-black/10 px-3.5 py-1.5 text-[13px] font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10 disabled:opacity-50"
          onClick={() => importRef.current?.click()}
        >
          Import Backup…
        </button>
        <input
          ref={importRef}
          data-testid="backup-import-input"
          type="file"
          accept=".urukos,application/octet-stream"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImportFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {pending && (
        <div
          data-testid="backup-confirm"
          className="mb-6 max-w-lg rounded-xl border border-amber-300/70 bg-amber-50 p-3.5 dark:border-amber-500/30 dark:bg-amber-500/10"
        >
          <div className="text-[13.5px] font-semibold text-neutral-800 dark:text-neutral-100">
            Restore this backup?
          </div>
          <div className="mb-1 mt-0.5 text-[12.5px] text-neutral-600 dark:text-neutral-300">
            {pending.label} · {pending.files} files
          </div>
          <p className="mb-3 text-[12.5px] leading-5 text-neutral-600 dark:text-neutral-300">
            <b>Replace</b> erases this machine's current file system and
            settings, then restores the backup exactly. <b>Merge</b> adds
            the backup's files alongside yours — nothing is overwritten.
          </p>
          <div className="flex gap-2">
            <button
              data-testid="backup-confirm-replace"
              disabled={busy}
              className="rounded-lg bg-red-500 px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
              onClick={() => void runRestore("replace")}
            >
              Replace everything
            </button>
            <button
              data-testid="backup-confirm-merge"
              disabled={busy}
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
              onClick={() => void runRestore("merge")}
            >
              Merge alongside
            </button>
            <button
              className="rounded-lg border border-black/10 px-3 py-1.5 text-[13px] dark:border-white/15"
              onClick={() => setPending(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {status && (
        <div
          data-testid="backup-status"
          className={`mb-6 text-[12.5px] ${status.ok ? "text-green-600 dark:text-green-400" : "text-red-500"}`}
        >
          {status.msg}
        </div>
      )}

      {/* ------------------------- sync ------------------------- */}
      <div className="border-t border-black/10 pt-5 dark:border-white/10" data-testid="sync-panel">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-bold">Cloud Sync</h3>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
            Experimental
          </span>
        </div>
        <p className="mb-3 mt-1.5 max-w-lg text-[12.5px] leading-5 text-neutral-500 dark:text-neutral-400">
          Bring your own backend: point URUK OS at <b>your own</b> Supabase
          project and it can push/pull a snapshot of this machine. URUK OS
          ships no server and holds no keys for anyone. This feature is
          implemented against Supabase's REST API but has not been verified
          end-to-end against a live project — treat the .urukos file as
          the reliable path.
        </p>
        <div className="mb-3 grid max-w-lg gap-2.5">
          <label className="block">
            <span className="mb-1 block text-[12px] text-neutral-500 dark:text-neutral-400">Project URL</span>
            <input
              data-testid="sync-url"
              value={sync.url}
              onChange={(e) => setSync({ ...sync, url: e.target.value })}
              placeholder="https://xyzcompany.supabase.co"
              className={syncField}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] text-neutral-500 dark:text-neutral-400">Anon (public) key</span>
            <input
              data-testid="sync-key"
              value={sync.anonKey}
              onChange={(e) => setSync({ ...sync, anonKey: e.target.value })}
              placeholder="eyJhbGciOi…"
              className={syncField}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] text-neutral-500 dark:text-neutral-400">Sync ID (names your snapshot row)</span>
            <input
              data-testid="sync-id"
              value={sync.syncId}
              onChange={(e) => setSync({ ...sync, syncId: e.target.value })}
              className={syncField}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            data-testid="sync-test"
            disabled={syncBusy}
            className="rounded-lg border border-black/10 px-3 py-1.5 text-[13px] font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10 disabled:opacity-50"
            onClick={() =>
              void syncRun(async () => {
                saveSyncConfig(sync);
                return testSyncConnection(sync);
              })
            }
          >
            Test connection
          </button>
          <button
            data-testid="sync-push"
            disabled={syncBusy}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
            onClick={() =>
              void syncRun(async () => {
                const { bytes } = await pushSnapshot(sync);
                notify({ source: "Sync", title: "Snapshot pushed", body: `Snapshot for "${sync.syncId}" uploaded (${formatBytes(bytes)}).` });
                return `Snapshot pushed for "${sync.syncId}" (${formatBytes(bytes)} of JSON).`;
              })
            }
          >
            Push snapshot
          </button>
          <button
            data-testid="sync-pull"
            disabled={syncBusy}
            className="rounded-lg border border-black/10 px-3 py-1.5 text-[13px] font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10 disabled:opacity-50"
            onClick={() =>
              void syncRun(async () => {
                const doc = await pullSnapshot(sync);
                const data = parseBackupJSON(doc);
                setPending({
                  data,
                  label: `Pulled snapshot "${sync.syncId}" · ${new Date(doc.createdAt).toLocaleString()}`,
                  files: data.nodes.filter((n) => n.type === "file").length,
                });
                return "Snapshot downloaded — choose Replace or Merge above to apply it.";
              })
            }
          >
            Pull snapshot
          </button>
        </div>
        {syncStatus && (
          <div
            data-testid="sync-status"
            className={`mb-3 max-w-lg text-[12.5px] leading-5 ${syncStatus.ok ? "text-green-600 dark:text-green-400" : "text-red-500"}`}
          >
            {syncStatus.msg}
          </div>
        )}
        <details className="max-w-lg">
          <summary className="cursor-pointer text-[12.5px] font-medium text-[var(--accent)]">
            One-time setup: create the table in your Supabase project
          </summary>
          <pre className="uruk-scroll mt-2 overflow-x-auto rounded-lg bg-neutral-100 p-3 text-[11.5px] leading-5 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
            {SYNC_TABLE_SQL}
          </pre>
          <p className="mt-2 text-[12px] leading-5 text-neutral-500 dark:text-neutral-400">
            Plain-language warning: the policy in that SQL lets anyone who
            has your anon key read and write the snapshot table — and the
            anon key is, by design, a public key. Use a project you control
            and a sync ID nobody can guess, or don't use sync. Snapshots
            embed every file as base64 text, so big libraries get big:
            provider request limits can reject very large pushes.
          </p>
        </details>
      </div>
    </div>
  );
}
