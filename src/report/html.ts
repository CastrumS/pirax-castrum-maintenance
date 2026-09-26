import { isFormsReport, type AnyRunReport, type FormResult, type FormsPageResult, type FormsRunReport, type PageResult, type ViewportResult } from "./model.ts";
import { viewportNames } from "./manifest.ts";

export const escapeHtml = (value: unknown): string => String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
export type ResultStatus = "pass" | "warning" | "failure" | "blocked";
export function viewportStatus(v: ViewportResult): ResultStatus {
  if (v.capture.state === "blocked") return "blocked";
  if (v.capture.state === "error" || ["changed", "missing-baseline", "error"].includes(v.visual.state) || v.health.some(h => h.severity === "failure")) return "failure";
  return v.warnings.length || v.health.length ? "warning" : "pass";
}
export function aggregateStatus(states: ResultStatus[]): ResultStatus {
  return states.includes("failure") ? "failure" : states.includes("blocked") ? "blocked" : states.includes("warning") ? "warning" : "pass";
}
/** Rejected/failed forms fail; spam, not-verified and unsupported are warnings, never passes. */
export const formStatus = (f: FormResult): ResultStatus => f.outcome === "delivered" ? "pass" : ["failed", "rejected"].includes(f.outcome) ? "failure" : "warning";
export const pageStatus = (page: PageResult | FormsPageResult): ResultStatus => aggregateStatus([...("viewports" in page ? Object.values(page.viewports).map(viewportStatus) : []), ...(page.forms ?? []).map(formStatus)]);
export const reportStatus = (report: AnyRunReport): ResultStatus => aggregateStatus(report.sites.flatMap(s => s.pages.map(pageStatus)));

const head = (title: string, runId: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${title} ${escapeHtml(runId)}</title><style>
body{font:16px/1.5 system-ui,sans-serif;margin:24px;color:#172033;background:#f5f7fb}h1,h2,h3{line-height:1.2}table{width:100%;border-collapse:collapse;background:white;margin-bottom:32px}th,td{border:1px solid #cbd2dd;padding:12px;text-align:left;vertical-align:top}th{background:#e8edf6}figure{margin:0;min-width:0}figcaption{font-weight:bold}img{max-width:100%;height:auto;border:1px solid #abb7c9}.panels{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.failure,.blocked{color:#a01326}.warning{color:#795100}.pass{color:#116034}p,li{overflow-wrap:anywhere}ul{padding-left:20px}.details{min-width:230px}small{color:#46516a}@media(max-width:800px){body{margin:10px}.panels{grid-template-columns:1fr}table{display:block;overflow-x:auto}}
</style></head>`;

/** Forms-only report: per-page form outcomes, no image panels or visual claims. */
function renderForms(report: FormsRunReport): string {
  const e = escapeHtml;
  return `${head("Form check", report.runId)}<body><h1>Form check</h1><p>Run ${e(report.runId)} · <strong class="${reportStatus(report)}">${reportStatus(report)}</strong></p>${report.sites.map(site =>
    `<section><h2>${e(site.slug)} — ${aggregateStatus(site.pages.map(pageStatus))}</h2><p>${e(site.url)}</p>${site.pages.map(page =>
      `<h3>${e(page.path)} — ${pageStatus(page)}</h3>${page.forms.length ? `<table><thead><tr><th>Outcome</th><th>Plugin</th><th>Form</th><th>Detail</th></tr></thead><tbody>${page.forms.map(f =>
        `<tr><td class="${formStatus(f)}"><strong>${e(f.outcome)}</strong></td><td>${e(f.plugin)}</td><td>${e(f.selector)}</td><td>${e(f.detail)}</td></tr>`).join("")}</tbody></table>` : "<p>No forms found.</p>"}`).join("")}</section>`).join("")}<p><small>Desktop 1440 × 900 form pass only; no screenshots or visual comparison. Failed/rejected forms fail the run; spam, not-verified and unsupported are warnings.</small></p></body></html>`;
}

/** Pure renderer: only caller-supplied PNG bytes become image sources. No remote URLs or scripts. */
export function renderHtml(report: AnyRunReport, images: ReadonlyMap<string, Uint8Array>): string {
  if (isFormsReport(report)) return renderForms(report);
  const e = escapeHtml;
  const forms = report.sites.some(s => s.pages.some(p => p.forms !== undefined));
  const dims = (d: ViewportResult["visual"]["actual"]) => d ? `${d.width} × ${d.height}` : "unavailable";
  const picture = (label: string, path?: string) => {
    const bytes = path ? images.get(path) : undefined;
    return `<figure><figcaption>${label}</figcaption>${bytes ? `<img alt="${label}" src="data:image/png;base64,${Buffer.from(bytes).toString("base64")}">` : "<p>Unavailable</p>"}</figure>`;
  };
  return `${head("Site check", report.runId)}<body><h1>Site check</h1><p>Run ${e(report.runId)} · <strong class="${reportStatus(report)}">${reportStatus(report)}</strong></p>${report.sites.map(site => {
    const siteState = aggregateStatus(site.pages.map(pageStatus));
    return `<section><h2>${e(site.slug)} — ${siteState}</h2><p>${e(site.url)}</p>${site.pages.map(page => {
      const pageState = pageStatus(page);
      return `<h3>${e(page.path)} — ${pageState}</h3><table><thead><tr><th>Viewport and findings</th><th>Images</th>${forms ? "<th>Forms</th>" : ""}</tr></thead><tbody>${viewportNames.map((name, i) => {
        const v = page.viewports[name];
        return `<tr><td class="details"><strong>${name} · <span class="${viewportStatus(v)}">${viewportStatus(v)}</span></strong><p>Capture: ${e(v.capture.state)}${v.capture.detail ? ` — ${e(v.capture.detail)}` : ""}</p><p>Visual: ${e(v.visual.state)}${v.visual.detail ? ` — ${e(v.visual.detail)}` : ""}</p><p>Baseline: ${dims(v.visual.baseline)}<br>Actual: ${dims(v.visual.actual)}<br>Diff ratio: ${v.visual.ratio ?? "unavailable"}<br>Allowance: ${v.visual.allowance}</p><ul>${v.health.map(h => `<li class="${h.severity}">${e(h.severity)} · ${e(h.kind)}: ${e(h.detail)}</li>`).join("")}${v.warnings.map(w => `<li class="warning">warning: ${e(w)}</li>`).join("")}</ul></td><td><div class="panels">${picture("Baseline", v.artifacts.baselinePng)}${picture("Actual", v.artifacts.actualPng)}${picture("Diff", v.artifacts.diffPng)}</div></td>${forms && i === 0 ? `<td rowspan="2">${page.forms?.map(f => `<p><strong>${e(f.outcome)}</strong><br>${e(f.plugin)} · ${e(f.selector)}<br>${e(f.detail)}</p>`).join("") || "—"}</td>` : ""}</tr>`;
      }).join("")}</tbody></table>`;
    }).join("")}</section>`;
  }).join("")}<p><small>Approval accepts images and baseline-relative console/request findings. HTTP failures, critical errors and mixed content remain failures.</small></p></body></html>`;
}
