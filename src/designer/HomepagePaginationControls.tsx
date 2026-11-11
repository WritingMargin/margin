import Select from "../components/Select";
import type { HomepageDesign } from "../../shared/types";
import { homepageHasFeatured } from "../../shared/template-sections";
import { Toggle } from "./controls";
import "./homepage-pagination-controls.css";
export default function HomepagePaginationControls({
  design,
  onChange,
}: {
  design: HomepageDesign;
  onChange: (value: Partial<HomepageDesign>) => void;
}) {
  return (
    <>
      {homepageHasFeatured(design) && (
        <fieldset className="page-layout-controls featured-article-controls">
          <legend>Featured articles</legend>
          <Toggle
            label="Show in article list"
            description="Also include featured articles in the main feed."
            value={design.includeFeaturedInFeed ?? false}
            onChange={(includeFeaturedInFeed) =>
              onChange({ includeFeaturedInFeed })
            }
          />
        </fieldset>
      )}
      <fieldset className="homepage-pagination-controls">
        <legend>Homepage pagination</legend>
        <label>
          Navigation style
          <Select
            value={design.pagination || "pages"}
            onChange={(event) =>
              onChange({
                pagination: event.target.value as HomepageDesign["pagination"],
              })
            }
          >
            <option value="pages">Numbered pages</option>
            <option value="more">Load more button</option>
          </Select>
        </label>
        <label>
          Posts per page
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            required
            value={Number.isFinite(design.pageSize) ? design.pageSize : ""}
            onChange={(event) =>
              onChange({ pageSize: event.target.valueAsNumber })
            }
          />
        </label>
        <p className="small-text">
          Show 1–100 posts at a time. Search and topic filters include your
          whole publication.
        </p>
      </fieldset>
    </>
  );
}
