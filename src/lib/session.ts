/**
 * Session orchestration — Phase 4A.
 *
 * One place that knows how to move the whole OS between accounts:
 * binding the active-account id, swapping the file-system database,
 * re-hydrating every per-account store, and deleting an account's
 * data completely. Components call these; stores stay dumb.
 */

import {
  accountStorageKeys,
  ensureAccountsMigrated,
  ensureGuestAccount,
  getLastAccountId,
  listAccounts,
  removeAccountFromRegistry,
  setActiveAccountId,
  setLastAccountId,
  type Account,
} from "./accounts";
import { closeFSConnection, deleteAccountDatabase, useFS } from "./fs";
import { useOS } from "@/store/os";
import { useSystem } from "@/store/system";
import { useNotifications } from "@/store/notifications";

/**
 * Boot: run the migration, pick the account the login screen should
 * preselect (the last one used), and bind the OS to it so the login
 * screen already shows that account's wallpaper/appearance and its
 * file system is the loaded one.
 */
export async function bootSession(): Promise<void> {
  const accounts = await ensureAccountsMigrated();
  const lastId = getLastAccountId();
  const initial =
    accounts.find((a) => a.id === lastId) ?? accounts[0] ?? null;
  useOS.getState().setAccounts(accounts, true);
  if (initial) await bindAccount(initial, { enterDesktop: false });
}

/** Bind every store to an account (without changing the phase). */
async function bindAccount(
  account: Account,
  opts: { enterDesktop: boolean },
): Promise<void> {
  setActiveAccountId(account.id);
  useOS.getState().setCurrentAccount(account);
  useOS.getState().hydrateSettings();
  useSystem.getState().hydrateSystem();
  useNotifications.getState().reloadForAccount();
  await useFS.getState().switchAccount(account.id, account.name);
  // Re-hydrate once more now that the FS (and any custom wallpaper
  // node it references) is the account's own.
  useOS.getState().hydrateSettings();
  if (opts.enterDesktop) {
    setLastAccountId(account.id);
    useOS.getState().login();
  }
}

/** Log in as an account (from the picker, create form, or guest). */
export async function enterAccount(account: Account): Promise<void> {
  await bindAccount(account, { enterDesktop: true });
  // Refresh the picker list (a create/guest may have just added one).
  useOS.getState().setAccounts(listAccounts(), true);
}

/** Continue as the guest user (own clearly-labeled space). */
export async function enterGuest(): Promise<void> {
  await enterAccount(ensureGuestAccount());
}

/** Lock: session (and its windows) stays alive behind the PIN. */
export function lockSession(): void {
  useOS.getState().lock();
}

/** Log out / switch user: windows close, back to the account picker. */
export function logoutSession(): void {
  useSystem.getState().closePanels();
  useOS.getState().logout();
  useOS.getState().setAccounts(listAccounts(), true);
}

/**
 * Delete an account completely: registry entry, its IndexedDB
 * database, and every localStorage key it owns. Other accounts are
 * untouched. If it is the account in use, the session logs out first.
 */
export async function deleteAccountCompletely(id: string): Promise<void> {
  const isCurrent = useOS.getState().currentAccount?.id === id;
  if (isCurrent) {
    await closeFSConnection();
    logoutSession();
    useOS.getState().setCurrentAccount(null);
  }
  await deleteAccountDatabase(id);
  for (const k of accountStorageKeys(id)) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
  removeAccountFromRegistry(id);
  useOS.getState().setAccounts(listAccounts(), true);
}
