# Form checker: required checkboxes carry plugin markers, not HTML `required`

Recorded: 2026-09-26 (slot A review of form-check at `83509cb`).

## Case

The checker filled forms conservatively. It ticked a checkbox only when the element's HTML `required` property was true, and left optional boxes alone. The native Playground suite passed, but its forms had no required consent or terms field. Its "server-required rejection" fixture was exactly an unchecked GF checkbox refused by the plugin.

## Evidence

- Gravity Forms 3.1.2:
  - `class-gf-field-consent.php:224,253` renders the consent input with only `aria-required="true"`.
  - Checkbox-field inputs carry no required marker. `form_display.php:4566` adds `gfield_contains_required` to the field container.
  - No GF field class emits HTML `required`.
- Fluent Forms 6.2.14: `Checkable.php:144–153` and `TermsAndConditions.php:59–64` render `aria-required='true'`.
- With markup copied from both plugins, production `fillForm` returned `prepared` with "Native client validation passed." and the required box unticked.
- The native run `runs/forms-playground-39f8c947-…/negative.json`, `#gform_7`, shows GF answering such a submission with "Required consent: This field is required." It is reported as `rejected`.
- Leaf review: `issues/open/site-checks/form-check/review-A.md`, F1.

## Learning

HTML constraint validation is not how WordPress form plugins express "required": they use ARIA attributes and wrapper classes and validate in their own JS and on the server. A filler that trusts only `element.required` passes client validation and then gets refused, blaming the site for the checker's omission. Derive required-ness from the plugin's audited markup. Include consent, terms and required-choice fields in native end-to-end fixtures, not only text, email and textarea.
