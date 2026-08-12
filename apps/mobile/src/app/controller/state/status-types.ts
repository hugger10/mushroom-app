/**
 * Global status message routed through the mobile app's single status channel.
 *
 * Background:
 * - The mobile app exposes a single `state.status` value that the root `<Toast>`
 *   component subscribes to. Every action that wants to surface progress /
 *   success / failure feedback calls `state.setStatus("...")` and the Toast
 *   pops at the bottom of the screen for ~2s.
 * - Historically `status` was a bare `string`, which meant **every** call was
 *   user-facing. That produced noise like "M6 已运行在 React Native 原生宿主上"
 *   on cold start and "账号资料、设备与安全动态已刷新" every time the user
 *   tapped into the "Me" tab (which silently refreshes account data in the
 *   background).
 *
 * Design:
 * - `level` separates user-facing notifications from background bookkeeping.
 *   The Toast renders ONLY `user`-level messages, swallows `silent`, and
 *   forwards `debug` to the shared logger (only under `__DEV__`).
 * - `ts` is a monotonically increasing timestamp so that identical text fired
 *   twice in a row still re-triggers the Toast effect (previously
 *   `useEffect`'s string-equality dep would swallow the second call).
 * - `setStatus(text, level = "user")` keeps the default behavior so the 60+
 *   existing call sites stay untouched; only the few background-noise sites
 *   need to opt into `"silent"`.
 */
export type StatusLevel = "user" | "silent" | "debug";

export type StatusMessage = {
  text: string;
  level: StatusLevel;
  /**
   * Monotonically increasing change token. Despite the name, this is NOT a
   * wall-clock timestamp — it's a process-local sequence number used as the
   * dependency for Toast's `useEffect`. We avoid `Date.now()` because two
   * `setStatus` calls within the same millisecond would collide and the
   * effect (deps: `[message.ts]`) would swallow the second one, breaking the
   * "identical text should still re-trigger the toast" contract.
   */
  ts: number;
};

let statusSequence = 0;

export function createStatusMessage(
  text: string,
  level: StatusLevel = "user"
): StatusMessage {
  return { text, level, ts: ++statusSequence };
}
