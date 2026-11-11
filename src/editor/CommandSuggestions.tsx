import { createPortal } from "react-dom";
import type { CommandEditorController } from "./useCommandEditor";
export default function CommandSuggestions({
  state,
}: {
  state: CommandEditorController;
}) {
  const { id, context, active, setActive, position, popup, open, accept } =
    state;
  return (
    <>
      {" "}
      {open &&
        context &&
        createPortal(
          <div
            ref={popup}
            className="command-suggestions"
            style={{
              left: position.left,
              top: position.top,
              visibility: position.visible ? "visible" : "hidden",
            }}
            onMouseDown={(event) => event.preventDefault()}
          >
            <div className="command-suggestions-heading">
              {context.kind === "font" ? "Choose a font" : "Insert a command"}
              <span>{context.items.length} available</span>
            </div>
            <div
              role="listbox"
              aria-label={
                context.kind === "font"
                  ? "Font suggestions"
                  : "Command suggestions"
              }
              id={`${id}-list`}
              className="command-suggestions-list"
            >
              {context.items.map((item, index) => (
                <div
                  role="option"
                  aria-selected={index === active}
                  id={`${id}-${index}`}
                  key={item.id}
                  className="command-suggestion"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => accept(item)}
                >
                  <span
                    className="command-suggestion-icon"
                    style={
                      item.family ? { fontFamily: item.family } : undefined
                    }
                  >
                    {item.family ? "Aa" : "/"}
                  </span>
                  <span>
                    <strong
                      style={
                        item.family ? { fontFamily: item.family } : undefined
                      }
                    >
                      {item.label}
                    </strong>
                    <small>{item.description}</small>
                  </span>
                  {index === active && (
                    <span
                      className="command-suggestion-enter"
                      aria-hidden="true"
                    >
                      ↵
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="command-suggestions-footer">
              ↑↓ choose <span>↵ / Tab insert</span>
              <span>Esc dismiss</span>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
