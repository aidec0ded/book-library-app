# Notes for reviewing the Terms and Privacy Policy

Drafted November 2026 from what the app actually does (the code and the database), for review by a lawyer before they go live. Neither is published yet.

## Decisions for the owner

- Legal entity name, type, state, and postal address (every bracketed `[LEGAL ENTITY NAME]`)
- Contact email for privacy and legal requests
- Minimum age: 13 (US), or 16 if you want to serve the EEA and UK without parental consent flows
- Governing law and where disputes go: state courts, small claims, or arbitration with a class action waiver
- Refunds: none for partial periods (what the FAQ says now), or at your discretion
- Whether to offer an analytics opt-out, and whether to send any marketing email
- How long to keep contact form messages, and the backup window (Supabase Pro keeps daily backups for 7 days; check your plan)

## Questions for the lawyer

- GDPR and UK GDPR: do you need them if you don't market to Europe but don't block it? If so: lawful bases (contract for the service, legitimate interests for analytics and security), an EU representative, and transfer mechanisms for US processing
- The AI reader profile is "profiling" under GDPR. It's for the reader's own benefit and has no legal or similarly significant effect, but confirm what to disclose
- US state privacy laws (California, Virginia, and others) mostly apply above revenue or volume thresholds Rekollekt won't reach soon. Confirm which apply, and whether "we don't sell or share for advertising" is enough
- Conversations can include health and other sensitive details readers volunteer (one real conversation discusses lab results). Is there anything to add for sensitive data?
- Automatic renewal laws (California and others) set rules for disclosure at checkout and easy cancellation. Check the checkout flow and the Stripe settings, not just these terms
- The AI provider's data handling: confirm Anthropic's current commercial terms on training and retention match what the policy says

## Things in the app to fix or confirm before publishing

- Deleting an account doesn't delete the reader's PostHog person or Stripe customer. Deleting the PostHog person on account deletion is a small change; Stripe records are kept for accounting either way
- The old `chat_token_usage` table (no longer written) still holds user IDs after an account is deleted. Drop the table or clear those rows
- PostHog: confirm whether session replay is off in the project settings. If it's on, the policy has to say so, and it would record what readers type
- Supabase's auth email sender: say which provider sends account emails (the table's `[Email provider]` row)
- Once the text is final: `/terms` and `/privacy` pages, links in the site footer and on sign-up ("By creating an account you agree to…"), and the privacy policy URL in Google's OAuth consent screen and Stripe's settings
- The FAQ promises data is "never used for model training". That's true for Anthropic under its commercial terms; keep the two in step
