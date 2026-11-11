import { Check,BookOpen,FileText,Home,MessageSquare,PanelBottom } from "lucide-react";
import "../blog-design.css";
import ArticleControls from "./ArticleControls";
import CommentControls from "./CommentControls";
import DesignPreview from "./DesignPreview";
import DesignPresets from "./DesignPresets";
import HomepageControls from "./HomepageControls";
import FooterControls from "./FooterControls";
import { useDesigner } from "./useDesigner";
import DesignConfig, { DesignMode } from "./DesignConfig";
import "./designer-mobile.css";
export function Designer(props: Parameters<typeof useDesigner>[0]) {
  const state = useDesigner(props);
  const {
    saveDesign,
    section,
    setSection,
    saving,
    uploadingLogo,
    error,
    changed,
  } = state;
  return (
    <section className="page-content designer-page expanded-designer">
      <div className="page-heading">
        <div>
          <span className="eyebrow">MAKE YOURSELF AT HOME</span>
          <h1>Your publication. Your signature.</h1>
          <p>A welcoming homepage. Thoughtful writing. Room for conversation.</p>
        </div>
        <div className="design-save-actions">
          <span className={changed ? "design-unsaved" : "muted"}>
            {changed ? "Unsaved changes" : "All changes saved"}
          </span>
          <button
            className="button primary"
            disabled={saving || uploadingLogo || !changed || state.config.pending}
            onClick={saveDesign}
          >
            {saving ? "Saving…" : "Save design"}
            <Check size={15} />
          </button>
        </div>
      </div>
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      <div
        className="design-section-tabs"
        role="tablist"
        aria-label="Design section"
      >
        {(
          [
            { id: "homepage", label: "Homepage", icon: Home },
            { id: "article", label: "Articles", icon: FileText },
            { id: "guide", label: "Guides", icon: BookOpen },
            { id: "comments", label: "Comments", icon: MessageSquare },
            { id: "footer", label: "Footer", icon: PanelBottom },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            id={`design-tab-${tab.id}`}
            role="tab"
            aria-selected={section === tab.id}
            aria-controls="design-controls-panel"
            className={section === tab.id ? "active" : ""}
            onClick={() => setSection(tab.id)}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
        <span>Every detail, considered.</span>
      </div>
      <DesignMode state={state} />
      <DesignWorkspace state={state} />
    </section>
  );
}

function DesignWorkspace({ state }: { state: ReturnType<typeof useDesigner> }) {
  const { section } = state;
  if (state.config.mode === "templates" && section !== "comments" && section !== "footer") return <DesignPresets key={section} state={state} section={section} />;
  return <>
      <a className="designer-mobile-jump" href="#design-preview-panel">Jump to preview ↓</a>
      <div className={`designer-grid ${state.config.mode === "json" ? "json-mode" : ""}`}>
        <div
          className="design-controls"
          id="design-controls-panel"
          role="tabpanel"
          aria-labelledby={`design-tab-${section}`}
        >
          {state.config.mode === "json" ? <DesignConfig state={state} /> : <DesignControls state={state} />}
        </div>
        <DesignPreview state={state} />
      </div>
  </>;
}

function DesignControls({ state }: { state: ReturnType<typeof useDesigner> }) {
  if (state.section === "homepage") return <HomepageControls state={state} />;
  if (state.section === "footer") return <FooterControls theme={state.local} onChange={state.update} />;
  if (state.section !== "comments") return <ArticleControls state={state} />;
  return <CommentControls state={state} />;
}
