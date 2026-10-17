import { create } from "zustand";
import { useSystem } from "./system";

/**
 * Notification engine — Phase 3.
 *
 * Every notification is stored (persisted to localStorage, capped) and,
 * unless Do Not Disturb is on, also surfaces as a banner that slides in
 * at the top-right and auto-dismisses. Banners are ephemeral; the list
 * in Notification Center is the durable record.
 */

export interface OSNotification {
  id: string;
  source: string; // producing app / service name
  title: string;
  body: string;
  ts: number;
}

const LIST_KEY = "uruk-os-notifications-v1";
const MAX_ITEMS = 50;

function loadList(): OSNotification[] {
  try {
    const raw = localStorage.getItem(LIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as OSNotification[];
      if (Array.isArray(parsed)) return parsed.slice(0, MAX_ITEMS);
    }
  } catch {
    /* ignore */
  }
  return [];
}

function saveList(list: OSNotification[]) {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(list.slice(0, MAX_ITEMS)));
  } catch {
    /* ignore */
  }
}

let counter = 0;
function nid(): string {
  return `ntf-${Date.now().toString(36)}-${++counter}`;
}

interface NotificationStore {
  items: OSNotification[];
  banners: OSNotification[];
  hydrated: boolean;
  hydrateNotifications: () => void;
  notify: (n: { source: string; title: string; body: string }) => void;
  dismissBanner: (id: string) => void;
  remove: (id: string) => void;
  clearAll: () => void;
}

export const useNotifications = create<NotificationStore>((set, get) => ({
  items: [],
  banners: [],
  hydrated: false,

  hydrateNotifications: () => {
    if (get().hydrated) return;
    set({ items: loadList(), hydrated: true });
  },

  notify: ({ source, title, body }) => {
    const item: OSNotification = { id: nid(), source, title, body, ts: Date.now() };
    const items = [item, ...get().items].slice(0, MAX_ITEMS);
    saveList(items);
    const dnd = useSystem.getState().dnd;
    set({
      items,
      banners: dnd ? get().banners : [...get().banners.slice(-2), item],
    });
  },

  dismissBanner: (id) =>
    set((s) => ({ banners: s.banners.filter((b) => b.id !== id) })),

  remove: (id) => {
    const items = get().items.filter((i) => i.id !== id);
    saveList(items);
    set({ items });
  },

  clearAll: () => {
    saveList([]);
    set({ items: [], banners: [] });
  },
}));

/** Convenience for producers outside React. */
export function notify(source: string, title: string, body: string): void {
  useNotifications.getState().notify({ source, title, body });
}
