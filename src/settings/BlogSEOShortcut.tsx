import { ArrowRight, Search } from "lucide-react";

export default function BlogSEOShortcut({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="settings-card" aria-labelledby="blog-seo-shortcut">
      <div className="settings-icon"><Search /></div>
      <h2 id="blog-seo-shortcut">Blog SEO</h2>
      <p>
        Set your homepage’s search title and meta description, choose a default
        sharing image, and manage search indexing and Google site verification.
        These settings apply to your publication as a whole.
      </p>
      <button className="button" type="button" onClick={onOpen}>
        Configure blog SEO <ArrowRight size={16} />
      </button>
    </section>
  );
}
