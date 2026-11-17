import type { HomepageSection } from "./template-sections";
import type { FeedHeaderDesign, FeedFiltersDesign } from "./feed-design";
import type { PublicationType } from "./publication";
import type { BlogFont } from "./typography.ts";
import type { PostSEOSettings } from "./seo";

export type RecommendationSettings = {
  mode: "automatic" | "smart" | "manual";
  postIds: string[];
};

export type ContentType = "article" | "guide";

export interface Post {
  baseRevision?: string;
  simplifiedAvailable?: boolean;
  simplified?: boolean;
  simplifiedReviewed?: boolean;
  reviewedBy?: string[];
  contentType?: ContentType;
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  status: "draft" | "published" | "archived";
  tags: string[];
  cover: string;
  coverMode?: "player" | "preview";
  seo: PostSEOSettings;
  createdAt: string;
  updatedAt: string;
  content?: string;
  revision?: string;
  featured?: boolean;
  tableOfContents?: "off" | "top" | "left" | "right";
  recommendations?: RecommendationSettings;
  relatedPosts?: Post[];
}

export interface SectionAppearance {
  background?: string;
  text?: string;
  accent?: string;
  font: BlogFont;
  headingFont?: BlogFont;
  headingScale?: "standard" | "compact" | "display";
  spacing?: "standard" | "compact" | "airy";
  width: "narrow" | "wide";
  border: "subtle" | "bold";
  radius: number;
}

export interface HomepageDesign extends SectionAppearance {
  feedHeader?: FeedHeaderDesign;
  feedFilters?: FeedFiltersDesign;
  sections?: HomepageSection[];
  sectionSpacing?: "none" | "compact" | "standard" | "airy";
  showSearch?: boolean;
  showTopicFilters?: boolean;
  showPostCount?: boolean;
  showFeedHeading?: boolean;
  showFeatured?: boolean;
  searchPosition?: "inline" | "above" | "below";
  featuredPosition?: "before" | "after";
  pageSize: number;
  pagination: "pages" | "more";
  tagline: string;
  showTagline: boolean;
  title: string;
  description: string;
  layout: "list" | "grid" | "magazine";
  cardStyle?: "classic" | "flat" | "outlined" | "filled";
  imageRatio?: "auto" | "landscape" | "square" | "portrait";
  gridColumns?: "two" | "three";
  showNumbers?: boolean;
  heroLayout?: "split" | "centered" | "sidebar";
  showHero: boolean;
  showArtwork: boolean;
  includeFeaturedInFeed: boolean;
  artworkType: "logo" | "emoji" | "image" | "video";
  artworkEmoji: string;
  artworkImage: string;
  artworkVideo?: string;
  showExcerpts: boolean;
  showImages: boolean;
  showDates: boolean;
  showTags: boolean;
}

export interface ArticleDesign extends SectionAppearance {
  tableOfContents?: import("./table-of-contents").TableOfContentsDesign;
  bodySize?: "small" | "regular" | "large";
  lineSpacing?: "compact" | "relaxed" | "loose";
  measure?: "auto" | "focused" | "reading" | "wide";
  headingStyle?: "plain" | "ruled" | "accent";
  quoteStyle?: "border" | "pull" | "panel";
  headerLayout?: "standard" | "cover-first" | "split" | "centered";
  showDates: boolean;
  showTags: boolean;
  showCover: boolean;
  showExcerpt: boolean;
}

export interface CommentsDesign {
  visible: boolean;
  enabled: boolean;
  layout: "minimal" | "cards";
  heading: string;
  introduction: string;
  buttonLabel: string;
  showAvatars: boolean;
  showDates: boolean;
  nameLabel: string;
  emailLabel: string;
  bodyLabel: string;
  placeholder: string;
  border: "subtle" | "bold";
  radius: number;
  background: string;
}

export interface Theme {
  publicationType: PublicationType;
  footerTitle: string;
  showFooterTitle: boolean;
  showFooterLogo: boolean;
  footerDescription: string;
  footerLinks: { label: string; url: string }[];
  footerLayout: "split" | "stacked" | "centered";
  footerBackground: string;
  footerText: string;
  footerFont: BlogFont | "inherit";
  logo: string;
  name: string;
  description: string;
  accent: string;
  background: string;
  text: string;
  imageBorder: "none" | "subtle" | "bold";
  videoBorder: "none" | "subtle" | "bold";
  homepage: HomepageDesign;
  article: ArticleDesign;
  guide?: ArticleDesign;
  comments: CommentsDesign;
}

export interface Comment {
  quote?: string;
  anchor_status?: "active" | "detached" | "hidden";
  kind?: "comment" | "question" | "note";
  pinned?: boolean;
  answer?: string;
  followups?: import("./interactions").PassageFollowup[];
  id: string;
  postId: string;
  name: string;
  body: string;
  createdAt: string;
  approved: boolean;
  email?: string;
}

export const defaultTheme: Theme = {
  publicationType: "blog",
  footerTitle: "",
  showFooterTitle: true,
  showFooterLogo: false,
  footerDescription: "",
  footerLinks: [],
  footerLayout: "split",
  footerBackground: "",
  footerText: "",
  footerFont: "inherit",
  logo: "",
  name: "Margin",
  description: "Notes on design, making things, and paying attention.",
  accent: "#202020",
  background: "#ffffff",
  text: "#242424",
  imageBorder: "subtle",
  videoBorder: "subtle",
  homepage: {
    tagline: "",
    showTagline: true,
    title: "A little room for good ideas.",
    description: "Notes on design, making things, and paying attention.",
    layout: "list",
    heroLayout: "split",
    pageSize: 10,
    pagination: "pages",
    showHero: true,
    showArtwork: true,
    includeFeaturedInFeed: false,
    artworkType: "logo",
    artworkEmoji: "✳",
    artworkImage: "",
    showExcerpts: true,
    showImages: true,
    showDates: true,
    showTags: true,
    font: "serif",
    width: "wide",
    border: "subtle",
    radius: 4,
  },
  article: {
    headerLayout: "standard",
    font: "serif",
    width: "narrow",
    border: "subtle",
    radius: 4,
    showDates: true,
    showTags: true,
    showCover: true,
    showExcerpt: true,
  },
  comments: {
    visible: true,
    enabled: true,
    layout: "minimal",
    heading: "Join the conversation.",
    introduction:
      "A good story is the beginning of a conversation. Leave a thoughtful comment.",
    buttonLabel: "Leave a comment",
    showAvatars: true,
    showDates: true,
    nameLabel: "Your name",
    emailLabel: "Email",
    bodyLabel: "Your thoughts",
    placeholder: "Leave a thoughtful comment…",
    border: "subtle",
    radius: 4,
    background: "#fafafa",
  },
};
