import type { WriterEditor } from "./editor-handle";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type RefObject,
} from "react";
import { newMediaTag, type MediaDefaults } from "../../shared/media-defaults";
import { modelTag } from "../../shared/content-tags";
import { diagramFileKind, uploadDiagramFile } from "../blocks/diagram-file";
import { api } from "../api";
import { ImageInsertion, imageDropError } from "./image-drop";

type Props = {
  editorRef: RefObject<WriterEditor | null>;
  value: string;
  onChange: (value: string) => void;
  mediaDefaults: MediaDefaults;
};

function isFileDrag(event: DragEvent) {
  return Array.from(event.dataTransfer.types).includes("Files");
}

async function uploadImage(file: File, signal: AbortSignal) {
  const error = imageDropError(file);
  if (error) throw new Error(error);
  return api<{ url: string }>("/media/covers", {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
    signal,
  });
}

function dropItems(files: File[]) {
  const models = files.filter((file) => diagramFileKind(file) === "model");
  const clips = files.filter((file) => diagramFileKind(file) === "clip");
  const clip = models.length === 1 && clips.length === 1 ? clips[0] : undefined;
  return files
    .filter((file) => file !== clip)
    .map((file) => ({ file, clip: models[0] === file ? clip : undefined }));
}

async function droppedTag(
  file: File,
  clip: File | undefined,
  defaults: MediaDefaults,
  signal: AbortSignal,
) {
  switch (diagramFileKind(file)) {
    case "clip":
      throw new Error(
        "Drop one model and its JSON clip together, or attach the clip in Import a diagram.",
      );
    case "model": {
      const model = await uploadDiagramFile("model", file, signal);
      const animation = clip && (await uploadDiagramFile("clip", clip, signal));
      return modelTag(
        model.url,
        file.name.replace(/\.[^.]+$/, "").slice(0, 160) || "3D model",
        animation?.url,
      );
    }
    default:
      return newMediaTag(
        "image",
        (await uploadImage(file, signal)).url,
        defaults,
      );
  }
}

export function useImageDrop(props: Props) {
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const depth = useRef(0);
  const request = useRef<AbortController | null>(null);
  const insertion = useRef<ImageInsertion | null>(null);
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
    insertion.current?.update(props.value);
  });
  useEffect(() => () => request.current?.abort(), []);

  const onChange = (value: string) => {
    insertion.current?.update(value);
    latest.current.onChange(value);
  };
  const upload = async (files: File[]) => {
    const controller = new AbortController();
    request.current = controller;
    const { editorRef, value, mediaDefaults } = latest.current;
    const target = new ImageInsertion(
      value,
      editorRef.current?.selectionStart ?? value.length,
    );
    insertion.current = target;
    setErrors([]);
    let added = 0;
    const items = dropItems(files);
    for (const { file, clip } of items) {
      setStatus(`Uploading ${file.name}…`);
      try {
        const tag = await droppedTag(
          file,
          clip,
          mediaDefaults,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        latest.current.onChange(target.insert(tag));
        added++;
      } catch (error) {
        if (controller.signal.aborted) return;
        setErrors((previous) => [
          ...previous,
          `${file.name}: ${(error as Error).message}`,
        ]);
      }
    }
    insertion.current = null;
    request.current = null;
    setStatus(added ? `Added ${added} ${added === 1 ? "item" : "items"}.` : "");
  };
  const onDrop = (event: DragEvent) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    depth.current = 0;
    setDragging(false);
    if (request.current) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length) void upload(files);
  };
  return {
    dragging,
    status,
    errors,
    onChange,
    handlers: {
      onDropCapture: onDrop,
      onDragEnter: (event: DragEvent) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        depth.current++;
        setDragging(true);
      },
      onDragOver: (event: DragEvent) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = request.current ? "none" : "copy";
      },
      onDragLeave: (event: DragEvent) => {
        if (!isFileDrag(event)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setDragging(false);
      },
    },
    dropLabel: request.current
      ? "An upload is already in progress"
      : "Drop images or 3D models at the cursor",
  };
}
