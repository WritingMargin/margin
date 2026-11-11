import { useEffect, useState } from "react";
import { api } from "../api";
import Accordion from "../Accordion";
import Select from "../components/Select";
import { sitePath } from "../base-path";
import "./guide-analytics.css";

type Guide = { id: string; title: string; slug: string; status: string };
type Step = { id: string; title: string; completed: number };
type Reader = { id: string; name: string; section: string; completed: string[]; reports: number };
type Report = { id: string; step: string; body: string; status: string; createdAt: string };
type Results = { summary: { readers: number; finished: number; reports: number }; steps: Step[]; readers: Reader[]; hasMore: boolean };

function useGuideData<T>(path: string, version = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setData(null); setError("");
    api<T>(path).then(result => { if (active) setData(result); }).catch(cause => { if (active) setError((cause as Error).message); });
    return () => { active = false; };
  }, [path, version]);
  return { data, error };
}

function selectedGuide(data: { guides: Guide[] } | null, selected: string) {
  return data?.guides.find(item => item.id === selected) || data?.guides[0];
}

export default function GuideAnalytics() {
  const [version, setVersion] = useState(0);
  const { data, error } = useGuideData<{ guides: Guide[] }>("/readers/guides", version);
  const [selected, setSelected] = useState("");
  const guide = selectedGuide(data, selected);
  return <section className="guide-analytics" aria-label="Guide responses">
    <div className="guide-analytics-heading"><div><h2>Guide responses</h2><p>See how readers progress and where they need help.</p></div><button type="button" className="button" onClick={() => setVersion(value => value + 1)}>Refresh</button></div>
    <p className="small-text">Saved responses from signed-in readers, across all visits. Guest progress is not saved. Completion means the reader marked a step complete.</p>
    {error && <p role="alert" className="error-box">{error}</p>}
    {!data && !error && <p role="status">Loading guides…</p>}
    {data && !guide && <p>No guides yet. Responses will appear after you publish a guide and readers save their progress.</p>}
    {guide && <>
      <label className="guide-analytics-picker">Guide<Select value={guide.id} onChange={event => setSelected(event.target.value)}>{data?.guides.map(item => <option key={item.id} value={item.id}>{item.title} · {item.status}</option>)}</Select></label>
      <GuideResults key={`${guide.id}:${version}`} guide={guide} />
    </>}
  </section>;
}

function GuideResults({ guide }: { guide: Guide }) {
  const [offset, setOffset] = useState(0);
  const [version, setVersion] = useState(0);
  const { data, error } = useGuideData<Results>(`/readers/guides/${encodeURIComponent(guide.id)}?offset=${offset}`, version);
  return <>
    {error && <p role="alert" className="error-box">{error} <button className="button" onClick={() => setVersion(value => value + 1)}>Retry</button></p>}
    {!data && !error && <p role="status">Loading guide responses…</p>}
    {data && <>
      <div className="guide-analytics-summary"><div><strong>{data.summary.readers}</strong><span>Readers with saved activity</span></div><div><strong>{data.summary.finished}</strong><span>Completed all current steps</span></div><div><strong>{data.summary.reports}</strong><span>Problem reports</span></div></div>
      <Accordion title="Step completion"><div className="guide-analytics-table"><table><thead><tr><th>Step</th><th>Completed</th><th>Share of readers</th></tr></thead><tbody>{data.steps.map(step => <tr key={step.id}><td>{step.title}</td><td>{step.completed}</td><td>{Math.round(step.completed / Math.max(1, data.summary.readers) * 100)}%</td></tr>)}</tbody></table></div>{!data.steps.length && <p>This guide has no steps yet. Add headings to define its steps.</p>}</Accordion>
      <h3>Responses by reader</h3>
      <p className="small-text">Open a reader to see completed steps, their last saved section, and what they reported. Steps reflect the current guide; reports retain the original step title.</p>
      {!data.readers.length && <p>No saved reader activity on this page.</p>}
      {data.readers.map(reader => <ReaderResponse key={reader.id} reader={reader} steps={data.steps} guideId={guide.id} />)}
      <GuidePagination offset={offset} hasMore={data.hasMore} onChange={setOffset} label="Guide readers" />
      <a href={sitePath("/admin/readers?tab=flags")}>Review reported problems in Feedback</a>
    </>}
  </>;
}

function ReaderResponse({ reader, steps, guideId }: { reader: Reader; steps: Step[]; guideId: string }) {
  const [reportsOpen, setReportsOpen] = useState(false);
  const title = `${reader.name || `Reader ${reader.id.slice(0, 8)}`} · ${reader.completed.length} of ${steps.length} complete · ${reader.reports} problem reports`;
  return <Accordion title={title}>
    <p className="small-text">Reader reference: {reader.id}</p>
    <p>Last saved section: <strong>{reader.section || "No current section saved"}</strong></p>
    <ul className="guide-reader-steps">{steps.map(step => <li key={step.id}><span>{step.title}</span><strong>{reader.completed.includes(step.id) ? "Complete" : "Not marked complete"}</strong></li>)}</ul>
    {reader.reports > 0 && <><button className="button" type="button" aria-expanded={reportsOpen} onClick={() => setReportsOpen(value => !value)}>{reportsOpen ? "Hide problem reports" : "Read problem reports"}</button>{reportsOpen && <ReaderReports guideId={guideId} readerId={reader.id} />}</>}
  </Accordion>;
}

function ReaderReports({ guideId, readerId }: { guideId: string; readerId: string }) {
  const [offset, setOffset] = useState(0);
  const [version, setVersion] = useState(0);
  const { data, error } = useGuideData<{ reports: Report[]; hasMore: boolean }>(`/readers/guides/${encodeURIComponent(guideId)}/readers/${encodeURIComponent(readerId)}?offset=${offset}`, version);
  return <div className="guide-reader-reports">
    {error && <p role="alert">{error} <button className="button" onClick={() => setVersion(value => value + 1)}>Retry</button></p>}
    {!data && !error && <p role="status">Loading reports…</p>}
    {data?.reports.map(report => <article key={report.id}><h4>{report.step}</h4><p>{report.body}</p><small>{new Date(report.createdAt).toLocaleDateString()} · {report.status}</small></article>)}
    {data && <GuidePagination offset={offset} hasMore={data.hasMore} onChange={setOffset} label="Reader problem reports" />}
  </div>;
}

function GuidePagination({ offset, hasMore, onChange, label }: { offset: number; hasMore: boolean; onChange: (offset: number) => void; label: string }) {
  return <nav className="guide-analytics-pagination" aria-label={label}><button className="button" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - 20))}>Previous</button><span>Page {offset / 20 + 1}</span><button className="button" disabled={!hasMore} onClick={() => onChange(offset + 20)}>Next</button></nav>;
}
