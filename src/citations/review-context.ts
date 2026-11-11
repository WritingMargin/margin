import { createContext } from "react";

// Only the draft-review view supplies a grant. External source URLs never receive it.
export const ReviewInviteContext = createContext("");
