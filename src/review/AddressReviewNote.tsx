import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { api } from "../api";
import Select from "../components/Select";
import Accordion from "../Accordion";

interface Option {
  revision: string;
  version: number;
  savedAt: string;
}
type Props = {
  path: string;
  currentRevision?: string;
  busy: boolean;
  address: (revision: string) => Promise<void>;
};
export default function AddressReviewNote({
  path,
  currentRevision,
  busy,
  address,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Accordion title="Choose fixing revision" onToggle={(e) => setOpen(e.currentTarget.open)}>
      {open && (
        <RevisionPicker
          key={currentRevision}
          path={path}
          busy={busy}
          address={address}
        />
      )}
    </Accordion>
  );
}
function RevisionPicker({ path, busy, address }: Props) {
  const [options, setOptions] = useState<Option[]>([]);
  const [revision, setRevision] = useState("");
  const [cursor, setCursor] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<Option[]>(path + "/revisions" + (cursor ? "?before=" + cursor : ""), {
      signal: controller.signal,
    })
      .then((rows) => {
        if (controller.signal.aborted) return;
        setOptions((existing) => (cursor ? [...existing, ...rows] : rows));
        setMore(rows.length === 50);
        setRevision((current) => current || rows[0]?.revision || "");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, cursor, retry]);
  return (
    <form
      className="peer-fix-form"
      onSubmit={(e) => {
        e.preventDefault();
        void address(revision);
      }}
    >
      {options.length > 0 && (
        <label>
          Saved revision
          <Select
            value={revision}
            onChange={(e) => setRevision(e.target.value)}
            disabled={busy}
          >
            {options.map((row) => (
              <option value={row.revision} key={row.revision}>
                Version {row.version} ·{" "}
                {new Date(row.savedAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </option>
            ))}
          </Select>
        </label>
      )}
      {loading && <p role="status">Loading saved revisions…</p>}
      {error && (
        <p className="error-box" role="alert">
          {error}{" "}
          <button
            className="text-link"
            type="button"
            onClick={() => setRetry((n) => n + 1)}
          >
            Retry
          </button>
        </p>
      )}
      {more && (
        <button
          className="button"
          disabled={busy || loading}
          type="button"
          onClick={() => setCursor(options[options.length - 1].version)}
        >
          Load older revisions
        </button>
      )}
      {options.length > 0 && (
        <button className="button" disabled={!revision || busy}>
          <Check size={14} />
          Mark addressed
        </button>
      )}
      {pickerIsEmpty(options, error, loading) && (
        <p>Save the revision that fixes this note, then choose it here.</p>
      )}
    </form>
  );
}

function pickerIsEmpty(options: Option[], error: string, loading: boolean) {
  return !options.length && !error && !loading;
}
