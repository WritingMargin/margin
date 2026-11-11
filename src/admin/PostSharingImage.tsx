import { coverImage } from "../../shared/audio";
import type { Post } from "../../shared/types";
import ImagePicker from "../media/ImagePicker";

export default function PostSharingImage({
  post,
  change,
  generate,
}: {
  post: Post;
  change: (patch: Partial<Post>) => void;
  generate: () => void;
}) {
  const cover = coverImage(post.cover);
  return (
    <ImagePicker
      label="Sharing image"
      imageLabel="Sharing image"
      description={imageSource(post.seo.image, cover)}
      value={post.seo.image}
      fallbackImage={cover}
      removeLabel={cover ? "Use cover again" : "Use publication default"}
      initialSource=""
      onChange={image => change({ seo: { ...post.seo, image } })}
      onGenerate={post.id ? generate : undefined}
    />
  );
}

function imageSource(selected: string, cover: string) {
  if (selected) return "Using a custom image for shared links.";
  if (cover) return "Shared links automatically use your cover.";
  return "Uses the publication’s default image if one is set.";
}
