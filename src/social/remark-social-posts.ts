import type { Root } from "mdast";
import { visit } from "unist-util-visit";
import { socialPost } from "../../shared/social-posts";

export default function socialPosts() {
  return (tree: Root) =>
    visit(tree, "paragraph", (node) => {
      if (node.children.length !== 1) return;
      const child = node.children[0];
      if (
        child.type !== "link" ||
        child.children.length !== 1 ||
        child.children[0].type !== "text" ||
        child.children[0].value !== child.url
      )
        return;
      const post = socialPost(child.url);
      if (post)
        node.data = {
          hName: "div",
          hProperties: { className: ["md-social"], dataSocialUrl: post.url },
          hChildren: [],
        };
    });
}
