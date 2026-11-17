import RichWriter from "./rich/RichWriter";
import { useImageDrop } from "./useImageDrop";
import "./image-drop.css";

type Props = Parameters<typeof useImageDrop>[0] & { toolbarSlot?: HTMLElement | null };
export default function WriterPad(props: Props) {
  const drop = useImageDrop(props);
  return (
    <>
      <div
        className={`source-body writer-source${drop.dragging ? " image-drop-active" : ""}`}
        {...drop.handlers}
      >
        <RichWriter
          editorRef={props.editorRef}
          value={props.value}
          onChange={drop.onChange}
          toolbarSlot={props.toolbarSlot}
        />
        {drop.dragging && (
          <div className="image-drop-hint">{drop.dropLabel}</div>
        )}
      </div>
      <div className="image-drop-feedback">
        <p role="status">{drop.status}</p>
        {drop.errors.length > 0 && (
          <ul role="alert">
            {drop.errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
