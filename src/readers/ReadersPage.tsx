import { useState, type KeyboardEvent } from "react";
import PageHeading from "../components/PageHeading";
import CommentsAdmin from "../admin/CommentsAdmin";
import type { AdminController } from "../admin/useAdminController";
import type { ReadersTab } from "../admin-route";
import ReaderSettings from "./ReaderSettings";
import Subscribers from "./Subscribers";
import Campaigns from "./Campaigns";
import FlagsAdmin from "./FlagsAdmin";
import GuideAnalytics from "./GuideAnalytics";
import "./readers.css";

const tabs: { id: ReadersTab; label: string }[] = [
  { id: "conversations", label: "Conversations" },
  { id: "guides", label: "Guides" },
  { id: "subscribers", label: "Subscribers" },
  { id: "campaigns", label: "Campaigns" },
  { id: "settings", label: "Settings" },
];
export default function ReadersPage({ state }: { state: AdminController }) {
  const tab = state.route.readersTab === "flags" ? "conversations" : state.route.readersTab || "conversations";
  const [feedbackOpen, setFeedbackOpen] = useState(state.route.readersTab === "flags");
  const open = (readersTab: ReadersTab) =>
    state.navigate({ view: "readers", readersTab });
  async function arrow(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index + tabs.length - 1) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    if (await open(tabs[next].id))
      document.getElementById(`readers-tab-${tabs[next].id}`)?.focus();
  }
  return (
    <section className="page-content readers-page">
      <PageHeading
        label="A PLACE FOR YOUR READERS"
        title="Readers"
        description="Subscriptions, conversations, and a little space to think."
      />
      <div className="settings-tabs" role="tablist" aria-label="Readers">
        {tabs.map((item, index) => (
          <button
            type="button"
            role="tab"
            key={item.id}
            id={`readers-tab-${item.id}`}
            aria-controls={`readers-panel-${item.id}`}
            aria-selected={tab === item.id}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => void open(item.id)}
            onKeyDown={(event) => void arrow(event, index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        tabIndex={0}
        id={`readers-panel-${tab}`}
        aria-labelledby={`readers-tab-${tab}`}
      >
        {tab === "conversations" && (
          <div className="readers-conversations">
            <details className="reader-detail reader-feedback-detail" open={feedbackOpen} onToggle={(event) => setFeedbackOpen(event.currentTarget.open)}>
              <summary>Feedback</summary>
              <div className="reader-detail-body"><FlagsAdmin embedded notify={state.notify} /></div>
            </details>
            <CommentsAdmin
              embedded
              notify={state.notify}
              filter={state.route.filter || "pending"}
              setFilter={(filter) =>
                void state.navigate({
                  view: "readers",
                  readersTab: "conversations",
                  filter,
                })
              }
            />
          </div>
        )}
        {tab === "subscribers" && <Subscribers />}
        {tab === "guides" && <GuideAnalytics />}
        {tab === "campaigns" && <Campaigns />}
        {tab === "settings" && (
          <ReaderSettings
            onDirtyChange={state.setReadersDirty}
            onSavedComments={(comments) =>
              state.setTheme((current) => ({
                ...current,
                comments: { ...current.comments, ...comments },
              }))
            }
            openConversations={() => void open("conversations")}
            openDesign={() =>
              void state.navigate({ view: "designer", section: "comments" })
            }
          />
        )}
      </div>
    </section>
  );
}
