# App Store Privacy Checklist

- Privacy policy URL: `/privacy.html`
- Terms URL: `/terms.html`
- Account deletion path: in-app link to `/privacy.html#account-deletion` and administrator deletion process.
- Authentication provider: Supabase.
- Database provider: Supabase.
- Optional notification providers: GroupMe, Twilio, Discord, generic webhook.
- Camera usage: barcode scanner for menu item lookup.
- Tracking: none unless a future analytics tool is added.
- Third-party SDKs: none beyond Apple system frameworks in the native app.
- Privacy manifest: `ios/ElRoysManagerApp/Resources/PrivacyInfo.xcprivacy`.

Before TestFlight/App Store submission, the project owner must confirm the administrator deletion process and complete App Store Connect privacy nutrition labels.
