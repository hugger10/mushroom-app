import { createMushroomApi } from "@mushroom/shared";
import { randomUUID } from "crypto";

const API_BASE_URL = (
  process.env.API_BASE_URL || "http://127.0.0.1:9100"
).replace(/\/$/, "");

let accessToken: string | null = null;

export function setToken(token: string | null) {
  accessToken = token;
}

export const httpClient = createMushroomApi({
  baseURL: API_BASE_URL,
  getAccessToken: () => accessToken,
  generateClientRequestId: () => randomUUID()
});
