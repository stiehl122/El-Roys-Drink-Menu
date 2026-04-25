# Environment Matrix

| Config item | Used by | Required? | Production source | Failure behavior | Validation |
|---|---|---:|---|---|---|
| `SUPABASE_URL` | Vercel API | Yes | Vercel env | API returns server misconfigured | `curl /api/auth?mode=bootstrap` |
| `SUPABASE_ANON_KEY` | Auth proxy/bootstrap | Yes | Vercel env | login/bootstrap fails | login smoke |
| `SUPABASE_SERVICE_ROLE_KEY` | Server data access | Yes | Vercel env | API returns server misconfigured | manager menu load smoke |
| `VERCEL_ENV` | Preview badges/audit gating | Yes on Vercel | Vercel system env | preview/prod branching wrong | inspect footer badge |
| `LOOP_MANAGER_EMAIL` | Preview audit only | Preview only | Vercel preview env | preview audit unavailable | preview sign-in smoke |
| `LOOP_MANAGER_PASSWORD` | Preview audit only | Preview only | Vercel preview env | preview audit unavailable | preview sign-in smoke |
| `LOOP_ADMIN_EMAIL` | Preview audit only | Preview only | Vercel preview env | preview audit unavailable | preview admin smoke |
| `LOOP_ADMIN_PASSWORD` | Preview audit only | Preview only | Vercel preview env | preview audit unavailable | preview admin smoke |
| `GROUPME_BOT_ID` | Notifications | Optional | Vercel env | GroupMe sends skipped/fail | Send Update smoke |
| `TWILIO_ACCOUNT_SID` | Notifications | Optional | Vercel env | SMS sends skipped/fail | Send Update smoke |
| `TWILIO_AUTH_TOKEN` | Notifications | Optional | Vercel env | SMS sends skipped/fail | Send Update smoke |
| `TWILIO_FROM_NUMBER` | Notifications | Optional | Vercel env | SMS sends skipped/fail | Send Update smoke |
| `TWILIO_TO_NUMBERS` | Notifications | Optional | Vercel env | SMS sends skipped/fail | Send Update smoke |
| `DISCORD_WEBHOOK_URL` | Notifications | Optional | Vercel env | Discord sends skipped/fail | Send Update smoke |
| `GENERIC_WEBHOOK_URL` | Notifications | Optional | Vercel env | webhook sends skipped/fail | Send Update smoke |
| `GENERIC_WEBHOOK_SECRET` | Notifications | Optional | Vercel env | webhook sends without secret header | Send Update smoke |
| `UNTAPPD_CLIENT_ID` | Untappd lookup | Optional | Vercel env | Untappd lookup unavailable | manager lookup smoke |
| `UNTAPPD_CLIENT_SECRET` | Untappd lookup | Optional | Vercel env | Untappd lookup unavailable | manager lookup smoke |
| `UNTAPPD_USER_AGENT` | Untappd lookup | Optional | Vercel env | Untappd lookup may be rejected | manager lookup smoke |
| `ELROYS_IOS_APP_BASE_URL` | iOS app build setting | Optional override | generated Xcode setting or `xcodebuild` override | app points to default prod | inspect `Info.plist` in built app |
| `ELROYS_IOS_PUBLIC_ORIGIN` | iOS app build setting | Optional override | generated Xcode setting or `xcodebuild` override | public previews point to default prod | inspect `Info.plist` in built app |
| `APPLE_DEVELOPMENT_TEAM` | iOS signing build setting | Yes for archive | generated Xcode setting or `xcodebuild` override | archive/signing fails | Xcode archive |
