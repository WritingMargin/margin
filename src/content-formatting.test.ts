import assert from "node:assert/strict";
import test from "node:test";
import { formattingReplacement, type FormattingProposal } from "../shared/formatting";

const proposal: FormattingProposal = { before: "My words", after: "## My words", changes: 1, applied: false, reviewed: true };

test("formatting applies only to the original snapshot and undo restores it exactly", () => {
  assert.equal(formattingReplacement(proposal.before, proposal, "apply"), proposal.after);
  assert.equal(formattingReplacement(proposal.after, { ...proposal, applied: true }, "undo"), proposal.before);
  assert.equal(formattingReplacement(proposal.before, proposal, "undo"), null);
  assert.equal(formattingReplacement(proposal.after, { ...proposal, applied: true }, "apply"), null);
});

test("pending formatting and undo cannot overwrite newer edits", () => {
  assert.equal(formattingReplacement("My words plus more typing", proposal, "apply"), null);
  assert.equal(formattingReplacement("## My words\nAn extra thought", { ...proposal, applied: true }, "undo"), null);
});

test("formatting cannot apply without a review acknowledgement", () => {
  const unreviewed = { ...proposal, reviewed: false };
  assert.equal(formattingReplacement(proposal.before, unreviewed, "apply"), null);
  assert.equal(formattingReplacement(proposal.before, { ...unreviewed, reviewed: true }, "apply"), proposal.after);
  assert.equal(formattingReplacement(proposal.after, { ...unreviewed, applied: true }, "undo"), proposal.before);
});
