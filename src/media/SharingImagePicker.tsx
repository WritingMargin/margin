import ImagePicker from "./ImagePicker";

export default function SharingImagePicker(props: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
}) {
  return <ImagePicker {...props} label={props.label ?? "Sharing image (Open Graph)"}
    imageLabel="Sharing image"
    description="Used for Open Graph and Twitter/X cards. Ideally 1200 × 630 pixels." />;
}
