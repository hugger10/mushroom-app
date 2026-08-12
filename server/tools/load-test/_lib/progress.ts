/**
 * 进度打印（仅 console.log，不引入额外依赖）。
 *   - 每 N 条或每 1s 打印一次：done/total | rate msg/s | eta
 *   - finish() 打印总耗时与平均速率
 */

export class ProgressLogger {
  private startedAt = Date.now();
  private lastPrintAt = 0;
  private lastDone = 0;
  private done = 0;
  private readonly total: number;
  private readonly label: string;
  private readonly stepEvery: number;

  constructor(label: string, total: number, stepEvery = 200) {
    this.label = label;
    this.total = total;
    this.stepEvery = Math.max(1, stepEvery);
  }

  begin() {
    this.startedAt = Date.now();
    this.lastPrintAt = this.startedAt;
    console.log(
      `[${this.label}] start total=${this.total} startedAt=${new Date(this.startedAt).toISOString()}`
    );
  }

  tick(delta = 1) {
    this.done += delta;
    const now = Date.now();
    const enoughTime = now - this.lastPrintAt >= 1000;
    const enoughCount = this.done - this.lastDone >= this.stepEvery;
    if (!enoughTime && !enoughCount && this.done < this.total) return;

    const elapsed = (now - this.startedAt) / 1000;
    const overallRate = elapsed > 0 ? this.done / elapsed : 0;
    const recentElapsed = (now - this.lastPrintAt) / 1000;
    const recentRate =
      recentElapsed > 0 ? (this.done - this.lastDone) / recentElapsed : 0;
    const remaining = Math.max(0, this.total - this.done);
    const eta = overallRate > 0 ? Math.round(remaining / overallRate) : -1;
    console.log(
      `[${this.label}] ${this.done}/${this.total} ` +
        `| rate=${recentRate.toFixed(0)}/s avg=${overallRate.toFixed(0)}/s ` +
        `| eta=${eta}s`
    );
    this.lastPrintAt = now;
    this.lastDone = this.done;
  }

  finish(extra: Record<string, unknown> = {}) {
    const elapsedMs = Date.now() - this.startedAt;
    const rate = elapsedMs > 0 ? Math.round((this.done * 1000) / elapsedMs) : 0;
    console.log(
      `[${this.label}] done=${this.done}/${this.total} elapsed=${elapsedMs}ms rate=${rate}/s`
    );
    console.log(
      JSON.stringify(
        {
          scenario: this.label,
          done: this.done,
          total: this.total,
          elapsed_ms: elapsedMs,
          rate_per_sec: rate,
          ...extra
        },
        null,
        2
      )
    );
  }
}
