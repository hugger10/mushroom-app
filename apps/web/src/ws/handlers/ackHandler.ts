import type { AckMessage } from "../types";
import log from "@/utils/log";

export function handleAckMessage(message: AckMessage) {
  log.info("Ack received", message.client_message_id);
}
