export type RunAction = (
  nextStatus: string,
  action: () => Promise<unknown>,
  doneStatus: string
) => Promise<void>;
