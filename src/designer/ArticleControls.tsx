import { contentDesign, contentTypeLabel } from "../../shared/content-types";
import { TypographyControls, ArticlePresentationControls } from "./PresentationControls";
import CustomizeTabs from "./CustomizeTabs";
import { ContentWidth } from "./controls";
import Select from "../components/Select";
import type { ArticleDesign } from "../../shared/types";
import "../blog-design.css";
import { Appearance,Toggle } from "./controls";
import { PublicationColors, PublicationMedia } from "./PublicationAppearance";
import type { DesignerController } from "./useDesigner";
type Props = {
  state: Pick<DesignerController, "local" | "update" | "article" | "section">;
};
export default function ArticleControls({ state }: Props) {
  const { update, article } = state;
  const surface = state.section === "guide" ? state.section : "article";
  const local = { ...state.local, article: contentDesign(state.local, surface) };
  const label = contentTypeLabel(surface, local.publicationType).toLowerCase();
  return (
    <>
      <div className="design-control-heading">
        <span className="eyebrow">A LITTLE ROOM TO READ</span>
        <h3>{contentTypeLabel(surface, local.publicationType)} design</h3>
        <p>A look that follows every {label}.</p>
      </div>
      <CustomizeTabs layout={<>
      <fieldset className="page-layout-controls"><legend>Page structure</legend>
        <label>Opening layout<Select value={local.article.headerLayout ?? "standard"} onChange={e => article({ headerLayout: e.target.value as ArticleDesign["headerLayout"] })}>
          <option value="standard">Classic</option>
          <option value="cover-first">Cover first</option>
          <option value="split">Split opening</option>
          <option value="centered">Centered</option>
        </Select></label>
        <p>Changes the opening of every {label}. Pages without a cover keep a complete text-only opening.</p>
      </fieldset>
      <ContentWidth width={local.article.width} onChange={article} />
      </>} style={<>
        <PublicationColors theme={local} section={surface} onChange={article} />
        <div className="control-divider" />
        <Appearance {...local.article} width={undefined} onChange={article} />
        <TypographyControls design={local.article} onChange={article} />
        <ArticlePresentationControls design={local.article} onChange={article} />
        <div className="control-divider" />
        <PublicationMedia theme={local} onChange={update} />
      </>} content={<>
      <Toggle
        label="Publication date"
        value={local.article.showDates}
        onChange={(v) => article({ showDates: v })}
      />
      <Toggle
        label="Topics"
        value={local.article.showTags}
        onChange={(v) => article({ showTags: v })}
      />
      <Toggle
        label="Introduction"
        value={local.article.showExcerpt}
        onChange={(v) => article({ showExcerpt: v })}
      />
      <Toggle
        label="Cover image"
        value={local.article.showCover}
        onChange={(v) => article({ showCover: v })}
      />
      </>} />
    </>
  );
}
