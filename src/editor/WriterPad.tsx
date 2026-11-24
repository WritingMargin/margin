import RichWriter from "./rich/RichWriter";
import { useImageDrop } from "./useImageDrop";
import "./image-drop.css";

type Props = Parameters<typeof useImageDrop>[0] & {
  toolbarSlot?: HTMLElement | null;
  ariaLabel?: string;
  placeholder?: string;
  minimal?: boolean;
  drop?: ReturnType<typeof useImageDrop>;
};

export default function WriterPad(props: Props) {
  const internalDrop = useImageDrop(props);
  const drop = props.drop ?? internalDrop;
  const bindContainer = !props.drop;
  return (
    <>
      <div
        className={`source-body writer-source${drop.dragging ? " image-drop-active" : ""}`}
        {...(bindContainer ? drop.handlers : {})}
      >
        <RichWriter
          editorRef={props.editorRef}
          value={props.value}
          onChange={drop.onChange}
          ariaLabel={props.ariaLabel}
          placeholder={props.placeholder}
          toolbarSlot={props.toolbarSlot}
          onDropFiles={drop.uploadFiles}
          minimal={props.minimal}
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
