import { randomInt } from "node:crypto";
import type { Locator, Page } from "playwright";
import type { FormConfig } from "./config.ts";
import { formLocator, sameForm, type FormDescriptor } from "./detect.ts";

export const newSubmissionId = (): string => Array.from({ length: 12 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)]).join("");
export type SubmissionRoute = 'postback' | 'gravity-ajax' | 'fluent-ajax';
export type PreparedForm = { state: "prepared"; descriptor: FormDescriptor; id: string; marker: string; markerIndex: number; markerName: string; submitIndex: number; action: string; route: SubmissionRoute; validation: string };
export type FillResult = PreparedForm | { state: "unsupported" | "not-verified"; detail: string };
type Control = { index: number; kind: string; name: string; value: string };
type Inspection = { state: "ready"; controls: Control[]; markerIndex: number; markerName: string; submitIndex: number; action: string; route: SubmissionRoute; signature: string } | Exclude<FillResult, PreparedForm>;

/** No typing here: inspect the entire form, including hidden uploads and native constraints. */
export async function inspectForm(form: Locator, marker?: string): Promise<Inspection> {
  return form.evaluate((node, marker): Inspection => {
    const f = node as HTMLFormElement;
    const unsupported = (detail: string): Inspection => ({ state: "unsupported", detail });
    const all = [...f.elements] as (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement)[];
    const visible = (e: Element) => e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && !!e.getClientRects().length;
    const writable = (e: typeof all[number]) => visible(e) && !e.matches(":disabled") && !("readOnly" in e && e.readOnly) && !!e.name && !e.closest('.gform_validation_container,[aria-hidden="true"],.ff-el-honeypot');
    if (f.querySelector('input[type="file"]') || all.some(e => e.type === "file")) return unsupported("File upload controls are unsupported (including hidden uploads).");
    if (f.matches('.frm-fluent-form') && f.querySelector('.h-captcha,.cf-turnstile,[name="h-captcha-response"],[name="cf-turnstile-response"],[data-hcaptcha-sitekey],[data-turnstile-sitekey]')) return { state: "not-verified", detail: "Fluent Forms hCaptcha/Turnstile is not supported; delivery not verified." };
    if (f.querySelector('input[type=password],input[type=image],.gform_page,.ff-step,.ff-el-payment-element,.ginput_container_creditcard,.gfield--type-creditcard,.gfield--type-post_title,[data-payment],[autocomplete^="cc-"],[class*="payment" i],[class*="stripe" i],[class*="paypal" i],.gfield_price,.gfield--type-product,.gfield--type-total,[contenteditable="true"],[role=combobox],.select2-container,.choices,.ff-el-repeater,.gfield_list,.ff-signature')) return unsupported("Custom, multi-step, payment, password or ambiguous flow is unsupported.");
    if (all.some(e => !f.contains(e))) return unsupported("Externally associated form controls are unsupported.");
    const target = f.getAttribute("target") ?? "";
    if (target && target !== "_self" && !/^gform_ajax_frame_\d+$/.test(target)) return unsupported("External browsing target is unsupported.");
    let route: SubmissionRoute = 'postback';
    let action = new URL(f.getAttribute("action") || location.href, document.baseURI);
    if (action.origin !== location.origin || !/^https?:$/.test(action.protocol) || action.username || action.password) return unsupported("External form action is unsupported.");
    if (f.matches('.frm-fluent-form')) {
      if (!f.parentElement || f.parentElement === document.body || f.parentElement.querySelectorAll('form').length !== 1) return unsupported('Fluent Forms instance has no unambiguous message container.');
      route = 'fluent-ajax';
      // Audited FF 6.2.14 reads fluentFormVars/ajaxUrl or this instance's localized config.
      const vars = window as unknown as Record<string, { ajaxUrl?: string } | undefined>;
      const instance = (f.getAttribute('data-form_instance') ?? '').replace(/[^a-zA-Z0-9_-]/g, '');
      action = new URL(vars.fluentFormVars?.ajaxUrl || vars[`fluent_form_${instance}`]?.ajaxUrl || '/wp-admin/admin-ajax.php', location.href);
      if (action.origin !== location.origin || action.username || action.password || !action.pathname.endsWith('/wp-admin/admin-ajax.php') || action.hash) return unsupported('Unaudited Fluent Forms AJAX action is unsupported.');
    }
    // GF's native route is the current document. FF routes through its own admin-ajax handler.
    if (!f.matches('.frm-fluent-form')) {
      if (f.method.toLowerCase() !== 'post' || action.pathname !== location.pathname || action.search !== location.search) return unsupported("Unaudited Gravity Forms action/method is unsupported.");
      const method = f.querySelector<HTMLInputElement>('[name="gform_submission_method"]')?.value ?? 'postback';
      if (!['postback', 'iframe', 'ajax'].includes(method)) return unsupported('Unaudited Gravity Forms submission mode.');
      if (method === 'ajax') {
        const config = (window as unknown as { gform_theme_config?: { common?: { form?: { ajax?: { ajaxurl?: string } } } } }).gform_theme_config;
        const url = config?.common?.form?.ajax?.ajaxurl;
        if (!url) return unsupported('Gravity Forms AJAX configuration is unavailable.');
        action = new URL(url, location.href); route = 'gravity-ajax';
        if (action.origin !== location.origin || action.username || action.password || !action.pathname.endsWith('/wp-admin/admin-ajax.php') || action.hash) return unsupported('Unaudited Gravity Forms AJAX action.');
      }
    }
    const submits = all.filter(e => (e instanceof HTMLButtonElement || e instanceof HTMLInputElement) && e.type === "submit" && visible(e) && !e.matches(":disabled"));
    if (submits.length !== 1 || submits[0]!.hasAttribute('formaction') || submits[0]!.hasAttribute('formmethod') || submits[0]!.hasAttribute('formtarget')) return unsupported("A single unambiguous native submit control is required.");
    if (f.closest('.gform_wrapper') && (all.some(e => e.name === 'gform_save' && e.value !== '' && e.value !== '0') || submits[0]!.hasAttribute('data-submission-type') && submits[0]!.getAttribute('data-submission-type') !== 'submit')) return unsupported('Gravity Forms draft/pagination submission controls are unsupported.');
    const eligible = all.filter(e => writable(e) && (e instanceof HTMLTextAreaElement || e instanceof HTMLInputElement && e.type === "text"));
    const candidate = eligible.find(e => e instanceof HTMLTextAreaElement) ?? eligible[0];
    if (!candidate) return unsupported("No writable visible textarea or plain text marker field.");
    if (all.filter(e => e.name === candidate.name).length !== 1) return unsupported('Ambiguous duplicate marker field name.');
    if (f.closest('.gform_wrapper') && !/^input_\d+(?:_\d+)?$/.test(candidate.name)) return unsupported("Marker control is not a native Gravity Forms input.");
    if (marker !== undefined) {
      const c = candidate as HTMLInputElement | HTMLTextAreaElement;
      const clone = c.cloneNode(true) as typeof c;
      clone.value = marker;
      if (c.maxLength >= 0 && marker.length > c.maxLength || c.minLength > marker.length || !clone.checkValidity()) return unsupported("The marker field cannot carry the intact marker (length/pattern/validation constraint).");
    }
    const controls: Control[] = [];
    const radios = new Set<string>();
    for (const [index, e] of all.entries()) {
      if (!writable(e) || e.type === 'hidden' || e.type === 'submit' || e.type === 'button' || e.type === 'reset') continue;
      if (e === candidate) { controls.push({ index, kind: "text", name: e.name, value: marker ?? "" }); continue; }
      if (e instanceof HTMLTextAreaElement) { controls.push({ index, kind: "text", name: e.name, value: "Pirax test message" }); continue; }
      if (e instanceof HTMLSelectElement) {
        if (e.multiple) return unsupported("Multi-select/custom choice flow is unsupported.");
        const option = [...e.options].find(o => !o.disabled && !o.parentElement?.matches('optgroup:disabled') && o.value);
        if (!option) return unsupported("No usable select option.");
        controls.push({ index, kind: "select", name: e.name, value: option.value }); continue;
      }
      if (!(e instanceof HTMLInputElement)) return unsupported("Unsupported form control.");
      if (e.type === 'radio') { if (radios.has(e.name)) continue; radios.add(e.name); controls.push({ index, kind: 'check', name: e.name, value: '' }); continue; }
      if (e.type === 'checkbox') { if (e.required) controls.push({ index, kind: 'check', name: e.name, value: '' }); continue; }
      const values: Record<string, string> = { text: "Pirax Test", email: "", tel: "+12025550123", url: "https://example.test", number: e.min || String(Math.min(e.max ? Math.floor(Number(e.max) / (Number(e.step) || 1)) * (Number(e.step) || 1) : Infinity, Number(e.step) || 1)), date: e.min || (e.max && e.max < "2026-01-15" ? e.max : "2026-01-15") };
      if (!(e.type in values)) return unsupported("Only basic text/email/tel/url/number/date and native choice controls are supported.");
      let value = values[e.type]!;
      if (e.type === 'text' || e.type === 'tel') { if (e.maxLength >= 0) value = value.slice(0, e.maxLength); if (e.minLength > value.length) value = value.padEnd(Math.min(e.minLength, 256), 'x'); }
      controls.push({ index, kind: e.type === 'email' ? 'email' : 'text', name: e.name, value });
    }
    return { state: "ready", controls, markerIndex: all.indexOf(candidate), markerName: candidate.name, submitIndex: all.indexOf(submits[0]!), action: action.href, route, signature: JSON.stringify(controls.map(c => [c.index, c.kind, c.name])) };
  }, marker);
}

export async function nativeValidation(form: Locator): Promise<string> {
  return form.evaluate(node => {
    const f = node as HTMLFormElement;
    const invalid = [...f.elements].filter((e): e is HTMLInputElement => 'willValidate' in e && (e as HTMLInputElement).willValidate && !(e as HTMLInputElement).validity.valid);
    return invalid.length ? invalid.map((e, i) => `Control ${i + 1}: ${e.validationMessage}`).join("; ") : "Native client validation passed.";
  });
}
/** Bounded conditional stabilization; unsupported before submission rather than guessing hidden/custom data. */
export async function fillForm(page: Page, descriptor: FormDescriptor, config: FormConfig, id: string): Promise<FillResult> {
  if (!/^[a-z0-9]{12}$/.test(id)) throw new TypeError("Invalid submission id.");
  if (descriptor.plugin === "unknown" || !descriptor.pluginId) return { state: "unsupported", detail: "Unknown or ambiguous form plugin identity." };
  if (!await sameForm(page, descriptor)) return { state: "unsupported", detail: "Form identity changed since discovery." };
  const form = formLocator(page, descriptor);
  const marker = `${config.token}-${id}`;
  let inspected = await inspectForm(form, marker);
  const filled = new Map<number, string>();
  for (let round = 0; round < 3; round++) {
    if (inspected.state !== "ready") return inspected;
    for (const c of inspected.controls) {
      const value = c.kind === "email" ? config.address : c.value;
      if (filled.get(c.index) === `${c.kind}:${value}`) continue;
      // Elements collection matches externally checked indices; do not modify hidden nonces/honeypots.
      const control = form.locator('input,textarea,select,button,fieldset,object,output').nth(c.index);
      if (c.kind === "check") await control.check();
      else if (c.kind === "select") await control.selectOption(value);
      else await control.fill(value);
      filled.set(c.index, `${c.kind}:${value}`);
    }
    await page.waitForTimeout(100);
    const next = await inspectForm(form, marker);
    if (next.state !== "ready") return next;
    if (next.signature === inspected.signature) {
      const prepared: PreparedForm = { state: "prepared", descriptor, id, marker, markerIndex: next.markerIndex, markerName: next.markerName, submitIndex: next.submitIndex, action: next.action, route: next.route, validation: await nativeValidation(form) };
      if (!await intactMarker(page, prepared)) return { state: "unsupported", detail: "Marker changed during filling; no submission." };
      return prepared;
    }
    inspected = next;
  }
  return { state: "unsupported", detail: "Conditional controls did not stabilize within three passes." };
}
export async function intactMarker(page: Page, prepared: PreparedForm): Promise<boolean> {
  return formLocator(page, prepared.descriptor).evaluate((node, p) => {
    const f = node as HTMLFormElement;
    const control = f.elements[p.markerIndex] as HTMLInputElement | HTMLTextAreaElement | undefined;
    return !!control && control.name === p.markerName && control.value === p.marker && !control.matches(':disabled') && !control.readOnly && control.checkVisibility() && new FormData(f).getAll(p.markerName).some(v => v === p.marker);
  }, prepared);
}
