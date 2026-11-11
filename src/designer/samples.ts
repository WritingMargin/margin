import { type Comment, type Post } from "../../shared/types";
import "../blog-design.css";
export const samplePosts: Post[] = [
  {
    id: "sample-1",
    featured: true,
    title: "On making space for what matters",
    slug: "making-space",
    excerpt:
      "A collection of small observations, unfinished thoughts, and things worth sharing.",
    status: "published",
    tags: ["Design", "Notes"],
    seo: { title: "", description: "", image: "" },
    cover:
      "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1000&q=80",
    createdAt: "2026-10-12T12:00:00Z",
    updatedAt: "2026-10-12T12:00:00Z",
    content:
      'Some ideas need a little space before they become something. A quiet corner. A fresh page. A place to think out loud.\n\n## A more intentional corner of the internet\n\nSometimes all you need is a blank page and a little room to think. This is a space for just that. **Less noise. More making.**\n\n:::callout{tone="note"}\nYou don\'t need a fully formed idea to begin. Sometimes writing is how you find it.\n:::\n\n> Good things happen in the margins.\n\nKeep a notebook close, collect what matters, and leave a little room for tomorrow.',
  },
  {
    id: "sample-2",
    title: "The quiet pleasure of a blank page",
    slug: "blank-page",
    excerpt:
      "A few thoughts on beginning before you feel ready, and finding your way as you go.",
    status: "published",
    tags: ["Notes"],
    seo: { title: "", description: "", image: "" },
    cover: "",
    createdAt: "2026-10-09T12:00:00Z",
    updatedAt: "2026-10-09T12:00:00Z",
  },
  {
    id: "sample-3",
    title: "Things worth paying attention to",
    slug: "paying-attention",
    excerpt:
      "Small details from an ordinary week. A reminder to look a little closer.",
    status: "published",
    tags: ["Life"],
    seo: { title: "", description: "", image: "" },
    cover: "",
    createdAt: "2026-10-06T12:00:00Z",
    updatedAt: "2026-10-06T12:00:00Z",
  },
];
export const sampleComments: Comment[] = [
  {
    id: "sample-comment-1",
    postId: "sample-1",
    name: "Alex Morgan",
    body: "A lovely reminder to make a little room for the unfinished. Thank you for sharing this.",
    createdAt: "2026-10-12T12:00:00Z",
    approved: true,
  },
  {
    id: "sample-comment-2",
    postId: "sample-1",
    name: "Sam Lee",
    body: "This is exactly the nudge I needed to open my notebook again.",
    createdAt: "2026-10-13T12:00:00Z",
    approved: true,
  },
];
