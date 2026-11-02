# Email setup

Proposals are sent over **SMTP** from a mailbox you control, such as `sales@<your-domain>`. Each user's own address is set as *Reply-To*, so customer replies go back to the person who prepared the proposal. Every send (and every failure) is logged on the proposal.

Until SMTP is configured, the **Send via email** button explains the situation and offers PDF/Excel downloads instead.

## Environment variables

```env
SMTP_HOST="smtp.example.com"
SMTP_PORT=587
SMTP_SECURE="false"      # "true" for port 465
SMTP_USER="sales@your-domain"
SMTP_PASS="app-password-or-api-key"
EMAIL_FROM="IDCUBE Sales <sales@your-domain>"
EMAIL_BCC=""             # optional: archive copy of every proposal email
```

Restart the app after changing these. **Settings → Integrations** shows whether email is active.

## Provider recipes

### Google Workspace (Gmail)
1. Turn on 2-Step Verification for the sending mailbox.
2. Create an **App password** at <https://myaccount.google.com/apppasswords>.
3. Use `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER=<mailbox>`, `SMTP_PASS=<app password>`.
4. `EMAIL_FROM` must be that mailbox or an alias configured in Gmail.

### Microsoft 365 / Outlook
1. In the Microsoft 365 admin centre, enable **Authenticated SMTP** for the sending mailbox (Active users → Mail → Manage email apps).
2. Use `SMTP_HOST=smtp.office365.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, and the mailbox credentials.
3. If your tenant disables basic SMTP auth, use a transactional provider instead (below).

### Transactional providers (recommended for volume and deliverability)
Amazon SES, SendGrid, Brevo, Postmark and Zoho ZeptoMail all provide SMTP credentials. Verify your sending domain (SPF + DKIM) in the provider's console, then use the host, port and credentials they give you.

## Deliverability checklist
- Add the provider's **SPF** and **DKIM** records to your DNS, and publish a **DMARC** policy.
- Use a real mailbox in `EMAIL_FROM` that can receive bounces.
- Test with **Send via email** on a test proposal addressed to yourself.
