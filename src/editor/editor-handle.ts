export type WriterEditor = HTMLElement & {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  setSelectionRange: (start: number, end: number) => void;
  /** Rich writer only: put a component at the caret / start or end a shelf drag. */
  insertComponent?: (src: string) => void;
  startComponentDrag?: (src: string) => void;
  endComponentDrag?: () => void;
  caretCoordinates?: () => {
    x: number;
    y: number;
    height: number;
    bounds: DOMRect;
  };
};
