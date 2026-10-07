# Operator notice

## Question
Q1. How is the operator told about a failed re-audit or other job failure?

### Carries
- DISCORD_WEBHOOK_URL absent.

## Findings
- Test mailbox piraxcastrum@gmail.com has an app password used for IMAP (IMAP_USER/IMAP_PASSWORD in .env); Gmail SMTP accepts the same app password.

## Taken
Operator 2026-10-02, verbatim: "6. Send an email to pirax castrum email"
Reason: operator choice. Foreclosed: Discord, desktop notifications. Recipient piraxcastrum@gmail.com.
