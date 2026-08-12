export type ConversationMessageSyncTask = {
  conversation_id: string;
  client_conversation_id: string;
  last_sequence: number;
  server_sequence: number;
  sync_mode?: "delta" | "tail";
};
