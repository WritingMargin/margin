import { useEffect, useState } from "react";
import { api, json } from "../api";
import "./campaigns.css";

type Campaign = {
  id: string;
  revision: string;
  subject: string;
  accent: string;
  status: string;
  audience: number;
  html?: string;
  counts: { status: string; total: number }[];
};
type CampaignIndex = {
  campaigns: Campaign[];
  posts: { id: string; title: string }[];
};
export default function Campaigns() {
  const [index, setIndex] = useState<CampaignIndex | null>(null);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [subject, setSubject] = useState("");
  const [intro, setIntro] = useState("");
  const [postIds, setPostIds] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [review, setReview] = useState(false);
  async function load() {
    setIndex(await api<CampaignIndex>("/newsletter/campaigns"));
  }
  useEffect(() => {
    void load().catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    if (selected?.status !== "queued") return;
    const id = selected.id;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      api<Campaign>(`/newsletter/campaigns/${id}`, {
        signal: controller.signal,
      })
        .then(setSelected)
        .catch((e: Error) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    }, 2500);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [selected?.id, selected?.status]);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    await action(async () => {
      const campaign = await api<Campaign>(
        "/newsletter/campaigns",
        json("POST", { subject, intro, postIds }),
      );
      setSelected(campaign);
      setReview(false);
      await load();
    });
  }
  async function open(id: string) {
    await action(async () => {
      setSelected(await api<Campaign>(`/newsletter/campaigns/${id}`));
      setReview(false);
    });
  }
  async function test() {
    if (!selected) return;
    await action(async () => {
      await api(
        `/newsletter/campaigns/${selected.id}/test`,
        json("POST", { email, revision: selected.revision }),
      );
      setNotice(
        `Test email accepted for ${email}. Check the inbox to confirm delivery.`,
      );
    });
  }
  async function send() {
    if (!selected) return;
    await action(async () => {
      setSelected(
        await api<Campaign>(
          `/newsletter/campaigns/${selected.id}/send`,
          json("POST", {
            revision: selected.revision,
            audience: selected.audience,
          }),
        ),
      );
      setReview(false);
      setNotice(
        "Campaign queued. You can leave this page while sending continues.",
      );
      await load();
    });
  }
  function toggle(id: string) {
    setPostIds((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
    );
  }
  return (
    <section className="newsletter-campaigns">
      <div className="settings-card campaign-compose">
        <header>
          <p className="campaign-eyebrow">FROM YOUR JOURNAL TO THEIR INBOX</p>
          <h2>Send a newsletter</h2>
          <p>
            Share article previews with a link back to your blog. Your blog
            template sets the email’s accent color.
          </p>
        </header>
        <CampaignNotice error={error} notice={notice} />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <label>
            Subject
            <input
              required
              maxLength={200}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="A new perspective from the journal"
            />
          </label>
          <label>
            Introduction <span>(optional)</span>
            <textarea
              maxLength={2000}
              rows={3}
              value={intro}
              onChange={(event) => setIntro(event.target.value)}
              placeholder="A short note to introduce this issue…"
            />
          </label>
          <CampaignArticles
            posts={index?.posts}
            postIds={postIds}
            toggle={toggle}
          />
          <button
            className="button primary"
            disabled={busy || postIds.length === 0}
          >
            Create preview
          </button>
        </form>
      </div>
      {selected && (
        <section
          className="settings-card campaign-review"
          aria-label="Campaign preview"
        >
          <header>
            <div>
              <p className="campaign-eyebrow">REVIEW BEFORE SENDING</p>
              <h2>{selected.subject}</h2>
            </div>
            <span className="status-pill">
              {selected.status === "complete"
                ? "Sending finished"
                : selected.status}
            </span>
          </header>
          <p className="campaign-color">
            <span style={{ background: selected.accent }} />
            Email accent: {selected.accent} · Inherited from your blog
          </p>
          <iframe
            title="Newsletter email preview"
            sandbox=""
            srcDoc={selected.html}
          />
          <form
            className="campaign-test"
            onSubmit={(event) => {
              event.preventDefault();
              void test();
            }}
          >
            <label>
              Send a test to
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <button className="button" disabled={busy}>
              Send test email
            </button>
          </form>
          <CampaignSend
            campaign={selected}
            busy={busy}
            review={review}
            setReview={setReview}
            send={() => void send()}
          />
        </section>
      )}
      {!!index?.campaigns.length && (
        <section className="settings-card campaign-history">
          <h2>Recent campaigns</h2>
          {index.campaigns.map((campaign) => (
            <button
              className="campaign-history-row"
              key={campaign.id}
              disabled={busy}
              onClick={() => void open(campaign.id)}
            >
              <span>{campaign.subject}</span>
              <span>{campaign.status}</span>
            </button>
          ))}
        </section>
      )}
    </section>
  );
}

function CampaignArticles({
  posts,
  postIds,
  toggle,
}: {
  posts?: CampaignIndex["posts"];
  postIds: string[];
  toggle: (id: string) => void;
}) {
  return (
    <fieldset>
      <legend>Choose up to five published articles</legend>
      <p>
        The order you select sets the reading order. The first article leads the
        email.
      </p>
      {!posts ? (
        <p role="status">Loading articles…</p>
      ) : !posts.length ? (
        <p>Publish an article to create your first newsletter.</p>
      ) : (
        posts.map((post) => (
          <label className="campaign-story-choice" key={post.id}>
            <input
              type="checkbox"
              checked={postIds.includes(post.id)}
              disabled={!postIds.includes(post.id) && postIds.length >= 5}
              onChange={() => toggle(post.id)}
            />
            <span>{post.title}</span>
            {postIds.includes(post.id) && (
              <small>{postIds.indexOf(post.id) + 1}</small>
            )}
          </label>
        ))
      )}
    </fieldset>
  );
}
function CampaignSend({
  campaign,
  busy,
  review,
  setReview,
  send,
}: {
  campaign: Campaign;
  busy: boolean;
  review: boolean;
  setReview: (value: boolean) => void;
  send: () => void;
}) {
  return (
    <>
      {" "}
      {campaign.status === "draft" ? (
        <div className="campaign-send">
          <p>
            Audience:{" "}
            <strong>
              {campaign.audience} confirmed{" "}
              {campaign.audience === 1 ? "subscriber" : "subscribers"}
            </strong>
            . Pending and unsubscribed readers are excluded.
          </p>
          {review ? (
            <div role="group" aria-label="Confirm campaign send">
              <p>
                Send “{campaign.subject}” to {campaign.audience} confirmed{" "}
                {campaign.audience === 1 ? "subscriber" : "subscribers"}?
              </p>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => send()}
              >
                Send to {campaign.audience}{" "}
                {campaign.audience === 1 ? "subscriber" : "subscribers"}
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={() => setReview(false)}
              >
                Keep reviewing
              </button>
            </div>
          ) : (
            <button
              className="button primary"
              disabled={busy || !campaign.audience}
              onClick={() => setReview(true)}
            >
              Review audience & send
            </button>
          )}
        </div>
      ) : (
        <div className="campaign-progress" role="status">
          <p>Campaign progress</p>
          {campaign.counts.map((count) => (
            <span key={count.status}>
              {count.total} {count.status}
            </span>
          ))}
          <p>Accepted means the provider accepted the email for delivery.</p>
          {campaign.counts.some((count) => count.status === "uncertain") && (
            <p role="alert">
              Some sends need attention. Verify acceptance with your email
              provider before attempting another campaign.
            </p>
          )}
        </div>
      )}
    </>
  );
}

function CampaignNotice({ error, notice }: { error: string; notice: string }) {
  return (
    <>
      {" "}
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <p className="campaign-notice" role="status">
          {notice}
        </p>
      )}
    </>
  );
}
