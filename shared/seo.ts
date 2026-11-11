export interface SEOSettings {
  title: string;
  description: string;
  image: string;
  indexing: boolean;
  googleVerification: string;
}
export interface DomainSettings {
  url: string;
  effectiveUrl: string;
  serverUrl: string;
}
export type PostSEOSettings = Pick<
  SEOSettings,
  "title" | "description" | "image"
> & { noindex?: boolean; nofollow?: boolean };

export function robotsDirective(indexing: boolean, post?: PostSEOSettings) {
  const noindex = !indexing || post?.noindex === true;
  const nofollow = !indexing || post?.nofollow === true;
  if (!noindex && !nofollow) return "";
  return `${noindex ? "noindex" : "index"}, ${nofollow ? "nofollow" : "follow"}`;
}

export function homepageStructuredData(name: string, title: string, description: string, url: string, image: string) {
  const website = { "@type": "WebSite", "@id": `${url}#website`, name, description, url };
  const homepage = { "@type": "CollectionPage", "@id": `${url}#webpage`, name: title, description, url, isPartOf: { "@id": website["@id"] } };
  const sharingImage = image ? { image } : {};
  return { "@context": "https://schema.org", "@graph": [{ ...website, ...sharingImage }, { ...homepage, ...sharingImage }] };
}
