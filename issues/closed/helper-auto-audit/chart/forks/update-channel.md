# Update channel

## Question
Q1. How does the helper update itself on client sites, and how does a site know the package is genuine?

### Carries
- release-approval: automatic publish; a hijacked channel would install code on every client site.

## Findings
- GitHub repo CastrumS/pirax-castrum-maintenance is PUBLIC (gh repo view, 2026-10-02): release assets download without credentials.
- WordPress core verifies signatures only for wordpress.org packages; a third-party updater must verify itself. PHP's libsodium (`sodium_crypto_sign_verify_detached`, PHP 7.2+) is bundled with WordPress's sodium_compat polyfill.

## Taken
Operator 2026-10-02, verbatim: "4. whichever you think works better"
Agent choice under that delegation: GitHub Releases on the public repo carry the helper ZIP plus a manifest (version, audited plugin versions, ZIP sha256) signed with an Ed25519 key; the helper embeds the public key, offers an update to WordPress only from a manifest whose signature verifies, and refuses a downloaded package whose hash differs. The private signing key lives only with the publishing job. Foreclosed: R2 hosting; unsigned update feed.
