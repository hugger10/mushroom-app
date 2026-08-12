import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from "react";
import type { ContactListItem, UserSearchResult } from "@mushroom/shared";

export type StartConversationProps = {
  availableContacts: ContactListItem[];
  onSearchUsers: (keyword: string) => Promise<UserSearchResult[]>;
  /** Open chat for a known direct user (pushes the chat screen). */
  onOpenChatByUserId: (userId: number) => Promise<void>;
  /** Add a user as contact and open chat (pushes the chat screen). */
  onStartDirectConversation: (userId: number) => Promise<void>;
  /** Create a group and stay on Home; no automatic push to chat. */
  onCreateGroupConversation: (input: {
    groupName: string;
    memberIds: number[];
    memberProfiles?: Array<{
      user_id: number;
      username: string;
      nickname?: string;
      avatar_url?: string;
    }>;
  }) => Promise<void>;
};

type GroupSelectionContext = {
  selectedContactIds: number[];
  toggleContact: (userId: number) => void;
  removeContact: (userId: number) => void;
  reset: () => void;
  groupRemoteResults: UserSearchResult[];
  setGroupRemoteResults: (results: UserSearchResult[]) => void;
};

const StartConversationContext = createContext<StartConversationProps | null>(
  null
);

const GroupSelectionCtx = createContext<GroupSelectionContext | null>(null);

export function StartConversationProvider(props: {
  value: StartConversationProps;
  children: ReactNode;
}) {
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [groupRemoteResults, setGroupRemoteResults] = useState<
    UserSearchResult[]
  >([]);

  const selectionApi = useMemo<GroupSelectionContext>(
    () => ({
      selectedContactIds,
      toggleContact: (userId: number) => {
        setSelectedContactIds(current =>
          current.includes(userId)
            ? current.filter(id => id !== userId)
            : [...current, userId]
        );
      },
      removeContact: (userId: number) => {
        setSelectedContactIds(current => current.filter(id => id !== userId));
      },
      reset: () => {
        setSelectedContactIds([]);
        setGroupRemoteResults([]);
      },
      groupRemoteResults,
      setGroupRemoteResults
    }),
    [selectedContactIds, groupRemoteResults]
  );

  return (
    <StartConversationContext.Provider value={props.value}>
      <GroupSelectionCtx.Provider value={selectionApi}>
        {props.children}
      </GroupSelectionCtx.Provider>
    </StartConversationContext.Provider>
  );
}

export function useStartConversation(): StartConversationProps {
  const value = useContext(StartConversationContext);
  if (!value) {
    throw new Error(
      "useStartConversation must be used inside StartConversationProvider"
    );
  }
  return value;
}

export function useGroupSelection(): GroupSelectionContext {
  const value = useContext(GroupSelectionCtx);
  if (!value) {
    throw new Error(
      "useGroupSelection must be used inside StartConversationProvider"
    );
  }
  return value;
}
