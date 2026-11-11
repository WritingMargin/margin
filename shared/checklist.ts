export const checklistExample = (floating = false) => `[Checklist title="Your checklist" floating="${floating}"]
- [ ] Gather what you need
- [ ] Follow the steps
- [ ] Check the result
[/Checklist]`;

export interface ChecklistItem { label: string; checked: boolean }
