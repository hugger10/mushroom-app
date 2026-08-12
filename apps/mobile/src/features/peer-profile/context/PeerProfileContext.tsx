import { createContext, useContext, type ReactNode } from "react";
import type { Conversation, UserProfile } from "@mushroom/shared";

export type PeerProfileDerived = {
  isContact: boolean;
  isBlocked: boolean;
  peerConversation: Conversation | null;
  initialRemarkName: string;
  resolvedFallbackNickname: string;
  resolvedFallbackUsername: string | null;
  resolvedFallbackAvatar: string | null;
};

export type PeerProfileProps = {
  /**
   * Look up derived information (contact/block/conversation state + nickname
   * fallbacks) for a given userId. Computed at render time from current state
   * so the page stays in sync with contact list / conversation changes.
   */
  getDerived: (userId: number) => PeerProfileDerived;
  onLoadProfile: (userId: number) => Promise<UserProfile>;
  onOpenChat: (userId: number) => Promise<void>;
  onOpenSearchInChat: (userId: number) => Promise<void> | void;
  onSaveContactRemark: (input: {
    userId: number;
    remarkName: string;
  }) => Promise<void> | void;
  onDeleteContact: (
    userId: number,
    displayName?: string
  ) => Promise<void> | void;
  onBlockUser: (userId: number, displayName?: string) => Promise<void> | void;
  onUnblockUser: (userId: number, displayName?: string) => Promise<void> | void;
  onAddAsContact: (input: { userId: number }) => Promise<void>;
  onPressAvatar: (input: { avatarUrl?: string | null; label?: string }) => void;
  onClearConversation: (userId: number) => void;
  onToggleMute: (userId: number) => void;
  onTogglePin: (userId: number) => void;
};

const PeerProfileContext = createContext<PeerProfileProps | null>(null);

export function PeerProfileProvider(props: {
  value: PeerProfileProps;
  children: ReactNode;
}) {
  return (
    <PeerProfileContext.Provider value={props.value}>
      {props.children}
    </PeerProfileContext.Provider>
  );
}

export function usePeerProfile(): PeerProfileProps {
  const value = useContext(PeerProfileContext);
  if (!value) {
    throw new Error("usePeerProfile must be used inside PeerProfileProvider");
  }
  return value;
}
