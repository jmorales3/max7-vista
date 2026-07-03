import { get, set, del, keys, createStore, type UseStore } from "idb-keyval";
import { uploadPatientImage } from "@/lib/upload";

/**
 * Persistent offline upload queue.
 *
 * Why: clinic Wi-Fi can drop mid-visit. Previously the capture queue lived
 * only in React state — a dropped connection or an accidental refresh meant
 * the photos were gone and had to be re-taken. This module persists each
 * pending upload (as a Blob, in IndexedDB so it survives reloads) and
 * retries automatically when the network comes back, so nothing is lost.
 */

export interface QueuedUpload {
  id: string;
  patientId: number;
  blob: Blob;
  fileName: string;
  mimeType: string;
  notes?: string;
  capturedAt: string;
  status: "pending" | "uploading" | "failed";
  error?: string;
  attempts: number;
  createdAt: string;
}

const store: UseStore = createStore("max7-upload-queue", "uploads");

type Listener = (items: QueuedUpload[]) => void;
const listeners = new Set<Listener>();
let cache: QueuedUpload[] | null = null;
let processing = false;

async function loadAll(): Promise<QueuedUpload[]> {
  if (cache) return cache;
  const allKeys = await keys(store);
  const items = await Promise.all(
    allKeys.map((k) => get<QueuedUpload>(k, store)),
  );
  cache = items.filter((i): i is QueuedUpload => !!i).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  return cache;
}

function notify() {
  if (!cache) return;
  for (const l of listeners) l([...cache]);
}

export function subscribeUploadQueue(listener: Listener): () => void {
  listeners.add(listener);
  loadAll().then((items) => listener([...items]));
  return () => listeners.delete(listener);
}

export async function enqueueUpload(item: Omit<QueuedUpload, "id" | "status" | "attempts" | "createdAt">): Promise<string> {
  const id = crypto.randomUUID();
  const queued: QueuedUpload = {
    ...item,
    id,
    status: "pending",
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
  await set(id, queued, store);
  const all = await loadAll();
  all.push(queued);
  notify();
  return id;
}

async function removeFromQueue(id: string) {
  await del(id, store);
  if (cache) {
    cache = cache.filter((i) => i.id !== id);
    notify();
  }
}

async function updateInQueue(id: string, patch: Partial<QueuedUpload>) {
  const all = await loadAll();
  const idx = all.findIndex((i) => i.id === id);
  if (idx === -1) return;
  const updated = { ...all[idx], ...patch };
  all[idx] = updated;
  await set(id, updated, store);
  notify();
}

export async function retryUpload(id: string) {
  await updateInQueue(id, { status: "pending", error: undefined });
  void processQueue();
}

export async function discardUpload(id: string) {
  await removeFromQueue(id);
}

/**
 * Attempts to upload every pending item in the queue, in order. Safe to call
 * repeatedly (e.g. on network reconnect, app load, or after enqueueing) —
 * re-entrant calls are ignored while a pass is already running.
 */
export async function processQueue(): Promise<void> {
  if (processing) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  processing = true;
  try {
    const all = await loadAll();
    const pending = all.filter((i) => i.status === "pending" || i.status === "failed");
    for (const item of pending) {
      // Re-check online status between items — a mid-batch drop should stop
      // further attempts rather than fail every remaining item loudly.
      if (typeof navigator !== "undefined" && navigator.onLine === false) break;
      await updateInQueue(item.id, { status: "uploading" });
      try {
        const file = new File([item.blob], item.fileName, { type: item.mimeType });
        await uploadPatientImage(file, item.patientId, item.notes, item.capturedAt);
        await removeFromQueue(item.id);
      } catch (err) {
        await updateInQueue(item.id, {
          status: "failed",
          attempts: item.attempts + 1,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    processing = false;
  }
}

export async function getQueueSnapshot(): Promise<QueuedUpload[]> {
  return loadAll();
}

let listenersAttached = false;
export function ensureUploadQueueListening() {
  if (listenersAttached || typeof window === "undefined") return;
  listenersAttached = true;
  window.addEventListener("online", () => void processQueue());
  void processQueue();
}
