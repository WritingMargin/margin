import CustomizeTabs from "./CustomizeTabs";
import Select from "../components/Select";
import { type CommentsDesign } from "../../shared/types";
import "../blog-design.css";
import { Appearance,Toggle } from "./controls";
import type { DesignerController } from "./useDesigner";
import { sitePath } from "../base-path";
type Props = { state: Pick<DesignerController, "local" | "comments"> };
export default function CommentControls({ state }: Props) {
  const { local, comments } = state;
  return (
    <>
      <div className="design-control-heading">
        <span className="eyebrow">IN THE MARGINS</span>
        <h3>The conversation</h3>
        <p>Make readers feel welcome.</p>
      </div>
      <CustomizeTabs layout={<>
      <label>
        Comment layout
        <Select
          value={local.comments.layout}
          onChange={(e) =>
            comments({ layout: e.target.value as CommentsDesign["layout"] })
          }
        >
          <option value="minimal">Minimal separators</option>
          <option value="cards">Individual cards</option>
        </Select>
      </label>
      <Toggle
        label="Reader initials"
        value={local.comments.showAvatars}
        onChange={(v) => comments({ showAvatars: v })}
      />
      <Toggle
        label="Comment dates"
        value={local.comments.showDates}
        onChange={(v) => comments({ showDates: v })}
      />
      </>} content={<>
      <p className="small-text">Manage who can take part in <a className="text-link" href={sitePath("/admin/readers?tab=settings")}>Readers settings</a>. Customize the appearance here.</p>
      <label>
        Heading
        <input
          maxLength={150}
          value={local.comments.heading}
          onChange={(e) => comments({ heading: e.target.value })}
        />
      </label>
      <label>
        Introduction
        <textarea
          rows={3}
          maxLength={1000}
          value={local.comments.introduction}
          onChange={(e) => comments({ introduction: e.target.value })}
        />
      </label>
      <div className="control-divider" />
      <label>
        Name field label
        <input
          maxLength={80}
          value={local.comments.nameLabel}
          onChange={(e) => comments({ nameLabel: e.target.value })}
        />
      </label>
      <label>
        Email field label
        <input
          maxLength={80}
          value={local.comments.emailLabel}
          onChange={(e) => comments({ emailLabel: e.target.value })}
        />
      </label>
      <label>
        Comment field label
        <input
          maxLength={80}
          value={local.comments.bodyLabel}
          onChange={(e) => comments({ bodyLabel: e.target.value })}
        />
      </label>
      <label>
        Comment placeholder
        <textarea
          rows={2}
          maxLength={300}
          value={local.comments.placeholder}
          onChange={(e) => comments({ placeholder: e.target.value })}
        />
      </label>
      <label>
        Button label
        <input
          maxLength={60}
          value={local.comments.buttonLabel}
          onChange={(e) => comments({ buttonLabel: e.target.value })}
        />
      </label>
      </>} style={<>
      <label>
        Card background
        <div className="color-field">
          <input
            type="color"
            aria-label="Comment card background"
            value={local.comments.background}
            onChange={(e) => comments({ background: e.target.value })}
          />
          <code>{local.comments.background}</code>
        </div>
      </label>
      <Appearance
        border={local.comments.border}
        radius={local.comments.radius}
        onChange={comments}
      />
      </>} />
    </>
  );
}
