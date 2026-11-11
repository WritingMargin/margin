import { useState } from "react";
import { taggedBlock, modelTag, figmaTag } from "../../shared/content-tags";
import { figmaEmbedUrl } from "../../shared/figma";
import Select from "../components/Select";
import { safePosterUrl } from "./block-poster";
import { safeClipUrl, safeModelUrl } from "./scene-model-format";

import { useDiagramUpload, type DiagramFileKind } from "./useDiagramUpload";

const options = {
  model: "3D model or animation",
  artwork: "Illustration from exported artwork",
  figma: "Live Figma design or prototype",
} as const;
type Kind = keyof typeof options;
const hints = {
  model:
    "Upload a GLB, self-contained glTF, OBJ or STL file, or paste its URL. Each file can be up to 20 MiB.",
  artwork:
    "Link to the hosted image exported from Figma. Edit the numbered regions in the inserted block.",
  figma: "Paste a Figma design, prototype or FigJam share link.",
};
const validators = {
  model: safeModelUrl,
  artwork: safePosterUrl,
  figma: figmaEmbedUrl,
};

export default function DiagramAssetPicker({
  insert,
}: {
  insert: (content: string) => void;
}) {
  const [kind, setKind] = useState<Kind>("model");
  const [source, setSource] = useState("");
  const [clipUrl, setClipUrl] = useState("");
  const animationSrc = clipUrl.trim() || undefined;
  const [title, setTitle] = useState("");
  const uploads = useDiagramUpload((kind, url, file) => {
    if (kind === "clip") return setClipUrl(url);
    setSource(url);
    setTitle((current) =>
      current.trim()
        ? current
        : file.name.replace(/\.[^.]+$/, "").slice(0, 160),
    );
  });
  const src = source.trim();
  const name = title.trim();
  const valid = validators[kind](src);
  const invalidClip = invalidClipSource(kind, animationSrc);
  function add() {
    if (kind === "figma") return insert(`\n\n${figmaTag(src, name)}\n\n`);
    if (kind === "model")
      return insert(`\n\n${modelTag(src, name, animationSrc)}\n\n`);
    const spec = {
      title: name,
      artwork: { src, alt: name },
      width: 600,
      height: 600,
      regions: [
        {
          id: "detail",
          label: "Detail",
          description: "Describe this part of the drawing.",
          x: 300,
          y: 300,
        },
      ],
    };
    insert(taggedBlock("illustration", JSON.stringify(spec, null, 2)));
  }
  return (
    <fieldset className="checklist-picker" disabled={uploads.busy}>
      <legend>Import a diagram</legend>
      <label>
        Asset type{" "}
        <Select
          value={kind}
          onChange={(event) => setKind(event.target.value as Kind)}
        >
          {Object.entries(options).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </label>
      <label>
        Title{" "}
        <input
          value={title}
          maxLength={160}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      {kind === "model" && <FileInput kind="model" upload={uploads.upload} />}
      <label>
        Source URL{" "}
        <input
          value={source}
          maxLength={2000}
          onChange={(event) => setSource(event.target.value)}
        />
      </label>
      {kind === "model" && (
        <>
          <FileInput kind="clip" upload={uploads.upload} />
          <label>
            Three.js clip URL (optional)
            <input
              value={clipUrl}
              maxLength={2000}
              onChange={(event) => setClipUrl(event.target.value)}
            />
          </label>
          <UploadStatus uploads={uploads} />
          {invalidClip && (
            <small role="status">
              Enter a Three.js clip JSON URL or choose a file.
            </small>
          )}
        </>
      )}
      <p>{hints[kind]}</p>
      {src && !valid && (
        <small role="status">Enter a valid URL for this asset type.</small>
      )}
      <button
        type="button"
        className="button"
        disabled={!valid || !name || invalidClip}
        onClick={add}
      >
        Insert diagram
      </button>
    </fieldset>
  );
}

function FileInput({
  kind,
  upload,
}: {
  kind: DiagramFileKind;
  upload: (kind: DiagramFileKind, file: File) => Promise<void>;
}) {
  return (
    <label>
      {kind === "model" ? "Upload model" : "Upload Three.js clip (optional)"}
      <input
        type="file"
        accept={kind === "model" ? ".glb,.gltf,.obj,.stl" : ".json"}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void upload(kind, file);
        }}
      />
    </label>
  );
}
function UploadStatus({
  uploads,
}: {
  uploads: ReturnType<typeof useDiagramUpload>;
}) {
  return (
    <>
      {uploads.status && <small role="status">{uploads.status}</small>}
      {uploads.error && <small role="alert">{uploads.error}</small>}
    </>
  );
}

function invalidClipSource(kind: Kind, source?: string) {
  return kind === "model" && !!source && !safeClipUrl(source);
}
