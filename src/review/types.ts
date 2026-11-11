import type { Post } from "../../shared/types";

export interface ReviewNote {
  id: string;
  body: string;
  quote: string;
  revision: string;
  occurrence: number;
  anchorStatus?: "earlier";
  addressed_revision: string;
}
export interface PeerReview {
  id: string;
  email: string;
  reviewer_name: string;
  closed: boolean;
  status: string;
  notes: ReviewNote[];
}
export interface ReviewVisit {
  post: Post;
  previous: Post | null;
  notes: ReviewNote[];
  status: string;
  name: string;
  badgeName: string;
  canApprove: boolean;
}
