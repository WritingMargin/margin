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
import {
  extractDroppedFiles,
  ImageInsertion,
  isFileTransfer,
  uploadDroppedImage,
} from "./image-drop";

type Props = {
  editorRef: RefObject<WriterEditor | null>;
  value: string;
  onChange: (value: string) => void;
  mediaDefaults: MediaDefaults;
  imagesOnly?: boolean;
};

function dropItems(files: File[], imagesOnly: boolean) {
  if (imagesOnly) {
    return files.map((file) => ({ file, clip: undefined as File | undefined }));
  }
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
  imagesOnly: boolean,
  signal: AbortSignal,
) {
  if (!imagesOnly) {
    const kind = diagramFileKind(file);
    if (kind === "clip") {
      throw new Error(
        "Drop one model and its JSON clip together, or attach the clip in Import a diagram.",
      );
    }
    if (kind === "model") {
      const model = await uploadDiagramFile("model", file, signal);
      const animation = clip && (await uploadDiagramFile("clip", clip, signal));
      return modelTag(
        model.url,
        file.name.replace(/\.[^.]+$/, "").slice(0, 160) || "3D model",
        animation?.url,
      );
    }
  }
  return newMediaTag(
    "image",
    (await uploadDroppedImage(file, signal)).url,
    defaults,
  );
}

async function uploadDropBatch(
  items: { file: File; clip: File | undefined }[],
  defaults: MediaDefaults,
  imagesOnly: boolean,
  signal: AbortSignal,
  callbacks: {
    onStatus: (message: string) => void;
    onInserted: (tag: string) => void;
    onError: (message: string) => void;
  },
) {
  let added = 0;
  for (const { file, clip } of items) {
    const label = file.name || "image";
    callbacks.onStatus(`Uploading ${label}…`);
    try {
      const tag = await droppedTag(file, clip, defaults, imagesOnly, signal);
      if (signal.aborted) return -1;
      callbacks.onInserted(tag);
      added++;
    } catch (error) {
      if (signal.aborted) return -1;
      callbacks.onError(`${file.name || "Image"}: ${(error as Error).message}`);
    }
  }
  return added;
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
    depth.current = 0;
    setDragging(false);
    if (request.current || !files.length) return;
    const controller = new AbortController();
    request.current = controller;
    const { editorRef, value, mediaDefaults, imagesOnly = false } = latest.current;
    const target = new ImageInsertion(
      value,
      editorRef.current?.selectionStart ?? value.length,
    );
    insertion.current = target;
    setErrors([]);
    const added = await uploadDropBatch(
      dropItems(files, imagesOnly),
      mediaDefaults,
      imagesOnly,
      controller.signal,
      {
        onStatus: setStatus,
        onInserted: (tag) => latest.current.onChange(target.insert(tag)),
        onError: (message) => setErrors((previous) => [...previous, message]),
      },
    );
    if (added < 0) return;
    insertion.current = null;
    request.current = null;
    setStatus(added ? `Added ${added} ${added === 1 ? "item" : "items"}.` : "");
  };
  const onDrop = (event: DragEvent) => {
    if (!isFileTransfer(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    depth.current = 0;
    setDragging(false);
    const files = extractDroppedFiles(event.dataTransfer);
    if (files.length) void upload(files);
  };
  const imagesOnly = Boolean(props.imagesOnly);
  return {
    dragging,
    status,
    errors,
    onChange,
    uploadFiles: (files: File[]) => {
      void upload(files);
    },
    handlers: {
      onDrop,
      onDragEnter: (event: DragEvent) => {
        if (!isFileTransfer(event.dataTransfer)) return;
        event.preventDefault();
        depth.current++;
        setDragging(true);
      },
      onDragOver: (event: DragEvent) => {
        if (!isFileTransfer(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = request.current ? "none" : "copy";
      },
      onDragLeave: (event: DragEvent) => {
        if (!isFileTransfer(event.dataTransfer)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setDragging(false);
      },
    },
    dropLabel: request.current
      ? "An upload is already in progress"
      : imagesOnly
        ? "Drop images to add them to your note"
        : "Drop images or 3D models at the cursor",
  };
}
