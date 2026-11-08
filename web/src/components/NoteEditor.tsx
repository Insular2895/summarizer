import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import { api, ApiError, NoteExcerpt, NoteRecord } from "../api/client";

const AUTOSAVE_DELAY_MS = 750;
const MAX_AUTOMATIC_RETRIES = 2;
const DRAFT_PREFIX = "summarizer:note-draft:v1:";

type SyncState = "dirty" | "saving" | "saved" | "error" | "conflict";

interface LocalDraft {
  body: string;
  baseVersion: number;
  updatedAt: string;
  excerpts?: NoteExcerpt[];
}

interface InitialState {
  body: string;
  excerpts: NoteExcerpt[];
  syncState: SyncState;
  conflict: boolean;
}

export interface NoteEditorHandle {
  addExcerpt(excerpt: NoteExcerpt): void;
}

export const NoteEditor = forwardRef<
  NoteEditorHandle,
  { videoId: string; note: NoteRecord | null }
>(function NoteEditor({ videoId, note }, ref) {
  const serverBody = note?.body ?? "";
  const serverVersion = note?.version ?? 1;
  const serverExcerptsRef = useRef(parseExcerpts(note?.excerpts_json));
  const [initial] = useState<InitialState>(() =>
    resolveInitialState(videoId, serverBody, serverExcerptsRef.current, serverVersion),
  );
  const [body, setBody] = useState(initial.body);
  const [excerpts, setExcerpts] = useState(initial.excerpts);
  const [syncState, setSyncState] = useState<SyncState>(initial.syncState);

  const bodyRef = useRef(initial.body);
  const confirmedBodyRef = useRef(serverBody);
  const versionRef = useRef(serverVersion);
  const excerptsRef = useRef(initial.excerpts);
  const confirmedExcerptsRef = useRef(serverExcerptsRef.current);
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
      const latestExcerpts = parseExcerpts(latest.note.excerpts_json);
      confirmedBodyRef.current = latest.note.body;
      confirmedExcerptsRef.current = latestExcerpts;
      if (
        bodyRef.current === latest.note.body &&
        excerptsEqual(excerptsRef.current, latestExcerpts)
      ) {
        blockedByConflictRef.current = false;
        clearDraft(videoId);
        updateSyncState("saved");
        return;
      }
      writeDraft(videoId, bodyRef.current, excerptsRef.current, latest.note.version);
      updateSyncState("conflict");
    } catch {
      writeDraft(videoId, bodyRef.current, excerptsRef.current, versionRef.current);
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
    const bodySnapshot = bodyRef.current;
    const excerptsSnapshot = [...excerptsRef.current];
    if (
      bodySnapshot === confirmedBodyRef.current &&
      excerptsEqual(excerptsSnapshot, confirmedExcerptsRef.current)
    ) {
      clearDraft(videoId);
      updateSyncState("saved");
      return;
    }

    inFlightRef.current = true;
    updateSyncState("saving");
    try {
      const saved = await api.saveNote(
        videoId,
        bodySnapshot,
        excerptsSnapshot,
        versionRef.current,
      );
      retryCountRef.current = 0;
      versionRef.current = saved.version;
      confirmedBodyRef.current = bodySnapshot;
      confirmedExcerptsRef.current = excerptsSnapshot;
      blockedByConflictRef.current = false;
      if (
        bodyRef.current === bodySnapshot &&
        excerptsEqual(excerptsRef.current, excerptsSnapshot)
      ) {
        clearDraft(videoId);
        updateSyncState("saved");
      } else {
        writeDraft(videoId, bodyRef.current, excerptsRef.current, saved.version);
        updateSyncState("dirty");
        if (mountedRef.current) scheduleSave(Math.floor(AUTOSAVE_DELAY_MS / 3));
      }
    } catch (error) {
      writeDraft(videoId, bodyRef.current, excerptsRef.current, versionRef.current);
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
    const bodySnapshot = bodyRef.current;
    const excerptsSnapshot = [...excerptsRef.current];
    if (
      bodySnapshot === confirmedBodyRef.current &&
      excerptsEqual(excerptsSnapshot, confirmedExcerptsRef.current)
    ) {
      return;
    }
    writeDraft(videoId, bodySnapshot, excerptsSnapshot, versionRef.current);
    if (inFlightRef.current || blockedByConflictRef.current) return;
    const baseVersion = versionRef.current;
    void api
      .saveNote(videoId, bodySnapshot, excerptsSnapshot, baseVersion, { keepalive: true })
      .then((saved) => {
        versionRef.current = saved.version;
        confirmedBodyRef.current = bodySnapshot;
        confirmedExcerptsRef.current = excerptsSnapshot;
        const currentDraft = readDraft(videoId);
        if (
          currentDraft?.body === bodySnapshot &&
          excerptsEqual(currentDraft.excerpts ?? [], excerptsSnapshot)
        ) {
          clearDraft(videoId);
        }
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
    if (
      value === confirmedBodyRef.current &&
      excerptsEqual(excerptsRef.current, confirmedExcerptsRef.current)
    ) {
      blockedByConflictRef.current = false;
      retryCountRef.current = 0;
      cancelScheduledSave();
      clearDraft(videoId);
      updateSyncState("saved");
      return;
    }
    writeDraft(videoId, value, excerptsRef.current, versionRef.current);
    if (blockedByConflictRef.current) {
      updateSyncState("conflict");
      return;
    }
    retryCountRef.current = 0;
    updateSyncState("dirty");
    scheduleSave(AUTOSAVE_DELAY_MS);
  }

  function addExcerpt(excerpt: NoteExcerpt) {
    const next = [...excerptsRef.current, excerpt];
    userEditedRef.current = true;
    excerptsRef.current = next;
    setExcerpts(next);
    writeDraft(videoId, bodyRef.current, next, versionRef.current);
    if (blockedByConflictRef.current) {
      updateSyncState("conflict");
      return;
    }
    retryCountRef.current = 0;
    updateSyncState("dirty");
    scheduleSave(AUTOSAVE_DELAY_MS);
  }

  useImperativeHandle(ref, () => ({ addExcerpt }));

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
      {excerpts.length > 0 ? (
        <ol className="note-excerpt-list" aria-label="Extraits ajoutés">
          {excerpts.map((excerpt, index) => (
            <li key={`${excerpt.start_ms}-${index}`}>
              <button type="button" className="timestamp-button" onClick={() => revealTranscript(excerpt.start_ms)}>
                {formatTimestamp(excerpt.start_ms)}
              </button>
              <blockquote>{excerpt.text}</blockquote>
            </li>
          ))}
        </ol>
      ) : null}
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
});

function resolveInitialState(
  videoId: string,
  serverBody: string,
  serverExcerpts: NoteExcerpt[],
  serverVersion: number,
): InitialState {
  const draft = readDraft(videoId);
  const draftExcerpts = draft?.excerpts ?? serverExcerpts;
  if (!draft || (draft.body === serverBody && excerptsEqual(draftExcerpts, serverExcerpts))) {
    return { body: serverBody, excerpts: serverExcerpts, syncState: "saved", conflict: false };
  }
  if (draft.baseVersion === serverVersion) {
    return { body: draft.body, excerpts: draftExcerpts, syncState: "dirty", conflict: false };
  }
  return { body: draft.body, excerpts: draftExcerpts, syncState: "conflict", conflict: true };
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
    return parseExcerptArray(parsed) ?? [];
  } catch {
    return [];
  }
}

function readDraft(videoId: string): LocalDraft | null {
  try {
    const raw = window.localStorage.getItem(`${DRAFT_PREFIX}${videoId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalDraft>;
    const excerpts = parsed.excerpts === undefined ? undefined : parseExcerptArray(parsed.excerpts);
    if (
      typeof parsed.body !== "string" ||
      parsed.body.length > 100_000 ||
      !Number.isInteger(parsed.baseVersion) ||
      (parsed.baseVersion ?? 0) < 1 ||
      typeof parsed.updatedAt !== "string" ||
      excerpts === null
    ) {
      return null;
    }
    return { ...parsed, excerpts } as LocalDraft;
  } catch {
    return null;
  }
}

function writeDraft(
  videoId: string,
  body: string,
  excerpts: NoteExcerpt[],
  baseVersion: number,
) {
  try {
    window.localStorage.setItem(
      `${DRAFT_PREFIX}${videoId}`,
      JSON.stringify({
        body,
        excerpts,
        baseVersion,
        updatedAt: new Date().toISOString(),
      } satisfies LocalDraft),
    );
  } catch {
    // Autosave remote still works when browser storage is unavailable.
  }
}

function parseExcerptArray(value: unknown): NoteExcerpt[] | null {
  if (!Array.isArray(value) || value.length > 500) return null;
  const excerpts: NoteExcerpt[] = [];
  for (const item of value) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as NoteExcerpt).text !== "string" ||
      (item as NoteExcerpt).text.length > 5_000 ||
      !Number.isInteger((item as NoteExcerpt).start_ms) ||
      (item as NoteExcerpt).start_ms < 0
    ) {
      return null;
    }
    excerpts.push({
      text: (item as NoteExcerpt).text,
      start_ms: (item as NoteExcerpt).start_ms,
    });
  }
  return excerpts;
}

function excerptsEqual(left: NoteExcerpt[], right: NoteExcerpt[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (excerpt, index) =>
        excerpt.text === right[index]?.text && excerpt.start_ms === right[index]?.start_ms,
    )
  );
}

function formatTimestamp(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
    : `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function revealTranscript(startMs: number) {
  const block = document.querySelector<HTMLElement>(`[data-transcript-start="${startMs}"]`);
  block?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function clearDraft(videoId: string) {
  try {
    window.localStorage.removeItem(`${DRAFT_PREFIX}${videoId}`);
  } catch {
    // Nothing else is required when browser storage is unavailable.
  }
}
