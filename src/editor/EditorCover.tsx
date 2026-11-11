import CoverMedia, { hasCover } from "../CoverMedia";
import { resolveAudio } from "../../shared/audio";
import { resolveVideo } from "../../shared/video";

type Props = {
  cover: string;
  mode?: string;
  showCover: boolean;
  onEdit?: () => void;
};

export default function EditorCover({ cover, showCover, onEdit, mode }: Props) {
  if (!hasCover(cover)) return null;
  if (!onEdit)
    return showCover ? (
      <CoverMedia mode={mode} className="preview-post-cover" src={cover} alt="Article cover" />
    ) : null;
  return (
    <div className="writer-cover editor-button-surface">
      <CoverMedia mode={mode} src={cover} alt="Selected article cover" />
      <div>
        <span>{resolveAudio(cover) ? "Audio cover" : resolveVideo(cover) ? "Video cover" : "Cover image"}</span>
        {!showCover && (
          <small>Hidden on the article by your design settings.</small>
        )}
      </div>
      <button type="button" className="button" onClick={onEdit}>
        Change cover
      </button>
    </div>
  );
}
