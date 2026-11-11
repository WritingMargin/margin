import { TemplateSectionLayout, TemplateHeroContent } from "./TemplateSectionControls";
import { TypographyControls, HomePresentationControls, HomepageCompositionControls } from "./PresentationControls";
import CustomizeTabs from "./CustomizeTabs";
import { ContentWidth } from "./controls";
import Select from "../components/Select";
import HomepagePaginationControls from "./HomepagePaginationControls";
import FeedControls from "./FeedControls";
import { publicationCopy } from "../../shared/publication";
import { type HomepageDesign } from "../../shared/types";
import "../blog-design.css";
import { Appearance,Toggle } from "./controls";
import ArtworkControls from "./ArtworkControls";
import { PublicationColors, PublicationMedia } from "./PublicationAppearance";
import LogoControls from "./LogoControls";
import { TaglineControls, FooterTitleControls } from "./LabelControls";
import type { DesignerController } from "./useDesigner";
type Props = {
  state: Pick<
    DesignerController,
    | "uploadLogo"
    | "uploadArtwork"
    | "uploadHeroVideo"
    | "uploadingVideo"
    | "notify"
    | "section"
    | "local"
    | "uploadingLogo"
    | "setUploadingLogo"
    | "logoSource"
    | "setLogoSource"
    | "error"
    | "setError"
    | "update"
    | "home"
  >;
};
export default function HomepageControls({ state }: Props) {
  const { local, update, home } = state;
  const words = publicationCopy(local.publicationType);
  return (
    <>
      <div className="design-control-heading">
        <span className="eyebrow">THE FIRST IMPRESSION</span>
        <h3>Your homepage</h3>
        <p>A place for every published {words.singular}.</p>
      </div>
      <CustomizeTabs layout={<>
        <TemplateSectionLayout design={local.homepage} onChange={home} />
        <HomepageLayout design={local.homepage} onChange={home} />
        <ContentWidth width={local.homepage.width} onChange={home} />
        <HomePresentationControls design={local.homepage} onChange={home} />
        <Toggle label="Welcome section" description="Introduce your publication." value={local.homepage.showHero} onChange={showHero => home({ showHero })} />
        <div className="control-divider" />
        <HomepageCompositionControls design={local.homepage} onChange={home} />
        <FeedControls design={local.homepage} publicationType={local.publicationType} onChange={home} />
        <div className="control-divider" />
        <HomepagePaginationControls design={local.homepage} onChange={home} />
      </>} content={<HomepageContent state={state} />} style={<>
        <PublicationColors theme={local} section="homepage" onChange={home} />
        <div className="control-divider" />
        <Appearance {...local.homepage} width={undefined} onChange={home} />
        <TypographyControls design={local.homepage} onChange={home} />
        <div className="control-divider" />
        <PublicationMedia theme={local} onChange={update} />
      </>} />
    </>
  );
}

function HomepageLayout({ design, onChange }: { design: HomepageDesign; onChange: (patch: Partial<HomepageDesign>) => void }) {
  return <fieldset className="page-layout-controls"><legend>Page structure</legend>
    <label>Story layout<Select value={design.layout} onChange={e => onChange({ layout: e.target.value as HomepageDesign["layout"] })}>
      <option value="list">Editorial list</option><option value="grid">Card grid</option><option value="magazine">Magazine</option>
    </Select></label>
    {!design.sections && <label>Introduction placement<Select value={design.heroLayout ?? "split"} onChange={e => onChange({ heroLayout: e.target.value as HomepageDesign["heroLayout"] })}>
      <option value="split">Across the top</option><option value="centered">Centered masthead</option><option value="sidebar">Left sidebar</option>
    </Select></label>}
    {!design.sections && <p>Combine any introduction with any story layout. The introduction appears when Welcome section is enabled.</p>}
  </fieldset>;
}

function HomepageContent({ state }: Props) {
  const { local, update, home } = state;
  return <>
    <label>Publication name<input maxLength={100} value={local.name} onChange={e => update({ name: e.target.value })} /></label>
    <LogoControls state={state} />
    <label>Publication description<textarea rows={2} maxLength={500} value={local.description} onChange={e => update({ description: e.target.value })} /></label>
    <div className="control-divider" />
    {local.homepage.sections ? <TemplateHeroContent design={local.homepage} onChange={home} upload={state.uploadArtwork} uploading={state.uploadingLogo} uploadVideo={state.uploadHeroVideo} uploadingVideo={state.uploadingVideo} /> : <>
    <label>Welcome headline<textarea rows={2} maxLength={200} value={local.homepage.title} onChange={e => home({ title: e.target.value })} /></label>
    <TaglineControls theme={local} onChange={home} />
    <label>Welcome introduction<textarea rows={3} maxLength={1000} value={local.homepage.description} onChange={e => home({ description: e.target.value })} /></label>
    <Toggle label="Hero media" value={local.homepage.showArtwork} onChange={showArtwork => home({ showArtwork })} />
    {local.homepage.showArtwork && <ArtworkControls state={state} />}
    </>}
    <div className="control-divider" />
    <Toggle label="Content excerpts" value={local.homepage.showExcerpts} onChange={showExcerpts => home({ showExcerpts })} />
    <Toggle label="Cover images" value={local.homepage.showImages} onChange={showImages => home({ showImages })} />
    <Toggle label="Publication dates" value={local.homepage.showDates} onChange={showDates => home({ showDates })} />
    <Toggle label="Topics" value={local.homepage.showTags} onChange={showTags => home({ showTags })} />
    <div className="control-divider" />
    <FooterTitleControls theme={local} onChange={update} />
  </>;
}
