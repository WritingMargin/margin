import { createContext, useContext } from "react";
import type { TeamRole, TeamUser } from "../../shared/team";
export const TeamContext = createContext<{ role: TeamRole; user?: TeamUser; primaryOwner: boolean }>({ role: "owner", primaryOwner: true });
export const useTeamIdentity = () => useContext(TeamContext);
