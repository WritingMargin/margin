import { useCallback, useEffect, useRef, useState } from "react";
import { noteBody, type WorkspaceNote } from "../../shared/notes";
import type { NotePatch } from "./useNotesStore";

type SaveNote = (id: string, patch: NotePatch) => Promise<WorkspaceNote | null>;

export function useNoteDraft(note: WorkspaceNote, onSave: SaveNote) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(() => noteBody(note));
  const [saving, setSaving] = useState(false);
  const previous = useRef(note);
  const dirty = note.canEdit && (title !== note.title || content !== note.content || note.links.length > 0);
  const latest = useRef({ note, title, content, dirty, onSave });
  latest.current = { note, title, content, dirty, onSave };
  const submitted = useRef<{ key: string; promise: Promise<WorkspaceNote | null> } | null>(null);

  // A save may finish after returning to a note. Accept it only when the
  // current editor hasn't made a newer change of its own.
  useEffect(() => {
    const old = previous.current;
    setTitle((value) => value === old.title ? note.title : value);
    setContent((value) => value === noteBody(old) ? noteBody(note) : value);
    previous.current = note;
  }, [note]);

  const flush = useCallback(() => {
    const draft = latest.current;
    if (!draft.dirty) return Promise.resolve(draft.note);
    const patch = { title: draft.title, content: draft.content, links: [] };
    const key = JSON.stringify(patch);
    if (submitted.current?.key === key) return submitted.current.promise;
    setSaving(true);
    const promise = draft.onSave(draft.note.id, patch).finally(() => {
      if (submitted.current?.promise === promise) submitted.current = null;
      setSaving(false);
    });
    submitted.current = { key, promise };
    return promise;
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => void flush(), 600);
    return () => window.clearTimeout(timer);
  }, [dirty, title, content, flush]);

  useEffect(() => {
    const leave = () => { void flush(); };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [flush]);

  return { title, setTitle, content, setContent, dirty, saving, flush };
}
