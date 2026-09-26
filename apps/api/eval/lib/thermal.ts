import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

/**
 * Thermal guard for local GPU work on the Linux box (one water loop cools
 * the CPU and GPU; long GPU runs have pushed the CPU to 94-98 C). Checked
 * before every local model call:
 *
 *   pause   CPU >= 85 C or GPU >= 75 C, or the CPU's recent average keeps
 *           rising past 80 C; resume at CPU <= 70 C and GPU <= 60 C
 *   abort   CPU >= 92 C
 *
 * One call at a time; peaks and pauses are reported.
 */

export const LIMITS = { cpuPause: 85, gpuPause: 75, cpuResume: 70, gpuResume: 60, cpuAbort: 92, cpuTrend: 80 };

function cpuZone(): string | null {
  const base = "/sys/class/thermal";
  for (const z of readdirSync(base)) {
    try {
      if (readFileSync(`${base}/${z}/type`, "utf8").trim() === "x86_pkg_temp") return `${base}/${z}/temp`;
    } catch {
      /* not a zone */
    }
  }
  return null;
}

export class ThermalGuard {
  private zone = cpuZone();
  private recent: number[] = [];
  peakCpu = 0;
  peakGpu = 0;
  pauses = 0;
  pausedSeconds = 0;

  read(): { cpu: number; gpu: number } {
    const cpu = this.zone ? Number(readFileSync(this.zone, "utf8")) / 1000 : NaN;
    let gpu = NaN;
    try {
      gpu = Number(execFileSync("nvidia-smi", ["--query-gpu=temperature.gpu", "--format=csv,noheader,nounits"], { encoding: "utf8" }).trim());
    } catch {
      /* no GPU reading: rely on the CPU */
    }
    this.peakCpu = Math.max(this.peakCpu, cpu || 0);
    this.peakGpu = Math.max(this.peakGpu, gpu || 0);
    this.recent = [...this.recent.slice(-9), cpu];
    return { cpu, gpu };
  }

  private rising(): boolean {
    if (this.recent.length < 10) return false;
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const older = avg(this.recent.slice(0, 5));
    const newer = avg(this.recent.slice(5));
    return newer > older + 2 && newer >= LIMITS.cpuTrend;
  }

  /** Wait until it is safe to run the next call. Throws if the CPU is at the abort limit. */
  async beforeCall(log: (line: string) => void = console.log): Promise<void> {
    let t = this.read();
    if (t.cpu >= LIMITS.cpuAbort) throw new Error(`Thermal abort: CPU at ${t.cpu} C`);
    if (t.cpu < LIMITS.cpuPause && !(t.gpu >= LIMITS.gpuPause) && !this.rising()) return;
    this.pauses++;
    log(`[thermal] pausing: CPU ${t.cpu} C, GPU ${t.gpu} C`);
    const started = Date.now();
    while (t.cpu > LIMITS.cpuResume || t.gpu > LIMITS.gpuResume) {
      await new Promise((r) => setTimeout(r, 15_000));
      t = this.read();
      if (t.cpu >= LIMITS.cpuAbort) throw new Error(`Thermal abort: CPU at ${t.cpu} C`);
    }
    this.recent = [];
    this.pausedSeconds += Math.round((Date.now() - started) / 1000);
    log(`[thermal] resuming: CPU ${t.cpu} C, GPU ${t.gpu} C`);
  }

  summary(): string {
    return `peak CPU ${this.peakCpu} C, peak GPU ${this.peakGpu} C, ${this.pauses} pause(s), ${this.pausedSeconds}s paused`;
  }
}
