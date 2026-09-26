import { createHash } from "node:crypto";
import type { Locator, Page } from "playwright";
import type { FormResult } from "../report/model.ts";

export type FormDescriptor = {
  selector: string;
  plugin: FormResult["plugin"];
  ordinal: number;
  pluginId: string | null;
  /** Structural digest, never values/nonces. Checked again in each fresh context. */
  identity: string;
};
/** Actual forms only, one traversal so overlapping adapter selectors cannot duplicate a form. */
export async function detectForms(page: Page): Promise<FormDescriptor[]> {
  const forms = await page.locator("form").evaluateAll(elements => elements.map((el, ordinal) => {
    const f = el as HTMLFormElement;
    const gravity = !!f.closest(".gform_wrapper");
    const fluent = f.matches("form.frm-fluent-form");
    const plugin = gravity === fluent ? "unknown" : gravity ? "gravity" : "fluent";
    const id = plugin === "gravity" ? /^gform_([1-9]\d*)$/.exec(f.id)?.[1] : plugin === "fluent" ? f.getAttribute("data-form_id") : null;
    const pluginId = id && /^[1-9]\d*$/.test(id) ? id : null;
    const uniqueId = f.id && [...document.querySelectorAll("[id]")].filter(e => e.id === f.id).length === 1;
    const selector = uniqueId && /^(?:gform_|fluentform_)[1-9]\d*$/.test(f.id) ? `#${f.id}` : `form >> nth=${ordinal}`;
    return { ordinal, selector, plugin, pluginId, shape: JSON.stringify([f.id, f.className, f.getAttribute("action"), f.method, [...f.elements].map(e => [e.tagName, e.getAttribute("type"), e.getAttribute("name")])]) };
  }));
  return forms.map(({ shape, ...f }) => ({ ...f, plugin: f.plugin as FormResult["plugin"], identity: createHash("sha256").update(shape).digest("hex") }));
}
export const formLocator = (page: Page, descriptor: FormDescriptor): Locator => page.locator(descriptor.selector);
export async function sameForm(page: Page, descriptor: FormDescriptor): Promise<boolean> {
  const current = (await detectForms(page)).find(f => f.selector === descriptor.selector);
  return !!current && current.identity === descriptor.identity && current.plugin === descriptor.plugin && current.pluginId === descriptor.pluginId;
}
