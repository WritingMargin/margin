import { prepareInstallPrompt } from "./pwa/install-prompt";
import { createRoot } from "react-dom/client";
import { PublicBlog, type PublicBlogProps } from "./blog/PublicBlog";
import "./fonts";
import "./styles.css";

// Go supplies readable HTML and the same public data to every visitor. Enhance
// that document with the existing React controls without a second content fetch.
const root = document.getElementById("public-root");
const data = document.getElementById("public-data");
if (root && data?.textContent) {
  const props: PublicBlogProps = JSON.parse(data.textContent);
  if (props.theme.pwa?.showInstallButton) prepareInstallPrompt();
  createRoot(root).render(<PublicBlog {...props} />);
}
