export type WriterEditor = HTMLElement & {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  setSelectionRange: (start: number, end: number) => void;
  caretCoordinates?: () => {
    x: number;
    y: number;
    height: number;
    bounds: DOMRect;
  };
};
