CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY CHECK (id=1), email TEXT NOT NULL, password_hash TEXT NOT NULL
  ); CREATE TABLE IF NOT EXISTS owner_email_verification (
    id INTEGER PRIMARY KEY REFERENCES admins(id) ON DELETE CASCADE CHECK (id=1),
    email TEXT NOT NULL, verified_at TIMESTAMPTZ,
    token_hash TEXT UNIQUE, expires_at TIMESTAMPTZ, last_requested_at TIMESTAMPTZ
  ); CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL
  ); CREATE TABLE IF NOT EXISTS session_principals (
    token_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE, subject TEXT NOT NULL, auth_version TEXT NOT NULL
  ); CREATE TABLE IF NOT EXISTS api_tokens (
    token_hash TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('reader','writer','publisher','owner')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  ); CREATE TABLE IF NOT EXISTS cli_logins (
    device_hash TEXT PRIMARY KEY, code_hash TEXT UNIQUE NOT NULL, token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
  ); CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, excerpt TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft','published','archived')), tags JSONB NOT NULL DEFAULT '[]',
    featured BOOLEAN NOT NULL DEFAULT FALSE,
    toc TEXT NOT NULL DEFAULT 'off',
    content_type TEXT NOT NULL DEFAULT 'article' CHECK (content_type IN ('article','guide')),
    cover TEXT NOT NULL DEFAULT '', content_key TEXT NOT NULL, revision TEXT NOT NULL,
    recommended_ids JSONB NOT NULL DEFAULT '[]',
    recommendations JSONB NOT NULL DEFAULT '{"mode":"automatic","postIds":[]}',
    seo JSONB NOT NULL DEFAULT '{"title":"","description":"","image":""}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    citation_documents JSONB NOT NULL DEFAULT '[]', cover_mode TEXT NOT NULL DEFAULT 'player'
  ); CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK (id=1), theme JSONB NOT NULL);
  CREATE TABLE IF NOT EXISTS post_media_references (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    revision TEXT NOT NULL, address TEXT NOT NULL,
    PRIMARY KEY(post_id,address)
  );
  CREATE INDEX IF NOT EXISTS post_media_references_address_idx ON post_media_references(address,post_id,revision);
  CREATE TABLE IF NOT EXISTS post_media_indexed (
    post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
    revision TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS post_search_documents (
    post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
    revision TEXT NOT NULL, title_text TEXT NOT NULL, excerpt_text TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS post_search_terms (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    term TEXT NOT NULL, weight DOUBLE PRECISION NOT NULL, body_position INTEGER,
    PRIMARY KEY(post_id,term)
  );
  CREATE INDEX IF NOT EXISTS post_search_terms_term_idx ON post_search_terms(term,post_id);
  CREATE INDEX IF NOT EXISTS post_search_terms_position_idx ON post_search_terms(post_id,body_position);
  CREATE TABLE IF NOT EXISTS storage_usage_scan_objects (
    scan_id TEXT NOT NULL, key TEXT NOT NULL, size_bytes BIGINT NOT NULL,
    PRIMARY KEY(scan_id,key)
  );
  CREATE TABLE IF NOT EXISTS newsletter_settings (id INTEGER PRIMARY KEY CHECK (id=1), configuration JSONB NOT NULL);
  CREATE TABLE IF NOT EXISTS site_settings (name TEXT PRIMARY KEY, configuration JSONB NOT NULL);
  CREATE TABLE IF NOT EXISTS turnstile_settings (id INTEGER PRIMARY KEY CHECK (id=1), encrypted_configuration TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS central_connection (
    id INTEGER PRIMARY KEY CHECK (id=1), service_url TEXT NOT NULL, encrypted_token TEXT NOT NULL,
    registration JSONB NOT NULL, account_id TEXT, consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    email TEXT PRIMARY KEY, status TEXT NOT NULL CHECK (status IN ('pending','subscribed','unsubscribed')),
    confirmation_hash TEXT UNIQUE, confirmation_expires_at TIMESTAMPTZ, unsubscribe_hash TEXT UNIQUE NOT NULL,
    last_requested_at TIMESTAMPTZ, confirmed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS blog_logos (id TEXT PRIMARY KEY, object_key TEXT NOT NULL, content_type TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS uploaded_covers (id TEXT PRIMARY KEY, object_key TEXT NOT NULL, content_type TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS uploaded_models (id TEXT PRIMARY KEY, object_key TEXT NOT NULL, content_type TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS uploaded_videos (
    id TEXT PRIMARY KEY, object_key TEXT NOT NULL, content_type TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '', size_bytes BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS uploaded_audio (
    id TEXT PRIMARY KEY, object_key TEXT NOT NULL, content_type TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '', size_bytes BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    name TEXT NOT NULL, email TEXT NOT NULL, body TEXT NOT NULL, approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  ); CREATE TABLE IF NOT EXISTS ai_summaries (
    id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    source_hash TEXT NOT NULL, tone TEXT NOT NULL, summaries JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  ); CREATE TABLE IF NOT EXISTS generated_assets (
    id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    object_key TEXT NOT NULL, prompt TEXT NOT NULL, style TEXT NOT NULL, size TEXT NOT NULL, source_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  ); CREATE INDEX IF NOT EXISTS ai_summaries_post_idx ON ai_summaries(post_id);
  CREATE INDEX IF NOT EXISTS generated_assets_post_idx ON generated_assets(post_id);
  CREATE INDEX IF NOT EXISTS comments_post_idx ON comments(post_id);
  CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS analytics_visits (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE, revision TEXT NOT NULL,
  content_kind TEXT NOT NULL DEFAULT 'article',
  country TEXT NOT NULL, day TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active_ms BIGINT NOT NULL DEFAULT 0, scroll_depth INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS analytics_visits_day_idx ON analytics_visits(day,post_id);
CREATE TABLE IF NOT EXISTS analytics_sections (
  visit_id TEXT NOT NULL REFERENCES analytics_visits(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL, label TEXT NOT NULL, active_ms BIGINT NOT NULL,
  PRIMARY KEY(visit_id,section_id)
);
CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY, visit_id TEXT NOT NULL REFERENCES analytics_visits(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('click','highlight','copy')), target TEXT NOT NULL,
  section_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS analytics_events_visit_idx ON analytics_events(visit_id);

CREATE TABLE IF NOT EXISTS source_documents (id TEXT PRIMARY KEY, object_key TEXT NOT NULL, title TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());

CREATE TABLE IF NOT EXISTS post_revisions (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  revision TEXT NOT NULL,
  version INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  author JSONB NOT NULL DEFAULT '{"kind":"unknown","name":"Not recorded"}',
  saved_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(post_id,revision),
  UNIQUE(post_id,version)
);

CREATE TABLE IF NOT EXISTS writing_notes (
  id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  note JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS writing_notes_post_idx ON writing_notes(post_id);

CREATE TABLE IF NOT EXISTS writing_chat_sessions (
  session_key TEXT PRIMARY KEY,
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  chats JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS writing_chat_sessions_expiry_idx ON writing_chat_sessions(expires_at);

CREATE TABLE IF NOT EXISTS analytics_country_database (
  id INTEGER PRIMARY KEY CHECK (id=1),
  version TEXT NOT NULL,
  file_sha256 TEXT NOT NULL,
  object_key TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS search_notifications (
 url TEXT PRIMARY KEY, origin TEXT NOT NULL, revision TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt BIGINT NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT '',
 attempted_at TEXT, submitted_at TEXT
);
CREATE INDEX IF NOT EXISTS search_notifications_pending_idx ON search_notifications(origin,status,next_attempt);

CREATE TABLE IF NOT EXISTS newsletter_smtp (id INTEGER PRIMARY KEY, encrypted_configuration TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS passage_questions (
 comment_id TEXT PRIMARY KEY REFERENCES comments(id) ON DELETE CASCADE,
 quote TEXT NOT NULL, revision TEXT NOT NULL,
 anchor_status TEXT NOT NULL DEFAULT 'active' CHECK(anchor_status IN ('active','detached','hidden')),
 applied_policy TEXT NOT NULL DEFAULT '', answer TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS passage_followups (
 id TEXT PRIMARY KEY, question_id TEXT NOT NULL REFERENCES passage_questions(comment_id) ON DELETE CASCADE,
 reader_id TEXT NOT NULL, body TEXT NOT NULL,
 approved BOOLEAN NOT NULL DEFAULT FALSE, answer TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS passage_followups_question_idx ON passage_followups(question_id,created_at);
CREATE TABLE IF NOT EXISTS section_anchors (
 id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('question','private_note','note','reaction','vote')),
 quote TEXT NOT NULL, revision TEXT NOT NULL,
 position INTEGER NOT NULL DEFAULT 0, occurrence INTEGER NOT NULL DEFAULT 0,
 anchor_status TEXT NOT NULL DEFAULT 'active' CHECK(anchor_status IN ('active','earlier')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS section_anchors_post_idx ON section_anchors(post_id,kind);
CREATE TABLE IF NOT EXISTS public_notes (
 comment_id TEXT PRIMARY KEY REFERENCES comments(id) ON DELETE CASCADE,
 pinned BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS reader_sessions (
 token_hash TEXT PRIMARY KEY, email TEXT NOT NULL REFERENCES newsletter_subscribers(email) ON DELETE CASCADE,
 expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS reader_email_links (
 token_hash TEXT PRIMARY KEY, email TEXT NOT NULL REFERENCES newsletter_subscribers(email) ON DELETE CASCADE,
 unsubscribe_hash TEXT UNIQUE NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
 used_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reader_links_email_idx ON reader_email_links(email,created_at);
CREATE TABLE IF NOT EXISTS reader_notes (
 id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 email TEXT NOT NULL,
 quote TEXT NOT NULL, body TEXT NOT NULL, revision TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reader_notes_owner_idx ON reader_notes(email,post_id);

CREATE INDEX IF NOT EXISTS posts_homepage_idx ON posts(status,created_at DESC,id);

CREATE INDEX IF NOT EXISTS posts_workspace_idx ON posts(updated_at DESC,id);

CREATE TABLE IF NOT EXISTS analytics_classifications (
 post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 revision TEXT NOT NULL, content_type TEXT NOT NULL, writing_style TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(post_id,revision)
);
CREATE TABLE IF NOT EXISTS analytics_classification_jobs (
 post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 revision TEXT NOT NULL, request_id TEXT NOT NULL, PRIMARY KEY(post_id,revision)
);

CREATE TABLE IF NOT EXISTS comment_submissions (
 comment_id TEXT PRIMARY KEY REFERENCES comments(id) ON DELETE CASCADE,
 payload_hash TEXT NOT NULL, email_required BOOLEAN NOT NULL, approval_required BOOLEAN NOT NULL,
 verified_at TIMESTAMPTZ, token_hash TEXT UNIQUE, expires_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS comment_email_throttle (
 email TEXT PRIMARY KEY, last_sent_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_lock (id INTEGER PRIMARY KEY CHECK(id=1), revision BIGINT NOT NULL DEFAULT 0);
INSERT INTO oauth_lock(id) VALUES(1) ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS oauth_clients (
 id TEXT PRIMARY KEY, public_id TEXT UNIQUE NOT NULL, secret_hash TEXT NOT NULL, data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_subjects (
 id INTEGER PRIMARY KEY, subject TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_consents (
 client_id TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
 subject_id INTEGER NOT NULL, legacy_admin_id INTEGER REFERENCES admins(id) ON DELETE CASCADE, data TEXT NOT NULL, PRIMARY KEY(client_id,subject_id)
);
CREATE TABLE IF NOT EXISTS oauth_codes (
 code_hash TEXT PRIMARY KEY, client_id TEXT NOT NULL, subject_id INTEGER NOT NULL,
 expires_at BIGINT NOT NULL, data TEXT NOT NULL,
 FOREIGN KEY(client_id,subject_id) REFERENCES oauth_consents(client_id,subject_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS oauth_tokens (
 access_hash TEXT PRIMARY KEY, refresh_hash TEXT UNIQUE NOT NULL,
 client_id TEXT NOT NULL, subject_id INTEGER NOT NULL, family_id TEXT NOT NULL,
 expires_at BIGINT NOT NULL, rotated INTEGER NOT NULL DEFAULT 0, revoked INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL,
 FOREIGN KEY(client_id,subject_id) REFERENCES oauth_consents(client_id,subject_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS oauth_tokens_family_idx ON oauth_tokens(family_id);
CREATE INDEX IF NOT EXISTS oauth_tokens_client_idx ON oauth_tokens(client_id);
CREATE INDEX IF NOT EXISTS oauth_tokens_expiry_idx ON oauth_tokens(expires_at);
CREATE INDEX IF NOT EXISTS oauth_codes_expiry_idx ON oauth_codes(expires_at);

CREATE TABLE IF NOT EXISTS comment_readers(id TEXT PRIMARY KEY,identity TEXT UNIQUE NOT NULL,provider TEXT NOT NULL,email TEXT NOT NULL,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS passage_reactions (
 anchor_id TEXT PRIMARY KEY REFERENCES section_anchors(id) ON DELETE CASCADE,
 reader_id TEXT NOT NULL REFERENCES comment_readers(id) ON DELETE CASCADE,
 emoji TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS poll_votes (
 anchor_id TEXT PRIMARY KEY REFERENCES section_anchors(id) ON DELETE CASCADE,
 reader_id TEXT NOT NULL REFERENCES comment_readers(id) ON DELETE CASCADE,
 post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 poll_id TEXT NOT NULL, option_id TEXT NOT NULL,
 UNIQUE(reader_id,post_id,poll_id)
);
CREATE TABLE IF NOT EXISTS poll_vote_reasons (
 anchor_id TEXT PRIMARY KEY REFERENCES poll_votes(anchor_id) ON DELETE CASCADE,
 reason TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS comment_reader_sessions(token_hash TEXT PRIMARY KEY,reader_id TEXT NOT NULL REFERENCES comment_readers(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS comment_login_links(token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,browser_hash TEXT NOT NULL,return_path TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS comment_login_throttle(email TEXT PRIMARY KEY,last_sent_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS comment_auth_flows(state_hash TEXT PRIMARY KEY,verifier TEXT NOT NULL,return_path TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS comment_authors(comment_id TEXT PRIMARY KEY REFERENCES comments(id) ON DELETE CASCADE,reader_id TEXT NOT NULL REFERENCES comment_readers(id));

CREATE TABLE IF NOT EXISTS post_drafts (
 post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
 slug TEXT UNIQUE NOT NULL, revision TEXT NOT NULL, base_revision TEXT NOT NULL,
 snapshot JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS post_write_lock (id INTEGER PRIMARY KEY CHECK(id=1));
INSERT INTO post_write_lock(id) VALUES(1) ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS analytics_media (
  visit_id TEXT NOT NULL REFERENCES analytics_visits(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL, media_title TEXT NOT NULL, media_type TEXT NOT NULL, provider TEXT NOT NULL,
  started INTEGER NOT NULL DEFAULT 0, played_ms BIGINT NOT NULL DEFAULT 0,
  progress INTEGER NOT NULL DEFAULT 0, completed INTEGER NOT NULL DEFAULT 0,
  measurable INTEGER NOT NULL DEFAULT 0, timeline_available INTEGER NOT NULL DEFAULT 0,
  duration_ms BIGINT,
  PRIMARY KEY(visit_id,media_id)
);

CREATE TABLE IF NOT EXISTS analytics_media_events (
 id TEXT PRIMARY KEY, visit_id TEXT NOT NULL, media_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('play','pause','resume','seek','ended','exit')),
 occurred_at TEXT NOT NULL, position_ms BIGINT NOT NULL, played_ms BIGINT,
 received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 FOREIGN KEY(visit_id,media_id) REFERENCES analytics_media(visit_id,media_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS analytics_media_events_visit_idx ON analytics_media_events(visit_id,media_id);

CREATE TABLE IF NOT EXISTS analytics_media_replay (
 visit_id TEXT NOT NULL, media_id TEXT NOT NULL,
 bin INTEGER NOT NULL CHECK(bin>=0 AND bin<20), replay_ms BIGINT NOT NULL CHECK(replay_ms>=0),
 PRIMARY KEY(visit_id,media_id,bin),
 FOREIGN KEY(visit_id,media_id) REFERENCES analytics_media(visit_id,media_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS newsletter_campaigns (
 id TEXT PRIMARY KEY, revision TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
 configuration JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), queued_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS newsletter_deliveries (
 campaign_id TEXT NOT NULL REFERENCES newsletter_campaigns(id) ON DELETE CASCADE,
 email TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 unsubscribe_hash TEXT UNIQUE NOT NULL,
 started_at BIGINT NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT '',
 PRIMARY KEY(campaign_id,email)
);
CREATE INDEX IF NOT EXISTS newsletter_deliveries_status_idx ON newsletter_deliveries(status,started_at);

CREATE TABLE IF NOT EXISTS owner_password_resets(id INTEGER PRIMARY KEY REFERENCES admins(id) ON DELETE CASCADE,email TEXT NOT NULL,password_hash TEXT NOT NULL,token_hash TEXT UNIQUE NOT NULL,expires_at TIMESTAMPTZ NOT NULL,sent_at TIMESTAMPTZ NOT NULL);

CREATE TABLE IF NOT EXISTS post_previews (
 token_hash TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 revision TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS post_previews_expiry_idx ON post_previews(expires_at);

CREATE TABLE IF NOT EXISTS publishing_connections (
    provider TEXT PRIMARY KEY, connection_id TEXT NOT NULL, encrypted_token TEXT NOT NULL,
    subject TEXT NOT NULL, display_name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS publishing_auth_flows (
    state_hash TEXT PRIMARY KEY, provider TEXT NOT NULL, session_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS linkedin_shares (
    fingerprint TEXT PRIMARY KEY, receipt TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS google_article_measurements (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    property TEXT NOT NULL, url TEXT NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL, snapshot JSONB NOT NULL,
    PRIMARY KEY(post_id, property, url, day, kind)
);

CREATE TABLE IF NOT EXISTS peer_reviews (
 id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 email TEXT NOT NULL, reviewer_name TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Requested',
 seen_revision TEXT NOT NULL DEFAULT '', approved_revision TEXT NOT NULL DEFAULT '',
 approved_digest TEXT NOT NULL DEFAULT '', badge_name TEXT NOT NULL DEFAULT '',
 published_revision TEXT NOT NULL DEFAULT '', closed BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS peer_reviews_active ON peer_reviews(post_id,email) WHERE closed=FALSE;
CREATE TABLE IF NOT EXISTS peer_review_notes (
 id TEXT PRIMARY KEY, review_id TEXT NOT NULL REFERENCES peer_reviews(id) ON DELETE CASCADE,
 revision TEXT NOT NULL, quote TEXT NOT NULL, occurrence INTEGER NOT NULL, body TEXT NOT NULL,
 addressed_revision TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS peer_notes_review ON peer_review_notes(review_id);
CREATE TABLE IF NOT EXISTS research_sources (
 id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 url TEXT NOT NULL, title TEXT NOT NULL, excerpt TEXT NOT NULL, UNIQUE(post_id,url)
);

CREATE TABLE IF NOT EXISTS simplified_versions (
 post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 source_revision TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','generating','ready','failed','hidden')),
 reviewed BOOLEAN NOT NULL DEFAULT FALSE, writer_revision TEXT NOT NULL DEFAULT '',
 error TEXT NOT NULL DEFAULT '', generation_id TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(post_id,source_revision)
);
CREATE TABLE IF NOT EXISTS simplified_edits (
 post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 source_revision TEXT NOT NULL, writer_revision TEXT NOT NULL,
 content TEXT NOT NULL, reviewed BOOLEAN NOT NULL DEFAULT FALSE,
 status TEXT NOT NULL CHECK(status IN ('ready','hidden')),
 saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(post_id,source_revision,writer_revision)
);
CREATE INDEX IF NOT EXISTS simplified_edits_post_idx ON simplified_edits(post_id,saved_at DESC);
CREATE TABLE IF NOT EXISTS poll_closures (
 post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 poll_id TEXT NOT NULL, closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(post_id,poll_id)
);
CREATE TABLE IF NOT EXISTS section_flags (
 id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 reader_id TEXT NOT NULL REFERENCES comment_readers(id) ON DELETE CASCADE,
 source_revision TEXT NOT NULL, quote TEXT NOT NULL, occurrence INTEGER NOT NULL,
 position INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('unclear','outdated')),
 body TEXT NOT NULL DEFAULT '', proposed_text TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','applied','dismissed')),
 accepted_draft_revision TEXT NOT NULL DEFAULT '', applied_revision TEXT NOT NULL DEFAULT '',
 display_name TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS section_flags_inbox_idx ON section_flags(status,created_at DESC,id);
CREATE INDEX IF NOT EXISTS section_flags_post_idx ON section_flags(post_id,status);
CREATE TABLE IF NOT EXISTS author_updates (
 post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
 id TEXT UNIQUE NOT NULL, body TEXT NOT NULL, revision TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS author_update_history (
 id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 body TEXT NOT NULL, revision TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS author_update_deliveries (
 update_id TEXT NOT NULL, email TEXT NOT NULL,
 unsubscribe_hash TEXT UNIQUE NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','accepted','uncertain','skipped')),
 message TEXT NOT NULL DEFAULT '', started_at BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(update_id,email)
);
CREATE INDEX IF NOT EXISTS author_update_deliveries_queue_idx ON author_update_deliveries(status,started_at);
CREATE TABLE IF NOT EXISTS section_highlights (
 comment_id TEXT PRIMARY KEY REFERENCES public_notes(comment_id) ON DELETE CASCADE,
 post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 section_position INTEGER NOT NULL, label TEXT NOT NULL DEFAULT 'Writer’s pick',
 UNIQUE(post_id,section_position)
);
CREATE TABLE IF NOT EXISTS public_note_replies (
 id TEXT PRIMARY KEY, note_id TEXT NOT NULL REFERENCES public_notes(comment_id) ON DELETE CASCADE,
 reader_id TEXT NOT NULL REFERENCES comment_readers(id) ON DELETE CASCADE,
 body TEXT NOT NULL, approved BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS public_note_replies_note_idx ON public_note_replies(note_id,created_at,id);
CREATE TABLE IF NOT EXISTS reader_alerts (
 id TEXT PRIMARY KEY, reader_id TEXT NOT NULL REFERENCES comment_readers(id) ON DELETE CASCADE,
 event_key TEXT UNIQUE NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('author_answered','someone_replied','section_updated')),
 post_id TEXT REFERENCES posts(id) ON DELETE CASCADE, target_id TEXT NOT NULL,
 body TEXT NOT NULL DEFAULT '', read_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reader_alerts_inbox_idx ON reader_alerts(reader_id,created_at DESC,id);
CREATE TABLE IF NOT EXISTS reader_alert_settings (
 reader_id TEXT PRIMARY KEY REFERENCES comment_readers(id) ON DELETE CASCADE,
 email_enabled BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS reader_alert_deliveries (
 alert_id TEXT PRIMARY KEY REFERENCES reader_alerts(id) ON DELETE CASCADE,
 reader_id TEXT NOT NULL REFERENCES comment_readers(id) ON DELETE CASCADE,
 email TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','accepted','uncertain','skipped')),
 message TEXT NOT NULL DEFAULT '', started_at BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS reader_alert_deliveries_queue_idx ON reader_alert_deliveries(status,started_at);

CREATE TABLE IF NOT EXISTS reader_guide_progress (
 reader_id TEXT NOT NULL REFERENCES comment_readers(id) ON DELETE CASCADE,
 post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 section TEXT NOT NULL,
 PRIMARY KEY(reader_id,post_id)
);

CREATE TABLE IF NOT EXISTS reader_guide_steps (
 reader_id TEXT NOT NULL REFERENCES comment_readers(id) ON DELETE CASCADE,
 post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 section TEXT NOT NULL,
 PRIMARY KEY(reader_id,post_id,section)
);
CREATE TABLE IF NOT EXISTS guide_step_flags (
 flag_id TEXT PRIMARY KEY REFERENCES section_flags(id) ON DELETE CASCADE,
 section TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS engine_users (
 id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
 password_hash TEXT NOT NULL, auth_version TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS engine_memberships (
 user_id TEXT PRIMARY KEY REFERENCES engine_users(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('owner','writer','publisher','peer_reviewer')), version TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS engine_article_grants (
 user_id TEXT NOT NULL REFERENCES engine_users(id) ON DELETE CASCADE,
 post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE, version TEXT NOT NULL,
 PRIMARY KEY(user_id,post_id)
);
CREATE TABLE IF NOT EXISTS engine_invitations (
 id TEXT PRIMARY KEY, email TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','writer','publisher','peer_reviewer')),
 article_id TEXT REFERENCES posts(id) ON DELETE CASCADE, token_hash TEXT UNIQUE NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS engine_invitations_pending ON engine_invitations(status,expires_at,created_at,id);
CREATE UNIQUE INDEX IF NOT EXISTS engine_invitations_email_role_article ON engine_invitations(email,role,COALESCE(article_id,'')) WHERE status='pending';

CREATE TABLE IF NOT EXISTS engine_password_resets (
 user_id TEXT PRIMARY KEY REFERENCES engine_users(id) ON DELETE CASCADE,
 email TEXT NOT NULL, password_hash TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL, sent_at TIMESTAMPTZ NOT NULL
);
