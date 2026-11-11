import Select from "../components/Select";
import { useEffect, useState, type ReactNode } from "react";
import {
  Mail,
  UserRound,
  MessageSquare,
  Palette,
  ShieldCheck,
  Send,
} from "lucide-react";
import type { ConversationMode } from "../../shared/interactions";
import { NewsletterSettings } from "../newsletter/NewsletterSettings";
import { useReaderPreferences } from "./useReaderPreferences";
import SimplifiedSettings from "./SimplifiedSettings";
type Props = {
  onDirtyChange: (value: boolean) => void;
  onSavedComments: (value: { visible: boolean; enabled: boolean }) => void;
  openConversations: () => void;
  openDesign: () => void;
};
export default function ReaderSettings({
  onDirtyChange,
  onSavedComments,
  openConversations,
  openDesign,
}: Props) {
  const state = useReaderPreferences();
  const [emailDirty, setEmailDirty] = useState(false);
  const [simplifiedDirty, setSimplifiedDirty] = useState(false);
  useEffect(() => {
    onDirtyChange(state.dirty || emailDirty || simplifiedDirty);
    return () => onDirtyChange(false);
  }, [state.dirty, emailDirty, simplifiedDirty, onDirtyChange]);
  const { value, update } = state;
  return (
    <div className="reader-settings">
      <form
        className="settings-card"
        onSubmit={async (event) => {
          event.preventDefault();
          const saved = await state.save();
          if (saved)
            onSavedComments({
              visible: saved.comments !== "hidden",
              enabled: saved.comments === "open",
            });
        }}
      >
        <div className="settings-icon">
          <UserRound aria-hidden="true" />
        </div>
        <h2>The reading experience</h2>
        <p className="muted">
          Choose how people can take part in your publication.
        </p>
        {state.error && (
          <div className="error-box" role="alert">
            {state.error}
            {!value && (
              <button type="button" className="button" onClick={state.retry}>
                Retry
              </button>
            )}
          </div>
        )}
        {!value ? (
          <p role="status">Loading reader settings…</p>
        ) : (
          <fieldset disabled={state.busy}>
            <Feature
              icon={<Mail />}
              title="Newsletter subscriptions"
              description="Let new readers join your mailing list."
            >
              <Switch
                label="Accept newsletter subscriptions"
                checked={value.newsletter}
                onChange={(newsletter) => update({ newsletter })}
              />
            </Feature>
            <Feature
              icon={<MessageSquare />}
              title="Comments & questions"
              description="Let readers comment on posts and ask about passages."
            >
              <Mode
                label="Comments and questions"
                value={value.comments}
                onChange={(comments) => update({ comments })}
              />
            </Feature>
            <Feature
              icon={<ShieldCheck />}
              title="Require approval"
              description="Review new comments and questions before they appear."
            >
              <Switch
                label="Require approval"
                checked={value.requireApproval}
                onChange={(requireApproval) => update({ requireApproval })}
              />
            </Feature>
            <Feature
              icon={<UserRound />}
              title="Reader sign-in"
              description="Google or an email link. No newsletter subscription required."
            >
              <span className="reader-setting-value">Required</span>
            </Feature>
            <Feature
              icon={<MessageSquare />}
              title="Private notes"
              description="Let signed-in readers keep private notes on passages to review later."
            >
              <Switch
                label="Enable private notes"
                checked={value.notes}
                onChange={(notes) => update({ notes })}
              />
            </Feature>
            <details className="reader-detail">
              <summary>
                <ShieldCheck size={16} />
                More conversation options
              </summary>
              <div className="reader-detail-body">
                <label htmlFor="readers-edit-policy">
                  When an edit changes or removes a quoted passage
                </label>
                <Select
                  id="readers-edit-policy"
                  value={value.editPolicy}
                  onChange={(event) =>
                    update({
                      editPolicy: event.target.value as "keep" | "hide",
                    })
                  }
                >
                  <option value="keep">
                    Keep the question with its original quote
                  </option>
                  <option value="hide">Hide the question from readers</option>
                </Select>
                <p className="small-text">
                  Applies to future edits. Private notes keep their original
                  quote.
                </p>
                <p className="small-text">
                  With approval off, signed-in readers’ contributions appear
                  immediately. Existing pending submissions keep their original
                  rules.
                </p>
                <button
                  type="button"
                  className="text-link"
                  onClick={openConversations}
                >
                  View conversations
                </button>
              </div>
            </details>
            <div className="reader-savebar">
              <span role="status">
                {state.message ||
                  (state.dirty ? "Unsaved changes" : "All changes saved")}
              </span>
              <button className="button primary" disabled={!state.dirty}>
                {state.busy ? "Saving…" : "Save reader settings"}
              </button>
            </div>
          </fieldset>
        )}
      </form>
      <SimplifiedSettings onDirtyChange={setSimplifiedDirty} />
      <details className="settings-card reader-detail">
        <summary>
          <Send size={16} />
          Email delivery & reader access
        </summary>
        <div className="reader-detail-body">
          <p className="small-text">
            One email connection handles owner email verification, newsletter
            confirmations, and reader sign-in links.
          </p>
          <NewsletterSettings emailOnly onDirtyChange={setEmailDirty} />
        </div>
      </details>
      <p className="reader-appearance">
        <Palette size={16} />
        <span>
          Fonts, colours, and comment layout stay in{" "}
          <button type="button" className="text-link" onClick={openDesign}>
            Blog designer
          </button>
          .
        </span>
      </p>
    </div>
  );
}
function Feature({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="reader-feature">
      <span className="reader-feature-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="reader-switch">
      <input
        aria-label={label}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
function Mode({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ConversationMode;
  onChange: (value: ConversationMode) => void;
}) {
  return (
    <Select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as ConversationMode)}
    >
      <option value="open">Open</option>
      <option value="closed">Closed</option>
      <option value="hidden">Hidden</option>
    </Select>
  );
}
