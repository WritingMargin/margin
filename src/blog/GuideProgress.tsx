import { useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronRight, CircleHelp, ListChecks, Minus, Flag } from "lucide-react";
import { useCommentAuth } from "./useCommentAuth";
import ReaderAuth from "./ReaderAuth";
import Accordion from "../Accordion";
import { guideReturnPath, type GuideStep } from "./guide-progress";
import { useGuideCompanion } from "./useGuideCompanion";
import GuideStepReport from "./GuideStepReport";
import "./guide-progress.css";

type Progress = ReturnType<typeof useGuideCompanion>;
export default function GuideProgress({ id, revision, children }: { id: string; revision: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const auth = useCommentAuth();
  const progress = useGuideCompanion(root, id, revision, auth);
  const [pinned, setPinned] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [suppressed, setSuppressed] = useState(false);
  const [report, setReport] = useState<GuideStep | null>(null);
  const [login, setLogin] = useState(false);
  const panelId = useId();
  const open = !suppressed && (pinned || hovered || focused);
  const signInAuth = { ...auth, signIn: (provider: string, email = "") => {
    progress.beforeSignIn();
    return auth.signIn(provider, email, root.current?.parentElement ? guideReturnPath(root.current.parentElement) : undefined);
  } };
  function minimize() { setPinned(false); setSuppressed(true); trigger.current?.focus(); }
  function expand() { setSuppressed(false); setPinned(true); }
  return <>
    <div ref={root} className="guide-companion-anchor" />
    {progress.steps.length > 0 && <aside className="guide-companion" aria-label="Guide companion" data-open={open}
      onMouseEnter={() => { setHovered(true); setSuppressed(false); }} onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setFocused(false); setSuppressed(false); } }}
      onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); minimize(); } }}>
      <div id={panelId} className="guide-companion-panel" hidden={!open}>
        <header><div><ListChecks size={17} aria-hidden="true" /><strong>Your guide</strong></div><button type="button" className="guide-icon-button" onClick={minimize} aria-label="Minimize guide"><Minus size={18} /></button></header>
        {login && !auth.reader ? <div className="guide-login">
          <button type="button" className="guide-back" onClick={()=>setLogin(false)}>← Back to steps</button>
          <ReaderAuth auth={signInAuth} showSession={false} prompt="Sign in to save completed steps and pick up where you left off, on any device. The writer can see your saved progress." />
        </div> : report ? <GuideStepReport key={report.id} step={report} postId={id} revision={revision} auth={signInAuth} onBack={()=>setReport(null)} /> : <>
          <GuideSteps progress={progress} onReport={step=>{setPinned(true);setReport(step);}} />
          <div className="guide-companion-account">
            {auth.reader ? <><small role="status">{progress.status}</small><small>Your saved progress is visible to the writer.</small></> : <>
              <button type="button" className="guide-sign-in" title="Sign in to keep completed steps and resume across visits and devices." onClick={()=>{setPinned(true);setLogin(true);}}><CircleHelp size={14} aria-hidden="true" /> Sign in to keep your progress</button>
              <small>Progress lasts until you reload.</small>
            </>}
          </div>
        </>}
      </div>
      <button type="button" ref={trigger} className="guide-companion-launcher" aria-label={open ? "Minimize guide" : "Open guide"} aria-expanded={open} aria-controls={panelId} onClick={()=>{ if (open && pinned) minimize(); else expand(); }} title="Your guide progress">
        <ListChecks size={23} aria-hidden="true" /><span>{progress.completed.filter(id=>progress.steps.some(step=>step.id===id)).length}/{progress.steps.length}</span>
      </button>
    </aside>}
    {children}
  </>;
}

function GuideSteps({progress, onReport}: {progress:Progress; onReport:(step:GuideStep)=>void}) {
  const index = Math.max(0, progress.steps.findIndex(step=>step.id===progress.active));
  const step = progress.steps[index];
  const done = progress.completed.includes(step.id);
  const count = progress.steps.filter(step=>progress.completed.includes(step.id)).length;
  return <div className="guide-steps">
    <div className="guide-completion"><span>{count} of {progress.steps.length} complete</span><progress aria-label="Completed guide steps" value={count} max={progress.steps.length} /></div>
    <div className="guide-current-step">
      <span className="guide-step-number">STEP {index + 1} OF {progress.steps.length}</span>
      <h3>{step.title}</h3>
      <label className="guide-complete-control"><input type="checkbox" checked={done} disabled={!progress.ready || progress.busy} onChange={()=>void progress.toggle(step.id)} /><span>{done ? "Step complete" : "Mark step complete"}</span></label>
      <div className="guide-step-actions"><button type="button" onClick={()=>onReport(step)}><Flag size={14} aria-hidden="true" /> Report a problem</button>{index + 1 < progress.steps.length && <button type="button" onClick={()=>progress.jump(progress.steps[index+1])}>Next step <ChevronRight size={15} aria-hidden="true" /></button>}</div>
    </div>
    <div className="guide-all-steps"><Accordion title="All steps"><ol>{progress.steps.map((item, at)=><li key={item.id}>
      <button type="button" onClick={()=>progress.jump(item)} aria-current={item.id===step.id ? "step" : undefined}>
        <span className="guide-step-marker">{progress.completed.includes(item.id) ? <Check size={13} aria-label="Complete" /> : at+1}</span><span>{item.title}</span>
      </button>
    </li>)}</ol></Accordion></div>
    {count === progress.steps.length && <p className="guide-finished" role="status">All steps complete. Nicely done.</p>}
  </div>;
}
