import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import type {
  AnalyticsBreakdown,
  AnalyticsPaginationInfo,
  AnalyticsReport,
} from "../../shared/analytics";
import { paginationPages } from "../../shared/homepage";
import SettingsDisclosure from "../settings/SettingsDisclosure";
import "../admin/posts-pagination.css";

export type AnalyticsPanel = AnalyticsBreakdown | "daily";
export const AnalyticsControls = createContext<{
  mode: "overview" | "details";
  loading: boolean;
  expanded: AnalyticsPanel | null;
  pagination: AnalyticsReport["pagination"];
  paginate: (section: AnalyticsBreakdown, offset: number) => void;
  showDetails: (section: AnalyticsPanel) => void;
} | null>(null);
export function useAnalyticsControls() {
  const value = useContext(AnalyticsControls);
  if (!value) throw new Error("Analytics controls are unavailable.");
  return value;
}
export function AnalyticsDisclosure({
  section,
  title,
  description,
  children,
}: {
  section: AnalyticsPanel;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const controls = useAnalyticsControls();
  const initial = useRef(
    [
      "pages",
      "tags",
      "sections",
      "media",
      "mediaEvents",
      "commentPages",
    ].includes(section),
  );
  useEffect(() => {
    const details = root.current?.querySelector("details");
    if (details && initial.current) {
      details.open = true;
      initial.current = false;
    }
    if (details && controls.expanded === section) {
      details.open = true;
      details.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [controls.expanded, controls.mode, section]);
  const info = section === "daily" ? null : controls.pagination[section];
  if (controls.mode === "details")
    return (
      <section className="analytics-detail-section" aria-label={title}>
        <p className="analytics-inline-note">{description}</p>
        {children}
      </section>
    );

  return (
    <div
      ref={root}
      className="analytics-disclosure"
      id={`analytics-${section}`}
    >
      <SettingsDisclosure
        title={title}
        description={description}
        status={
          info
            ? `${info.total.toLocaleString()} results`
            : "Daily page views · UTC"
        }
      >
        {children}
      </SettingsDisclosure>
    </div>
  );
}
export function AnalyticsPagination({
  section,
}: {
  section: AnalyticsBreakdown;
}) {
  const controls = useAnalyticsControls();
  const info = controls.pagination[section];
  if (controls.mode === "overview")
    return (
      <div className="analytics-results-footer">
        <span>
          Top {Math.min(info.total, info.pageSize)} of{" "}
          {info.total.toLocaleString()}
        </span>
        <button
          className="button"
          disabled={controls.loading || !info.total}
          onClick={() => controls.showDetails(section)}
        >
          Open details →
        </button>
      </div>
    );
  return (
    <ResultPagination
      label={section}
      info={info}
      disabled={controls.loading}
      onOffset={(offset) => controls.paginate(section, offset)}
    />
  );
}
export function ResultPagination({
  label,
  info,
  disabled,
  onOffset,
}: {
  label: string;
  info: AnalyticsPaginationInfo;
  disabled: boolean;
  onOffset: (offset: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(info.total / info.pageSize));
  const page = Math.floor(info.offset / info.pageSize) + 1;
  return (
    <div className="analytics-results-footer">
      <span role="status">
        {info.total ? info.offset + 1 : 0}–
        {Math.min(info.offset + info.pageSize, info.total)} of{" "}
        {info.total.toLocaleString()}
      </span>
      {pages > 1 && (
        <nav className="posts-pagination" aria-label={`${label} pagination`}>
          <button
            className="button"
            disabled={disabled || page === 1}
            onClick={() => onOffset(info.offset - info.pageSize)}
          >
            ← Previous
          </button>
          <div className="posts-page-numbers">
            {paginationPages(page, pages).map((value, index) =>
              value === "gap" ? (
                <span key={`gap-${index}`}>…</span>
              ) : (
                <button
                  className="button"
                  key={value}
                  aria-label={`Page ${value}`}
                  aria-current={value === page ? "page" : undefined}
                  disabled={disabled}
                  onClick={() => onOffset((value - 1) * info.pageSize)}
                >
                  {value}
                </button>
              ),
            )}
          </div>
          <button
            className="button"
            disabled={disabled || page === pages}
            onClick={() => onOffset(info.offset + info.pageSize)}
          >
            Next →
          </button>
        </nav>
      )}
    </div>
  );
}
