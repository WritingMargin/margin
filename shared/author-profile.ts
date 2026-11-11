export type ProfileLink = { label: string; url: string };
export type AuthorProfile = {
  name: string;
  image: string;
  bio?: string;
  website?: string;
  links?: ProfileLink[];
};
export const emptyAuthorProfile: AuthorProfile = { name: "", image: "", bio: "", website: "", links: [] };
