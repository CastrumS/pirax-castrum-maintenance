// A helper built for a deployment that does not audit Gravity Forms, on a site where Gravity Forms is active
// (plan D12, N5; AC3, AC4): the synthetic-identity helper is staged with the selected pins minus gf, so its
// AUDITED_VERSIONS holds 'gf' => null. A marked GF browser submission is refused as awaiting audit with no mail
// and no entry, and a marked FF submission is still accepted and redirected. Registered only when the selected
// deployment audits gf, because only then does the harness boot Gravity Forms.
// bun --env-file=/home/rudi/Work/Privatni/Pirax-Castrum-Maintenance/.env test test/plugin/audited-stack.test.ts
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserContext, Page } from "playwright";
import { withoutSigningKey } from "../../scripts/build-plugin";
import { fixtureConfig, fixtureKeys } from "../fixtures/deployment";
import { AUDITS_GF, GF_VERSION, startHarness, type Harness, type MailRecord } from "./harness";
import { SLUG, stageHelper, startReleaseFixture, type ReleaseFixture, type StagedHelper } from "./update-fixture";
import { HELPER_VERSION, PINS } from "./version-fixtures";

setDefaultTimeout(180_000);

const REDIRECT = "form-tests+pirax@operator.test";
const ID = "abc123";
const AWAITING = `${fixtureConfig("").forms.refusalPrefix} awaiting audit of Gravity Forms ${GF_VERSION}`;

if (AUDITS_GF)
  describe("helper built without gf on a Gravity Forms site", () => {
    let h: Harness;
    let fixture: ReleaseFixture;
    let out: string;
    let staged: StagedHelper;
    let visitor: { context: BrowserContext; page: Page };
    let marker: string;

    const setOptions = (options: Record<string, string>) =>
      h.php(`foreach (json_decode('${JSON.stringify(options)}', true) as $name => $value) { update_option($name, $value, false); } return true;`);

    const gfTokenValues = () =>
      h.php<number>(`global $wpdb; return (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}gf_entry_meta WHERE meta_value LIKE %s", '%' . $wpdb->esc_like(get_option('pirax_form_test_token')) . '%'));`);

    beforeAll(async () => {
      [h, fixture] = await Promise.all([startHarness({ run: "audited-stack" }), startReleaseFixture()]);
      marker = `${h.token}-${ID}`;
      out = await mkdtemp(join(tmpdir(), "audited-stack-zips-"));
      const { gf: _gf, ...withoutGf } = PINS;
      staged = await stageHelper({ version: HELPER_VERSION, publicKey: fixtureKeys().publicKey, root: fixture.root, audited: withoutGf, out });

      const admin = await h.browser("audited-stack-install");
      await admin.page.goto(`${h.url}/wp-login.php`);
      await admin.page.fill("#user_login", h.users.admin.login);
      await admin.page.fill("#user_pass", h.users.admin.password);
      await admin.page.click("#wp-submit");
      await admin.page.waitForURL(/\/wp-admin\/?/);
      await h.uploadPlugin(admin.page, staged.zip);
      await h.closeBrowser(admin.context);
      await setOptions({ pirax_form_test_token: h.token, pirax_form_test_redirect: REDIRECT });

      visitor = await h.browser("audited-stack-visitor");
    }, 600_000);

    afterAll(async () => {
      if (visitor) await h.closeBrowser(visitor.context).catch(() => {});
      if (h) {
        await h.saveEvidence().catch(() => {});
        await h.stop();
      }
      await fixture?.stop();
      if (out) await rm(out, { recursive: true, force: true });
    }, 120_000);

    test("the staged helper declares gf as unaudited (null)", async () => {
      const compatibility = await Bun.$`unzip -p ${staged.zip} ${`${SLUG}/includes/compatibility.php`}`.env(withoutSigningKey()).text();
      expect(compatibility).toMatch(/^\s*'gf'\s*=>\s*null,$/m);
    });

    test("AC3: a marked GF submission is refused as awaiting audit of Gravity Forms, with no mail and no entry", async () => {
      const mailBefore = (await h.mail()).length;
      const entriesBefore = (await h.entries()).gf;
      const tokenValues = await gfTokenValues();
      const formId = h.fixtures.gf!;
      const { page } = visitor;
      await page.goto(h.fixtures.page);
      const form = page.locator(`#gform_${formId}`);
      for (const [name, value] of Object.entries({ input_1: "Pirax Visitor", input_2: "visitor@example.test", input_3: `Pirax check ${marker}` }))
        await form.locator(`[name='${name}']`).fill(value);
      await form.locator("[type=submit]").click();
      await page.locator(`#gform_confirmation_message_${formId}, #gform_${formId}_validation_container`).first().waitFor();
      const confirmed = (await page.locator(`#gform_confirmation_message_${formId}`).count()) > 0;
      const text = await page.locator(confirmed ? `#gform_confirmation_message_${formId}` : `#gform_wrapper_${formId}`).innerText();
      await h.drainQueues();
      const mailAfter = (await h.mail()).length;
      const entriesAfter = (await h.entries()).gf;
      const tokenValuesAfter = await gfTokenValues();

      expect(confirmed).toBe(false);
      expect(text).toContain(AWAITING);
      expect(mailAfter).toBe(mailBefore);
      expect(entriesAfter).toBe(entriesBefore);
      expect(tokenValuesAfter).toBe(tokenValues);
    });

    test("AC4: a marked FF submission is accepted and every notification goes to the redirect address only", async () => {
      const mailBefore = (await h.mail()).length;
      const formId = h.fixtures.ff;
      const { page } = visitor;
      await page.goto(h.fixtures.page);
      const form = page.locator(`form[data-form_id='${formId}']`);
      for (const [name, value] of Object.entries({ "names[first_name]": "Pirax", email: "visitor@example.test", message: `Pirax check ${marker}` }))
        await form.locator(`[name='${name}']`).fill(value);
      const response = page.waitForResponse((r) => r.url().includes("admin-ajax.php") && (r.request().postData() ?? "").includes("action=fluentform_submit"));
      await form.locator("button[type=submit]").click();
      const res = await response;
      const ok = res.ok();
      if (ok) await page.locator(".ff-message-success").first().waitFor();
      const mail: MailRecord[] = (await h.mail()).slice(mailBefore);

      expect(ok).toBe(true);
      expect(mail.map((m) => m.subject).sort()).toEqual([
        `[pirax-test ${ID}] ff-${formId} notification A`,
        `[pirax-test ${ID}] ff-${formId} notification B`,
      ]);
      for (const m of mail) {
        expect(m.to).toEqual([REDIRECT]);
        expect(m.subject.lastIndexOf("[pirax-test")).toBe(0);
        expect(m.headers.filter((line) => /^x-pirax-form-test\s*:/i.test(line))).toEqual([`X-Pirax-Form-Test: ${ID}`]);
        expect(m.headers.some((line) => /^(cc|bcc)\s*:/i.test(line))).toBe(false);
      }
    });
  });
