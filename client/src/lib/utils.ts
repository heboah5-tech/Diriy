import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { supabase, doc, setDoc } from "./firebase";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const onlyNumbers = (value: string) => {
  return value.replace(/[^\d٠-٩]/g, "");
};

// Online presence:
//   The old Firebase implementation used Realtime Database + onDisconnect to
//   flip `online: false` automatically when the tab closed. Supabase realtime
//   doesn't expose an equivalent "onDisconnect" write, so we approximate the
//   behaviour with a Presence channel: as long as the tab keeps the channel
//   subscribed we mirror `online: true` onto the pay row, and a beforeunload
//   handler best-effort writes `online: false`. We also re-touch `lastSeen`
//   periodically so admins can spot stale records.
const PRESENCE_HEARTBEAT_MS = 25_000;

// One presence session per userId per tab. setupOnlineStatus is invoked from
// a few places (App.tsx mount, registration, reserve flow); we make it
// idempotent so heartbeats / channels / unload listeners don't stack up.
type PresenceHandle = {
  cleanup: () => void;
};
const activePresence = new Map<string, PresenceHandle>();

export const setupOnlineStatus = (userId: string) => {
  if (!userId || !supabase) return () => {};
  const existing = activePresence.get(userId);
  if (existing) return existing.cleanup;

  const ref = doc(null, "pays", userId);
  const writeOnline = (online: boolean) =>
    setDoc(
      ref,
      { online, lastSeen: new Date().toISOString() },
      { merge: true },
    ).catch((err) => console.error("Error syncing online state:", err));

  const channel = supabase.channel(`presence:${userId}`, {
    config: { presence: { key: userId } },
  });

  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      void channel.track({ online_at: new Date().toISOString() });
      void writeOnline(true);
    }
  });

  const heartbeat = window.setInterval(() => {
    void writeOnline(true);
  }, PRESENCE_HEARTBEAT_MS);

  const goOffline = () => {
    void writeOnline(false);
  };
  window.addEventListener("beforeunload", goOffline);
  window.addEventListener("pagehide", goOffline);

  const cleanup = () => {
    window.clearInterval(heartbeat);
    window.removeEventListener("beforeunload", goOffline);
    window.removeEventListener("pagehide", goOffline);
    void supabase!.removeChannel(channel);
    void writeOnline(false);
    activePresence.delete(userId);
  };
  activePresence.set(userId, { cleanup });
  return cleanup;
};

export const setUserOffline = async (userId: string) => {
  if (!userId || !supabase) return;
  try {
    await setDoc(
      doc(null, "pays", userId),
      { online: false, lastSeen: new Date().toISOString() },
      { merge: true },
    );
  } catch (error) {
    console.error("Error setting user offline:", error);
  }
};
