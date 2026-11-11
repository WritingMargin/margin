import Select from "../components/Select";
import { useId } from "react";
import { publicationCopy, publicationTypes, type PublicationType } from "../../shared/publication";

export default function PublicationTypeField({ value, onChange }: {
  value: PublicationType;
  onChange: (value: PublicationType) => void;
}) {
  const id = useId();
  const words = publicationCopy(value);
  return (
    <div className="publication-type-field">
      <label htmlFor={id}>Publication type</label>
      <Select id={id} value={value} onChange={event => onChange(event.target.value as PublicationType)} aria-describedby={`${id}-help`}>
        {publicationTypes.map(type => <option key={type} value={type}>{publicationCopy(type).label}</option>)}
      </Select>
      <p id={`${id}-help`} className="small-text">Readers will see “All {words.plural}”, “Find a {words.singular}…” and “Read {words.singular}”. You can change this later.</p>
    </div>
  );
}
