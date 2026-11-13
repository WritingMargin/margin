import { useEffect, useState, type FormEvent } from "react";
import { Mail, UserPlus, Users } from "lucide-react";
import { api, json } from "../api";
import { teamRoles, teamRoleLabels, type TeamRole, type TeamUser } from "../../shared/team";
import type { Post } from "../../shared/types";
import Select from "../components/Select";
import Empty from "../components/Empty";
import ConfirmDialog from "../admin/ConfirmDialog";
import { useConfirmation } from "../admin/useConfirmation";
import { useTeamPage, type TeamPageController } from "./useTeamPage";
import { TeamPageToolbar, TeamPageNavigation } from "./TeamPagination";
import TeamConnection from "./TeamConnection";
import "./team.css";

type Member = TeamUser & { role: TeamRole; articleIds: string[]; primaryOwner?: boolean };
type Invitation = { id: string; email: string; role: TeamRole; articleId?: string; expiresAt: string };
type Mutation = (path: string, method: string, input: object, message: string) => Promise<boolean>;

export default function TeamSettings({ cloudManaged }: { cloudManaged: boolean }) {
  return cloudManaged ? <ConnectedTeamSettings /> : <TeamConnection><ConnectedTeamSettings /></TeamConnection>;
}

function ConnectedTeamSettings() {
  const confirmation = useConfirmation();
  const [version, setVersion] = useState(0);
  const members = useTeamPage<Member>("members", true, version);
  const invitations = useTeamPage<Invitation>("invitations", true, version);
  const [posts, setPosts] = useState<Post[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api<Post[]>("/posts", { signal: controller.signal })
      .then(articles => setPosts(articles.filter(post => post.status !== "archived")))
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, []);
  async function mutate(path: string, method: string, input: object, message: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      await api(path, json(method, input));
      setNotice(message);
      return true;
    } catch (cause) {
      setError((cause as Error).message);
      return false;
    }
    finally { setVersion(value => value + 1); setBusy(false); }
  }
  async function removeMember(member: Member) {
    if (!(await confirmation.ask({
      title: "Remove this teammate?",
      description: `${member.email} will lose access to this publication. Their Margin account and access to other publications will stay available.`,
      confirmLabel: "Remove teammate", cancelLabel: "Keep teammate",
    }))) return;
    await mutate(`/team/members/${encodeURIComponent(member.id)}`, "DELETE", {}, "Member removed.");
  }
  async function removeArticle(member: Member, articleId: string) {
    if (!(await confirmation.ask({
      title: "Remove article review access?",
      description: `${member.email} will no longer be able to review this article. Their other article invitations and publication role will stay unchanged.`,
      confirmLabel: "Remove review access", cancelLabel: "Keep access",
    }))) return;
    await mutate(`/team/members/${encodeURIComponent(member.id)}/articles/${encodeURIComponent(articleId)}`, "DELETE", {}, "Article review access removed.");
  }
  function changeRole(member: Member, role: TeamRole) {
    if (role === "peer_reviewer" && !member.articleIds?.length) {
      setError("Invite this person to a specific article before changing them to Peer reviewer.");
      return;
    }
    void mutate(`/team/members/${encodeURIComponent(member.id)}`, "PATCH", { role }, "Role updated.");
  }
  return <div className="team-settings">
    <InvitationForm posts={posts} busy={busy} loaded={members.loaded} mutate={mutate} />
    <TeamStatus error={error} notice={notice} />
      <section className="settings-card" aria-labelledby="team-members-heading">
        <div className="settings-icon"><Users /></div>
        <h2 id="team-members-heading">Members</h2>
        <p>Manage each person’s role and article review access in this publication.</p>
        <TeamPageToolbar feed={members} label="Members" id="team-members-toolbar" busy={busy} />
        <ul className="team-list" aria-busy={members.loading}>{members.items.map(member => <MemberRow key={member.id} member={member} posts={posts} busy={busy} changeRole={role => changeRole(member, role)} remove={() => void removeMember(member)} removeArticle={id => void removeArticle(member, id)} />)}</ul>
        <TeamPageNavigation feed={members} label="Members" id="team-members-toolbar" busy={busy} />
      </section>
      <PendingInvitations feed={invitations} posts={posts} busy={busy} mutate={mutate} />
    <ConfirmDialog confirmation={confirmation} icon={<Users size={21} />} />
  </div>;
}

function InvitationForm({ posts, busy, loaded, mutate }: { posts: Post[]; busy: boolean; loaded: boolean; mutate: Mutation }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("writer");
  const [articleId, setArticleId] = useState("");
  async function invite(event: FormEvent) {
    event.preventDefault();
    if (await mutate("/team/invitations", "POST", { email, role, ...(role === "peer_reviewer" ? { articleId } : {}) }, "Invitation sent. They can accept with their existing Margin account.")) setEmail("");
  }
  return <form className="settings-card" onSubmit={event => void invite(event)}>
    <div className="settings-icon"><UserPlus /></div>
    <h2>Invite a teammate</h2>
    <p>Each person uses one Margin account across publications. Their role here only applies to this publication.</p>
    <fieldset className="team-invite" disabled={busy}>
      <label>Email address<input type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label>Role<RoleSelect label="Invitation role" value={role} onChange={setRole} disabled={busy} describedBy="team-invite-role-help" /></label>
      {role === "peer_reviewer" && <label>Article to review<Select required value={articleId} onChange={event => setArticleId(event.target.value)}><option value="">Choose an article</option>{posts.map(post => <option key={post.id} value={post.id}>{post.title}</option>)}</Select></label>}
      <p className="small-text" id="team-invite-role-help">{roleHelp[role]}</p>
      {role === "peer_reviewer" && <p className="small-text">Choose an article with a saved draft. For a published article, save a draft revision in the editor first.</p>}
      <div className="settings-actions"><button className="button primary" disabled={busy || !loaded}><Mail size={15} />{busy ? "Working…" : "Send invitation"}</button></div>
    </fieldset>
  </form>;
}

function MemberRow({ member, posts, busy, changeRole, remove, removeArticle }: {
  member: Member; posts: Post[]; busy: boolean; changeRole: (role: TeamRole) => void; remove: () => void; removeArticle: (id: string) => void;
}) {
  return <li>
    <div className="team-person"><strong>{member.name || member.email}</strong><small className="muted">{member.email}</small><ArticleGrants member={member} posts={posts} busy={busy} revoke={removeArticle} /></div>
    {member.primaryOwner ? <span className="status-pill">Publication owner</span> : <div className="team-member-actions">
      <RoleSelect label={`Role for ${member.email}`} value={member.role} disabled={busy} onChange={changeRole} />
      <button className="button" disabled={busy} onClick={remove} aria-label={`Remove ${member.email} from the publication`}>Remove teammate</button>
    </div>}
  </li>;
}

function PendingInvitations({ feed, posts, busy, mutate }: { feed: TeamPageController<Invitation>; posts: Post[]; busy: boolean; mutate: Mutation }) {
  const invitations = feed.items;
  return <section className="settings-card" aria-labelledby="team-invitations-heading">
    <div className="settings-icon"><Mail /></div><h2 id="team-invitations-heading">Pending invitations</h2>
    <TeamPageToolbar feed={feed} label="Invitations" id="team-invitations-toolbar" busy={busy} />
    {invitations.length ? <ul className="team-list">{invitations.map(invitation => <li key={invitation.id}>
      <div className="team-person"><strong>{invitation.email}</strong><small>{teamRoleLabels[invitation.role]}{invitation.articleId ? ` · ${posts.find(post => post.id === invitation.articleId)?.title || "Assigned article"}` : ""}</small><small className="muted">Expires {new Date(invitation.expiresAt).toLocaleString()}</small></div>
      <div className="team-member-actions">
        <button className="button" disabled={busy} aria-label={`Resend invitation to ${invitation.email}`} onClick={() => void mutate(`/team/invitations/${encodeURIComponent(invitation.id)}/resend`, "POST", {}, "Invitation resent. Previous link revoked.")}>Resend</button>
        <button className="button" disabled={busy} aria-label={`Revoke invitation to ${invitation.email}`} onClick={() => void mutate(`/team/invitations/${encodeURIComponent(invitation.id)}`, "DELETE", {}, "Invitation revoked.")}>Revoke</button>
      </div>
    </li>)}</ul> : <InvitationEmpty feed={feed} />}
    <TeamPageNavigation feed={feed} label="Invitations" id="team-invitations-toolbar" busy={busy} />
  </section>;
}

function RoleSelect({ label, value, onChange, disabled, describedBy }: { label: string; value: TeamRole; onChange: (role: TeamRole) => void; disabled: boolean; describedBy?: string }) {
  return <Select aria-label={label} aria-describedby={describedBy} value={value} disabled={disabled} onChange={event => onChange(event.target.value as TeamRole)}>{teamRoles.map(role => <option key={role} value={role}>{teamRoleLabels[role]}</option>)}</Select>;
}
const roleHelp: Record<TeamRole, string> = {
  owner: "Owners manage the team, publication settings, integrations and content.",
  writer: "Writers create drafts and suggest changes. A publisher or owner publishes them.",
  publisher: "Publishers edit, publish, archive and delete content.",
  peer_reviewer: "Peer reviewers can read and review only the articles they are invited to. They cannot edit publication content.",
};

function TeamStatus({ error, notice }: { error: string; notice: string }) {
  return <>{error && <p className="error-box" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}</>;
}
function InvitationEmpty({ feed }: { feed: TeamPageController<Invitation> }) {
  if (feed.loading || feed.error) return null;
  return <Empty icon={<Mail />} title="No pending invitations" text="Invite a teammate above. Their invitation will appear here until they accept." />;
}

function ArticleGrants({ member, posts, busy, revoke }: { member: Member; posts: Post[]; busy: boolean; revoke: (id: string) => void }) {
  const showArticleAction = member.role !== "peer_reviewer" || member.articleIds.length > 1;
  return <div className="team-article-grants">{member.articleIds?.map(id => <div className="team-article-grant" key={id}><small>{posts.find(post => post.id === id)?.title || "Assigned article"}</small>{showArticleAction && <button className="button" disabled={busy} onClick={() => revoke(id)} aria-label={`Remove ${member.email}’s review access to ${posts.find(post => post.id === id)?.title || "this article"}`}>Remove review access</button>}</div>)}</div>;
}
