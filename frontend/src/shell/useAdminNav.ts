import { useCallback } from "react";
import {
  type AdminPageId,
  closeAdminPage,
  openAdminPage,
  useRoute,
  viewPath,
} from "../hooks/useRoute";
import { useSessionContext } from "./SessionContext";

// Drives an admin/utility page button (Welcome, Settings, Health). Admin pages
// are pure URL navigations — opening one pushes its path, and "turning it off" is
// a back-navigation. This hook gives a button the two things it needs:
//
//   • isActive — whether this page is the current route, so the button can show
//     its pressed state AND know a click means "turn off" rather than "open".
//   • activate — the click handler: open the page if it's not showing, else close
//     it (history.back when safe, else fall back to the conversation/home path).
//
// activeId is a projection of the URL (Shell's useUrlDrivenAdmin activates the
// admin widget for an admin route); this hook only owns navigation.
export function useAdminNav(id: AdminPageId): {
  isActive: boolean;
  activate: () => void;
} {
  const route = useRoute();
  const { sessionId } = useSessionContext();
  const isActive = route.type === "admin" && route.id === id;

  const activate = useCallback(() => {
    if (route.type === "admin" && route.id === id) {
      // Already here → turn off. Fall back to the current conversation (or home)
      // for the deep-link/refresh case where there's no prior entry to pop.
      closeAdminPage(viewPath(sessionId, null));
    } else {
      openAdminPage(id);
    }
  }, [route, id, sessionId]);

  return { isActive, activate };
}
