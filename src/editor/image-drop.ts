import { coverImageLimit, coverImageTypes } from "../../shared/cover";

export function imageDropError(file: Pick<File, "type" | "size">) {
  if (!coverImageTypes.includes(file.type))
    return "Use a PNG, JPEG, WebP, or GIF image.";
  if (file.size > coverImageLimit) return "Images must be 10 MB or smaller.";
  return "";
}

// Follow the insertion point as the writer edits while uploads are pending.
export class ImageInsertion {
  constructor(
    public content: string,
    public position: number,
  ) {}

  update(next: string) {
    if (next === this.content) return;
    let start = 0;
    while (
      start < Math.min(this.content.length, next.length) &&
      this.content[start] === next[start]
    )
      start++;
    let end = this.content.length;
    let nextEnd = next.length;
    while (
      end > start &&
      nextEnd > start &&
      this.content[end - 1] === next[nextEnd - 1]
    ) {
      end--;
      nextEnd--;
    }
    if (this.position >= end) this.position += nextEnd - end;
    else if (this.position > start) this.position = nextEnd;
    this.content = next;
  }

  insert(tag: string) {
    const before = this.content.slice(0, this.position);
    const after = this.content.slice(this.position);
    const prefix = before
      ? "\n".repeat(Math.max(0, 2 - (before.match(/\n*$/)?.[0].length || 0)))
      : "";
    const inserted = `${prefix}${tag}\n\n`;
    this.content = before + inserted + after;
    this.position = before.length + inserted.length;
    return this.content;
  }
}
