export const coverPath =
  /^\/api\/public\/covers\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const coverImageTypes = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];
export const coverImageLimit = 10 * 1024 * 1024;
