# App Store Privacy Checklist

- Privacy policy URL: `/privacy.html`
- Terms URL: `/terms.html`
- Account creation: supported in the native iOS auth screen and web auth overlay.
- Account deletion path: authenticated in-app request from the iOS Account menu plus administrator deletion process documented at `/privacy.html#account-deletion`.
- Authentication provider: Supabase.
- Database provider: Supabase.
- Optional notification providers: GroupMe, Twilio, Discord, generic webhook.
- Camera usage: barcode scanner for menu item lookup.
- Tracking: none unless a future analytics tool is added.
- Third-party SDKs: none beyond Apple system frameworks in the native app.
- Privacy manifest: `ios/ElRoysManagerApp/Resources/PrivacyInfo.xcprivacy`.
- Required-reason APIs: `UserDefaults` is declared as `NSPrivacyAccessedAPICategoryUserDefaults` with reason `CA92.1` for app-only persisted settings.
- Collected data declared in manifest: staff name, staff email address, Supabase user ID, menu/user-generated content, and customer-support/account-deletion request data. All are linked to the user, used for app functionality, and not used for tracking.

Before TestFlight/App Store submission, the project owner must confirm the administrator deletion process and complete App Store Connect privacy nutrition labels.
