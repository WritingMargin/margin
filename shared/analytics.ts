import type { ContentType } from "./content-types";
export interface AnalyticsSection {
  id: string;
  label: string;
  activeMs: number;
}
export interface AnalyticsEvent {
  id: string;
  kind: "click" | "highlight" | "copy";
  target: string;
  sectionId: string;
}
export interface AnalyticsMedia {
  id: string;
  started: boolean;
  playedMs: number;
  progress: number;
  completed: boolean;
  measurable: boolean;
  /** Stable duration and 20 equal timeline bins of replayed wall-clock time. */
  durationMs?: number;
  replayMs?: number[];
}
export interface AnalyticsMediaEvent {
  id: string;
  mediaId: string;
  kind: "play" | "pause" | "resume" | "seek" | "ended" | "exit";
  occurredAt: string;
  positionMs: number;
  /** Actual playback since the last play/resume; only pause, ended, or exit. */
  playedMs?: number;
}
export interface AnalyticsMediaEventRow {
  id: string;
  /** Article ID, or "home" for homepage hero playback. */
  post_id: string;
  title: string;
  media_id: string;
  media_title: string;
  media_type: "audio" | "video";
  provider: string;
  kind: AnalyticsMediaEvent["kind"];
  occurred_at: string;
  position_ms: number;
  played_ms?: number | null;
}
export interface AnalyticsMediaRow {
  /** Article ID, or "home" for homepage hero playback. */
  post_id: string;
  title: string;
  media_id: string;
  media_title: string;
  media_type: "audio" | "video";
  provider: string;
  views: number;
  measurable_views: number;
  /** 1 for a supported single-recording timeline, 0 for collections/unavailable. */
  timeline_available: number;
  starts: number;
  played_ms: number;
  /** Mean unique timeline coverage among measurable, started page views. */
  progress: number;
  completed: number;
  duration_ms?: number | null;
  replay_ms?: number[] | null;
  replay_measured_views?: number;
}
export interface AnalyticsBatch {
  viewId: string;
  sessionId: string;
  postId: string;
  revision: string;
  activeMs: number;
  scrollDepth: number;
  sections: AnalyticsSection[];
  events: AnalyticsEvent[];
  media?: AnalyticsMedia[];
  mediaEvents?: AnalyticsMediaEvent[];
}
export interface AnalyticsPage {
  id: string;
  title: string;
  views: number;
  active_ms: number;
  scroll_depth: number;
}
export type AnalyticsBreakdown =
  | "mediaEvents"
  | "media"
  | "pages"
  | "countries"
  | "sections"
  | "passages"
  | "clicks"
  | "commentPages"
  | "tags"
  | "contentKinds"
  | "contentTypes"
  | "writingStyles";
export interface AnalyticsPaginationInfo {
  total: number;
  offset: number;
  pageSize: number;
}
export interface AnalyticsContentRow {
  label: string;
  views: number;
  articles: number;
  active_ms: number;
  scroll_depth: number;
}
export interface AnalyticsReport {
  mediaEvents: AnalyticsMediaEventRow[];
  media: AnalyticsMediaRow[];
  tags: AnalyticsContentRow[];
  contentKinds: AnalyticsContentRow[];
  contentTypes: AnalyticsContentRow[];
  writingStyles: AnalyticsContentRow[];
  classificationCoverage: { views: number; classified_views: number };
  pagination: Record<AnalyticsBreakdown, AnalyticsPaginationInfo>;
  from: string;
  to: string;
  countryConfigured: boolean;
  countrySource?: "local" | "none";
  summary: {
    views: number;
    sessions: number;
    active_ms: number;
    scroll_depth: number;
    comments: number;
    approved_comments: number;
    events: { kind: string; count: number }[];
  };
  daily: { day: string; views: number; active_ms: number }[];
  countries: { country: string; views: number; active_ms: number }[];
  pages: AnalyticsPage[];
  sections: {
    post_id: string;
    title: string;
    revision: string;
    section_id: string;
    label: string;
    views: number;
    active_ms: number;
  }[];
  passages: {
    post_id: string;
    title: string;
    revision: string;
    section_id: string;
    target: string;
    highlights: number;
    copies: number;
  }[];
  clicks: { target: string; clicks: number }[];
  commentPages: {
    id: string;
    title: string;
    comments: number;
    approved_count: number;
    questions: number;
  }[];
  pageOptions: {
    id: string;
    title: string;
    slug: string;
    contentType?: ContentType;
  }[];
}
