import { useState } from "react";
import type { UserSearchResult } from "@mushroom/shared";

export function useGroupState() {
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [groupDescriptionDraft, setGroupDescriptionDraft] = useState("");
  const [groupAnnouncementDraft, setGroupAnnouncementDraft] = useState("");
  const [groupMuteAll, setGroupMuteAll] = useState(false);
  const [groupInvitePermission, setGroupInvitePermission] = useState<
    "all_members" | "admins_only"
  >("all_members");
  const [groupProfileEditPermission, setGroupProfileEditPermission] = useState<
    "admins" | "owner_only"
  >("admins");
  const [selectedAddMemberIds, setSelectedAddMemberIds] = useState<number[]>(
    []
  );
  const [selectedStrangerProfiles, setSelectedStrangerProfiles] = useState<
    UserSearchResult[]
  >([]);

  return {
    groupNameDraft,
    setGroupNameDraft,
    groupDescriptionDraft,
    setGroupDescriptionDraft,
    groupAnnouncementDraft,
    setGroupAnnouncementDraft,
    groupMuteAll,
    setGroupMuteAll,
    groupInvitePermission,
    setGroupInvitePermission,
    groupProfileEditPermission,
    setGroupProfileEditPermission,
    selectedAddMemberIds,
    setSelectedAddMemberIds,
    selectedStrangerProfiles,
    setSelectedStrangerProfiles
  };
}
