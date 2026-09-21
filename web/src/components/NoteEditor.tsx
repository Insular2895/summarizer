import { useEffect, useRef, useState } from "react";

import { api, ApiError, NoteExcerpt, NoteRecord } from "../api/client";

const AUTOSAVE_DELAY_MS = 750;
const MAX_AUTOMATIC_RETRIES = 2;
const DRAFT_PREFIX = "summarizer:note-draft:v1:";

type SyncState = "dirty" | "saving" | "saved" | "error" | "conflict";

interface LocalDraft {
  body: string;
  baseVersion: number;
  updatedAt: string;
}

interface InitialState {
  body: string;
  syncState: SyncState;
  conflict: boolean;
}

export function NoteEditor({ videoId, note }: { videoId: string; note: NoteRecord | null }) {
  const serverBody = note?.body ?? "";
  const serverVersion = note?.version ?? 1;
  const [initial] = useState<InitialState>(() => resolveInitialState(videoId, serverBody, serverVersion));
  const [body, setBody] = useState(initial.body);
  const [syncState, setSyncState] = useState<SyncState>(initial.syncState);

  const bodyRef = useRef(initial.body);
  const confirmedBodyRef = useRef(serverBody);
  const versionRef = useRef(serverVersion);
  const excerptsRef = useRef(parseExcerpts(note?.excerpts_json));
  const syncStateRef = useRef<SyncState>(initial.syncState);
  const blockedByConflictRef = useRef(initial.conflict);
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const retryCountRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const mountedRef = useRef(true);
  const userEditedRef = useRef(false);
  const persistRef = useRef<(explicit?: boolean) => Promise<void>>(async () => undefined);

  function updateSyncState(next: SyncState) {
    syncStateRef.current = next;
    if (mountedRef.current) setSyncState(next);
  }

  function cancelScheduledSave() {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }

  function scheduleSave(delayMs: number) {
    cancelScheduledSave();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = undefined;
      void persistRef.current();
    }, delayMs);
  }

  async function refreshAfterConflict() {
    blockedByConflictRef.current = true;
    try {
      const latest = await api.getVideo(videoId);
      if (!latest.note) throw new Error("La note distante est indisponible.");
      versionRef.current = latest.note.version;
      confirmedBodyRef.current = latest.note.body;
      excerptsRef.current = parseExcerpts(latest.note.excerpts_json);
      if (bodyRef.current === latest.note.body) {
        blockedByConflictRef.current = false;
        clearDraft(videoId);
        updateSyncState("saved");
        return;
      }
      writeDraft(videoId, bodyRef.current, latest.note.version);
      updateSyncState("conflict");
    } catch {
      writeDraft(videoId, bodyRef.current, versionRef.current);
      updateSyncState("error");
    }
  }

  persistRef.current = async (explicit = false) => {
    if (blockedByConflictRef.current && !explicit) return;
    if (inFlightRef.current) {
      queuedRef.current = true;
      return;
    }
    cancelScheduledSave();
    const snapshot = bodyRef.current;
    if (snapshot === confirmedBodyRef.current) {
      clearDraft(videoId);
      updateSyncState("saved");
      return;
    }

    inFlightRef.current = true;
    updateSyncState("saving");
    try {
      const saved = await api.saveNote(
        videoId,
        snapshot,
        excerptsRef.current,
        versionRef.current,
      );
      retryCountRef.current = 0;
      versionRef.current = saved.version;
      confirmedBodyRef.current = snapshot;
      blockedByConflictRef.current = false;
      if (bodyRef.current === snapshot) {
        clearDraft(videoId);
        updateSyncState("saved");
      } else {
        writeDraft(videoId, bodyRef.current, saved.version);
        updateSyncState("dirty");
        if (mountedRef.current) scheduleSave(Math.floor(AUTOSAVE_DELAY_MS / 3));
      }
    } catch (error) {
      writeDraft(videoId, bodyRef.current, versionRef.current);
      if (error instanceof ApiError && error.diagnosticCode === "NOTE_VERSION_CONFLICT") {
        await refreshAfterConflict();
      } else if (
        mountedRef.current &&
        isRetryable(error) &&
        retryCountRef.current < MAX_AUTOMATIC_RETRIES
      ) {
        retryCountRef.current += 1;
        scheduleSave(400 * 2 ** (retryCountRef.current - 1));
      } else {
        updateSyncState("error");
      }
    } finally {
      inFlightRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        if (mountedRef.current && !blockedByConflictRef.current) scheduleSave(0);
      }
    }
  };

  function flushOnExit() {
    const snapshot = bodyRef.current;
    if (snapshot === confirmedBodyRef.current) return;
    writeDraft(videoId, snapshot, versionRef.current);
    if (inFlightRef.current || blockedByConflictRef.current) return;
    const baseVersion = versionRef.current;
    void api
      .saveNote(videoId, snapshot, excerptsRef.current, baseVersion, { keepalive: true })
      .then((saved) => {
        versionRef.current = saved.version;
        confirmedBodyRef.current = snapshot;
        const currentDraft = readDraft(videoId);
        if (currentDraft?.body === snapshot) clearDraft(videoId);
      })
      .catch(() => {
        // The local draft is the recovery path after navigation or page exit.
      });
  }

  useEffect(() => {
    mountedRef.current = true;
    if (initial.syncState === "dirty") scheduleSave(AUTOSAVE_DELAY_MS);
    if (initial.syncState === "saved") clearDraft(videoId);

    const handleOnline = () => {
      if (syncStateRef.current === "error" && !blockedByConflictRef.current) {
        retryCountRef.current = 0;
        void persistRef.current(true);
      }
    };
    const handlePageHide = () => flushOnExit();
    window.addEventListener("online", handleOnline);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      mountedRef.current = false;
      cancelScheduledSave();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("pagehide", handlePageHide);
      if (userEditedRef.current) flushOnExit();
    };
    // The parent keys this component by videoId; note is an immutable load snapshot.
  }, [videoId]);

  function handleChange(value: string) {
    userEditedRef.current = true;
    bodyRef.current = value;
    setBody(value);
    if (value === confirmedBodyRef.current) {
      blockedByConflictRef.current = false;
      retryCountRef.current = 0;
      cancelScheduledSave();
      clearDraft(videoId);
      updateSyncState("saved");
      return;
    }
    writeDraft(videoId, value, versionRef.current);
    if (blockedByConflictRef.current) {
      updateSyncState("conflict");
      return;
    }
    retryCountRef.current = 0;
    updateSyncState("dirty");
    scheduleSave(AUTOSAVE_DELAY_MS);
  }

  function retry() {
    blockedByConflictRef.current = false;
    retryCountRef.current = 0;
    updateSyncState("dirty");
    void persistRef.current(true);
  }

  return (
    <div className="note-editor">
      <label className="sr-only" htmlFor={`note-${videoId}`}>
        Note personnelle
      </label>
      <textarea
        id={`note-${videoId}`}
        value={body}
        maxLength={100_000}
        rows={8}
        placeholder="Écrivez ce que vous voulez retenir…"
        onChange={(event) => handleChange(event.currentTarget.value)}
        aria-describedby={`note-status-${videoId}`}
      />
      <div className="note-status-row">
        <span id={`note-status-${videoId}`} className={`note-status note-status-${syncState}`} role="status">
          {statusLabel(syncState)}
        </span>
        {syncState === "error" || syncState === "conflict" ? (
          <button type="button" className="text-button" onClick={retry}>
            Réessayer
          </button>
        ) : null}
      </div>
    </div>
  );
}

function resolveInitialState(videoId: string, serverBody: string, serverVersion: number): InitialState {
  const draft = readDraft(videoId);
  if (!draft || draft.body === serverBody) {
    return { body: serverBody, syncState: "saved", conflict: false };
  }
  if (draft.baseVersion === serverVersion) {
    return { body: draft.body, syncState: "dirty", conflict: false };
  }
  return { body: draft.body, syncState: "conflict", conflict: true };
}

function statusLabel(state: SyncState): string {
  if (state === "saving") return "Enregistrement…";
  if (state === "saved") return "Enregistré";
  if (state === "error") return "Synchronisation interrompue. Brouillon conservé.";
  if (state === "conflict") return "Note modifiée ailleurs. Brouillon conservé.";
  return "Modifications locales";
}

function isRetryable(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status === 0 || error.status === 429 || error.status >= 500;
}

function parseExcerpts(value: string | undefined): NoteExcerpt[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is NoteExcerpt =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as NoteExcerpt).text === "string" &&
        Number.isInteger((item as NoteExcerpt).start_ms),
    );
  } catch {
    return [];
  }
}

function readDraft(videoId: string): LocalDraft | null {
  try {
    const raw = window.localStorage.getItem(`${DRAFT_PREFIX}${videoId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalDraft>;
    if (
      typeof parsed.body !== "string" ||
      parsed.body.length > 100_000 ||
      !Number.isInteger(parsed.baseVersion) ||
      (parsed.baseVersion ?? 0) < 1 ||
      typeof parsed.updatedAt !== "string"
    ) {
      return null;
    }
    return parsed as LocalDraft;
  } catch {
    return null;
  }
}

function writeDraft(videoId: string, body: string, baseVersion: number) {
  try {
    window.localStorage.setItem(
      `${DRAFT_PREFIX}${videoId}`,
      JSON.stringify({ body, baseVersion, updatedAt: new Date().toISOString() } satisfies LocalDraft),
    );
  } catch {
    // Autosave remote still works when browser storage is unavailable.
  }
}

function clearDraft(videoId: string) {
  try {
    window.localStorage.removeItem(`${DRAFT_PREFIX}${videoId}`);
  } catch {
    // Nothing else is required when browser storage is unavailable.
  }
}
