import labels from "../backend/internal/blog/publication-labels.json";
export type PublicationType = keyof typeof labels;
export type PublicationSettings = { type: PublicationType };
export type PublicationCopy = (typeof labels)[PublicationType];
export const publicationTypes = Object.keys(labels) as PublicationType[];
export const publicationCopy = (type: PublicationType): PublicationCopy => labels[type];
