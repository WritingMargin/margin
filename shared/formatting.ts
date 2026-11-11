export type FormattingProposal = {
  before: string;
  after: string;
  changes: number;
  applied: boolean;
  reviewed: boolean;
};

export function formattingCurrent(current: string, proposal: FormattingProposal): boolean {
  return current === (proposal.applied ? proposal.after : proposal.before);
}

// A proposal belongs to an exact editor snapshot. Neither apply nor undo may
// overwrite typing, a loaded revision, or another edit made in the meantime.
export function formattingReplacement(
  current: string,
  proposal: FormattingProposal,
  action: "apply" | "undo",
): string | null {
  if (action === "apply") {
    return !proposal.applied && proposal.reviewed && current === proposal.before
      ? proposal.after
      : null;
  }
  return proposal.applied && current === proposal.after ? proposal.before : null;
}
