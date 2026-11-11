import { useEffect, useState } from "react";
import {
  commentIdentityKey,
  readCommentIdentity,
  writeCommentIdentity,
  type CommentIdentity,
} from "./comment-identity";

const identityChanged = "margin:comment-identity-changed";

export function useCommentIdentity() {
  const [identity, setIdentity] = useState<CommentIdentity>({
    name: "",
    email: "",
  });
  const [remember, setRemember] = useState(false);
  const [storageMessage, setStorageMessage] = useState("");
  useEffect(() => {
    function refresh() {
      const saved = readCommentIdentity();
      setRemember(saved !== null);
      if (saved) setIdentity(saved);
    }
    function storageChanged(event: StorageEvent) {
      if (event.key === null || event.key === commentIdentityKey) refresh();
    }
    refresh();
    window.addEventListener(identityChanged, refresh);
    window.addEventListener("storage", storageChanged);
    return () => {
      window.removeEventListener(identityChanged, refresh);
      window.removeEventListener("storage", storageChanged);
    };
  }, []);
  function persist(value: CommentIdentity | null) {
    if (!writeCommentIdentity(value)) {
      setStorageMessage(
        value
          ? "Your browser couldn’t save these details on this device."
          : "Your browser couldn’t remove the saved details. Clear this site’s browser storage to forget them.",
      );
      return false;
    }
    setStorageMessage("");
    window.dispatchEvent(new Event(identityChanged));
    return true;
  }
  function changeIdentity(key: keyof CommentIdentity, value: string) {
    const next = { ...identity, [key]: value };
    setIdentity(next);
    if (remember) persist(next);
  }
  function changeRemember(value: boolean) {
    if (persist(value ? identity : null)) setRemember(value);
  }
  return { identity, remember, storageMessage, changeIdentity, changeRemember };
}
