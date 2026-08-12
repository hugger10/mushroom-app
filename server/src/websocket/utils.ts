export function elapsedMs(startTime: bigint) {
  return Number(process.hrtime.bigint() - startTime) / 1_000_000;
}
