// This module is the web-side logger. Downstream code should import the
// default export here instead of touching `console` directly so log scopes,
// levels and future transports apply uniformly.
//
// When running inside Electron, an additional IPC transport is attached
// so that renderer-side logs land in the same daily file as main-process
// logs. In a pure browser environment only the console transport is used.
import {
  createLogger,
  createConsoleTransport,
  type Logger
} from "@mushroom/shared/logger";
import { createElectronIpcTransport } from "./log-electron-transport";

const level = import.meta.env.MODE === "production" ? "info" : "debug";

const transports = [createConsoleTransport()];
const electronTransport = createElectronIpcTransport();
if (electronTransport) {
  transports.push(electronTransport);
}

const log: Logger = createLogger({
  level,
  transports
});

export default log;
