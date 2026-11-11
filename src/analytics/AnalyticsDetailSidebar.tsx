import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type {
  AnalyticsBreakdown,
  AnalyticsReport,
} from "../../shared/analytics";
import Select from "../components/Select";
import { AnalyticsControls, type AnalyticsPanel } from "./AnalyticsControls";
import AnalyticsBreakdownView, {
  breakdownTitles,
} from "./AnalyticsBreakdownView";
import PageSelect from "./PageSelect";
import { useAnalyticsData } from "./useAnalyticsData";

export default function AnalyticsDetailSidebar({
  section,
  range,
  page,
  pageOptions,
  version,
  contentType,
  onClose,
}: {
  section: AnalyticsPanel;
  range: { from: string; to: string };
  page: string;
  pageOptions: AnalyticsReport["pageOptions"];
  version: number;
  contentType: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selectedPage, setSelectedPage] = useState(page);
  const [pageSize, setPageSize] = useState(10);
  const [offsets, setOffsets] = useState<
    Partial<Record<AnalyticsBreakdown, number>>
  >({});
  const [retry, setRetry] = useState(0);
  const report = useAnalyticsData(
    range,
    selectedPage,
    pageSize,
    offsets,
    version + retry,
    contentType,
  );
  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  function changePage(value: string) {
    setSelectedPage(value);
    setOffsets({});
  }
  return (
    <dialog
      ref={dialog}
      className="analytics-detail-drawer"
      aria-labelledby="analytics-detail-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="analytics-drawer-shell">
        <header className="analytics-drawer-header">
          <div>
            <span className="analytics-drawer-eyebrow">ANALYTICS DETAILS</span>
            <h2 id="analytics-detail-title">{breakdownTitles[section]}</h2>
            <p className="analytics-period">
              {range.from} — {range.to} · UTC
            </p>
          </div>
          <button
            className="button"
            aria-label="Close details"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="analytics-drawer-body">
          <div className="analytics-toolbar">
            <PageSelect
              value={selectedPage}
              options={pageOptions}
              onChange={changePage}
            />
            <label>
              Rows per page
              <Select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setOffsets({});
                }}
              >
                <option value={10}>10 rows</option>
                <option value={25}>25 rows</option>
                <option value={50}>50 rows</option>
              </Select>
            </label>
          </div>
          {report.loading && (
            <p className="analytics-update" role="status">
              Updating details…
            </p>
          )}
          {report.error && (
            <div className="analytics-error" role="alert">
              <strong>Details couldn’t load.</strong>
              <p>{report.error}</p>
              <button
                className="button"
                onClick={() => setRetry((value) => value + 1)}
              >
                Try again
              </button>
            </div>
          )}
          {report.data && !report.error && (
            <AnalyticsControls.Provider
              value={{
                mode: "details",
                loading: report.loading,
                expanded: null,
                pagination: report.data.pagination,
                paginate: (key, offset) =>
                  setOffsets((value) => ({ ...value, [key]: offset })),
                showDetails: () => {},
              }}
            >
              <div aria-busy={report.loading}>
                <AnalyticsBreakdownView
                  key={selectedPage}
                  section={section}
                  data={report.data}
                  onPage={changePage}
                />
              </div>
            </AnalyticsControls.Provider>
          )}
        </div>
      </div>
    </dialog>
  );
}
