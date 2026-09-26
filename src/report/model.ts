import type { CaptureState, ViewportName } from "../capture.ts";
import type { Dimensions } from "../compare.ts";
import type { HealthFinding } from "../health.ts";

/** Filled by the form-check leaf; rendered as a Forms column when any page has it. */
export type FormResult = {
  selector: string;
  plugin: "gravity" | "fluent" | "unknown";
  outcome: "delivered" | "delivered-spam" | "not-verified" | "rejected" | "unsupported" | "failed";
  detail: string;
};

/** Visual comparison outcome, independent of capture state and health. */
export type VisualState = "same" | "changed" | "missing-baseline" | "error" | "not-compared";

export type ViewportResult = {
  viewport: ViewportName;
  /** `detail` explains blocked/error captures. */
  capture: { state: CaptureState; detail: string | null };
  visual: {
    state: VisualState;
    detail: string | null;
    baseline: Dimensions | null;
    actual: Dimensions | null;
    /** Measured diff ratio; null when not compared or dimensions differ. */
    ratio: number | null;
    /** The site's `max_diff_pixel_ratio`. */
    allowance: number;
  };
  health: HealthFinding[];
  /** Readiness limits, unmatched masks and read-only policy aborts. */
  warnings: string[];
  /** Paths relative to the run directory, present when the file exists. */
  artifacts: {
    actualPng?: string;
    actualHealth?: string;
    baselinePng?: string;
    baselineHealth?: string;
    diffPng?: string;
    trace?: string;
  };
};

export type PageResult = {
  path: string;
  pageKey: string;
  viewports: Record<ViewportName, ViewportResult>;
  forms?: FormResult[];
};

export type SiteResult = { slug: string; url: string; pages: PageResult[] };

export type RunReport = { runId: string; sites: SiteResult[] };

/** `reports/<runId>/manifest.json`, uploaded last as the completion marker. */
export type Manifest = { schemaVersion: 1; command: "check"; report: RunReport };

/** Forms-only run: desktop form results per listed page, with no visual capture or baseline evidence. */
export type FormsPageResult = { path: string; pageKey: string; forms: FormResult[] };
export type FormsSiteResult = { slug: string; url: string; pages: FormsPageResult[] };
export type FormsRunReport = { mode: "forms"; runId: string; sites: FormsSiteResult[] };
export type FormsManifest = { schemaVersion: 1; command: "forms"; report: FormsRunReport };

export type AnyRunReport = RunReport | FormsRunReport;
export type PublishedManifest = Manifest | FormsManifest;
export const isFormsReport = (report: AnyRunReport): report is FormsRunReport => "mode" in report && report.mode === "forms";
