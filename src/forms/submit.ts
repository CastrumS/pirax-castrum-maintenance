import { randomUUID } from "node:crypto";
import type { BrowserContext, Page, Request as BrowserRequest } from "playwright";
import { formLocator } from "./detect.ts";
import { inspectForm, intactMarker, nativeValidation, type PreparedForm } from "./fill.ts";
import { secretRedactor, type Redactor } from "./evidence.ts";

export type FormPolicy = { freeze(): void; arm(page: Page, prepared: PreparedForm): Promise<void>; disarm(): Promise<void>; submitted(): boolean; transportFailed(): boolean };
/** Installed before navigation. Frozen typing permits no outgoing request, including GET serialization.
 * One native browser submit may spend one same-origin, marker-bearing audited POST authorization. */
export async function installFormPolicy(context: BrowserContext): Promise<FormPolicy> {
  let frozen = false, allowed: PreparedForm | undefined, selectedPage: Page | undefined, spent = false, transportFailure = false;
  const key = `__pirax_${randomUUID().replaceAll('-', '')}`;
  await context.addInitScript(({ key }) => {
    let selected: { selector: string; marker: string; markerName: string } | undefined;
    const permitted = (form: HTMLFormElement) => {
      if (!selected) return false;
      const match = selected.selector.startsWith('form >> nth=') ? document.forms[Number(selected.selector.split('=')[1])] === form : form.matches(selected.selector);
      return match && new FormData(form).getAll(selected.markerName).some(v => v === selected!.marker);
    };
    Object.defineProperty(window, key, { value: (value: typeof selected) => { selected = value; } });
    window.addEventListener('submit', e => { if (!(e.target instanceof HTMLFormElement) || !permitted(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    const submit = HTMLFormElement.prototype.submit, requestSubmit = HTMLFormElement.prototype.requestSubmit;
    HTMLFormElement.prototype.submit = function() { if (permitted(this)) submit.call(this); };
    HTMLFormElement.prototype.requestSubmit = function(button) { if (permitted(this)) requestSubmit.call(this, button); };
  }, { key });
  await context.routeWebSocket('**/*', socket => socket.close({ code: 1008, reason: 'form safety policy' }));
  const approved = new WeakSet<BrowserRequest>();
  const readNavigations = new WeakSet<BrowserRequest>();
  const visitedFrames = new WeakSet<import('playwright').Frame>();
  context.on('requestfailed', r => { if (approved.has(r)) transportFailure = true; });
  context.on('response', r => { if (approved.has(r.request()) && r.status() >= 500) transportFailure = true; });
  await context.route('**/*', async route => {
    const r = route.request();
    const url = new URL(r.url());
    if (!frozen && r.method() === 'GET') {
      if (r.isNavigationRequest()) {
        const frame = r.frame();
        const redirect = r.redirectedFrom();
        // Initial document/iframe load and HTTP redirects only, never JS GET-form navigation/popups.
        if (frame.page() !== context.pages()[0] || visitedFrames.has(frame) && !(redirect && readNavigations.has(redirect))) return route.abort('blockedbyclient');
        visitedFrames.add(frame); readNavigations.add(r);
      }
      return route.continue();
    }
    if (allowed && selectedPage && r.method() === 'POST' && !spent && r.frame().page() === selectedPage && url.origin === new URL(allowed.action).origin) {
      try {
        const body = r.postDataBuffer();
        if (!body) return route.abort('blockedbyclient');
        const data = await new Request(r.url(), { method: 'POST', headers: { 'content-type': r.headers()['content-type'] ?? '' }, body: Uint8Array.from(body) }).formData();
        const p = allowed;
        const action = new URL(p.action);
        let valid = false;
        if (p.descriptor.plugin === 'gravity') {
          valid = url.pathname === action.pathname && url.search === action.search && data.getAll('gform_submit').length === 1 && data.get('gform_submit') === p.descriptor.pluginId && data.getAll(p.markerName).length === 1 && data.get(p.markerName) === p.marker;
          // GF save-and-continue skips field validation/helper classification entirely.
          if (data.getAll('gform_save').some(v => v !== '' && v !== '0')) valid = false;
          if (p.route === 'gravity-ajax') valid &&= data.getAll('action').length === 1 && data.get('action') === 'gform_submit_form' && data.getAll('form_id').length === 1 && data.get('form_id') === p.descriptor.pluginId;
        } else if (p.descriptor.plugin === 'fluent') {
          // FF 6.2.14 appends one timestamp cachebuster to its localized AJAX URL.
          const query = new URLSearchParams(url.search);
          const timestamps = query.getAll('t'); query.delete('t');
          const expected = new URLSearchParams(action.search); expected.delete('t');
          valid = url.pathname === action.pathname && query.toString() === expected.toString() && (timestamps.length === 0 || timestamps.length === 1 && /^\d{10,16}$/.test(timestamps[0]!)) && data.getAll('action').length === 1 && data.get('action') === 'fluentform_submit' && data.getAll('form_id').length === 1 && data.get('form_id') === p.descriptor.pluginId && data.getAll('data').length === 1 && new URLSearchParams(String(data.get('data') ?? '')).getAll(p.markerName).length === 1 && new URLSearchParams(String(data.get('data') ?? '')).get(p.markerName) === p.marker;
        }
        if (valid) { spent = true; approved.add(r); return route.continue(); }
      } catch { /* Unparseable or unfamiliar serialization is never authorized. */ }
    }
    // GF 3.1.2 lazily loads its DOMPurify chunk to render AJAX confirmation markup.
    // Permit only that exact audited script after the chosen POST; no query/field serialization,
    // images, fetches, arbitrary scripts or pre-submit requests regain GET authorization.
    if (allowed?.route === 'gravity-ajax' && spent && selectedPage && r.method() === 'GET' && r.resourceType() === 'script' &&
        r.frame().page() === selectedPage && url.origin === new URL(allowed.action).origin && !url.search &&
        url.pathname === '/wp-content/plugins/gravityforms/assets/js/dist/vendor-theme-dompurify.b0876f45cc06deeb8174.min.js') return route.continue();
    // Native GF POST may redirect, but never serialize a marker/fields via a GET route.
    const from = r.redirectedFrom();
    if (allowed && from && approved.has(from) && r.method() === 'GET' && url.origin === new URL(allowed.action).origin && !url.search) {
      approved.add(r); return route.continue();
    }
    return route.abort('blockedbyclient');
  });
  return {
    freeze() { frozen = true; },
    async arm(page, prepared) {
      frozen = true; allowed = prepared; selectedPage = page; spent = false; transportFailure = false;
      await page.evaluate(({ key, selector, marker, markerName }) => (window as unknown as Record<string, (v: unknown) => void>)[key]!({ selector, marker, markerName }), { key, selector: prepared.descriptor.selector, marker: prepared.marker, markerName: prepared.markerName });
    },
    async disarm() {
      allowed = undefined;
      if (selectedPage && !selectedPage.isClosed()) await selectedPage.evaluate(key => (window as unknown as Record<string, (v: unknown) => void>)[key]?.(undefined), key).catch(() => {});
    },
    submitted: () => spent,
    transportFailed: () => transportFailure,
  };
}

export type SubmissionResult = { state: 'confirmed' | 'rejected' | 'failed'; id: string; detail: string };
export type SubmitOptions = { timeoutMs?: number; redact?: Redactor };
/** Never infers delivery; only one new, form-associated native confirmation starts mailbox polling. */
export async function submitForm(page: Page, prepared: PreparedForm, policy: FormPolicy, options: SubmitOptions = {}): Promise<SubmissionResult> {
  const redact = options.redact ?? secretRedactor();
  const result = (state: SubmissionResult['state'], detail: string): SubmissionResult => ({ state, id: prepared.id, detail: redact(detail).slice(0, 2000) });
  const timeout = options.timeoutMs ?? 30_000;
  const form = formLocator(page, prepared.descriptor);
  try {
    const inspection = await inspectForm(form, prepared.marker);
    if (inspection.state !== 'ready' || inspection.markerIndex !== prepared.markerIndex || inspection.submitIndex !== prepared.submitIndex || inspection.route !== prepared.route || inspection.action !== prepared.action || !await intactMarker(page, prepared)) return result('failed', 'Marker/form changed before submission; no submission.');
    const validation = await nativeValidation(form);
    if (validation !== 'Native client validation passed.') return result('rejected', validation);
    const id = prepared.descriptor.pluginId!;
    const gravity = prepared.descriptor.plugin === 'gravity';
    const scopeKey = `pirax-scope-${randomUUID()}`;
    const staleKey = `pirax-stale-${randomUUID()}`;
    // FF appends its success/error as a sibling within the instance wrapper. Never page-global.
    const ffScope = await form.evaluate((f, key) => {
      const parent = f.parentElement;
      if (!parent || parent === document.body || parent.querySelectorAll('form').length !== 1) return false;
      parent.setAttribute('data-pirax-scope', key); return true;
    }, scopeKey);
    if (!gravity && !ffScope) return result('failed', 'Fluent Forms instance has no unambiguous message container.');
    const success = gravity ? `#gform_confirmation_message_${id}` : `[data-pirax-scope="${scopeKey}"] .ff-message-success`;
    const error = gravity ? `#gform_${id}_validation_container, #gform_wrapper_${id} .validation_message, #gform_wrapper_${id} .pirax-form-test-rejected` : `[data-pirax-scope="${scopeKey}"] .ff-message-error, [data-pirax-scope="${scopeKey}"] .error.text-danger, [data-pirax-scope="${scopeKey}"] .ff-el-is-error .text-danger`;
    // An existing success is ambiguous even if a later page reload repeats the same markup.
    const oldSuccess = await page.locator(success).count() > 0;
    await page.locator(error).evaluateAll((es, key) => es.forEach(e => e.setAttribute('data-pirax-stale', key)), staleKey);
    if (oldSuccess) return result('failed', 'Pre-existing form confirmation is not proof of this attempt; no submission.');
    await policy.arm(page, prepared);
    // Final integrity check immediately before the one actual browser click. Route also checks bytes.
    if (!await intactMarker(page, prepared)) return result('failed', 'Marker changed immediately before submit; no submission.');
    const deadline = Date.now() + timeout;
    await form.locator('input,textarea,select,button,fieldset,object,output').nth(prepared.submitIndex).click({ timeout, noWaitAfter: true });
    while (Date.now() < deadline) {
      if (policy.transportFailed()) return result('failed', 'Submission transport failed; not retried.');
      try {
        const observed = await page.evaluate(({ success, error, staleKey, selector, ordinal }) => {
          const visible = (e: Element) => e.checkVisibility() && !!e.getClientRects().length;
          const bad = [...document.querySelectorAll(error)].filter(e => visible(e) && e.getAttribute('data-pirax-stale') !== staleKey).map(e => e.textContent?.trim()).filter(Boolean);
          const good = [...document.querySelectorAll(success)].filter(visible).map(e => e.textContent?.trim()).filter(Boolean);
          const form = selector.startsWith('form >> nth=') ? document.forms[ordinal] : document.querySelector<HTMLFormElement>(selector);
          const invalid = form ? [...form.elements].filter((e): e is HTMLInputElement => 'willValidate' in e && (e as HTMLInputElement).willValidate && !(e as HTMLInputElement).validity.valid).map(e => e.validationMessage).join('; ') : '';
          return { bad: bad.join('; '), good: good.join('; '), invalid };
        }, { success, error, staleKey, selector: prepared.descriptor.selector, ordinal: prepared.descriptor.ordinal });
        if (observed.bad) return result('rejected', `Plugin refused submission: ${observed.bad}`);
        if (observed.good && policy.submitted()) return result('confirmed', `Native ${gravity ? 'Gravity Forms' : 'Fluent Forms'} confirmation: ${observed.good}`);
        if (observed.invalid) return result('rejected', observed.invalid);
      } catch { /* Execution contexts can change during the one native navigation. */ }
      await page.waitForTimeout(50);
    }
    return result('failed', 'No new form-associated confirmation before timeout; not retried.');
  } catch { return result('failed', 'Browser/submission operation failed; not retried.'); }
  finally { await policy.disarm(); }
}
