import { createContext, useContext, type ReactNode } from "react";
import type { MobileMessageSearchResult } from "@mushroom/app-core";

export type WorkspaceSearchProps = {
  /**
   * Called when the user picks a result. Implementation typically routes
   * `chatActions.handleOpenWorkspaceSearchResult`, which flips wantsChat
   * and lets MainNavigator push the Chat screen.
   */
  onOpenResult: (result: MobileMessageSearchResult) => void;
  /**
   * Bubble screen-local errors to the global error banner.
   */
  onError: (message: string) => void;
};

const WorkspaceSearchContext = createContext<WorkspaceSearchProps | null>(null);

export function WorkspaceSearchProvider(props: {
  value: WorkspaceSearchProps;
  children: ReactNode;
}) {
  return (
    <WorkspaceSearchContext.Provider value={props.value}>
      {props.children}
    </WorkspaceSearchContext.Provider>
  );
}

export function useWorkspaceSearch(): WorkspaceSearchProps {
  const value = useContext(WorkspaceSearchContext);
  if (!value) {
    throw new Error(
      "useWorkspaceSearch must be used inside WorkspaceSearchProvider"
    );
  }
  return value;
}
