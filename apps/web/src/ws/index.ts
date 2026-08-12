import { WSClient } from "./WSClient";

let client: WSClient | null = null;

export const getWSClient = async () => {
  if (!client) {
    client = new WSClient();
    await client.init();
  }
  await client.connect();
  return client;
};

export const closeWSClient = () => {
  if (client) {
    client.close();
    client = null;
  }
};
