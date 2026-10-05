# Fix notes

- The uploaded Gradle log came from running `./gradlew` at the repository root. The wrapper is at `Zkp-App/android/gradlew`; the README now gives the correct Rust, Android, and Windows build commands.
- The backend previously marked any non-empty proof string as verified and trusted the caller's `input_mode` when assigning trust. Because no server-side Plonky2 verifier or pinned verification key exists in this repository, `/zkauth/verify` now returns `503 VERIFIER_UNAVAILABLE` without completing a session. The legacy `/api/upload-proof` endpoint now returns `410` instead of accepting unverified claims.
- Added a Node.js integration test covering a fabricated “NFC passport” claim, the legacy endpoint, and session state. The backend `npm test` command now runs it.
- Removed the uploaded Gradle diagnostic log and dependency folders from the handoff archive. `node_modules` and ZIP archives are now ignored by Git.

## Verification performed

- `node --check backend/server.js` — passed.
- `npm test` in `backend/` — passed (1 integration test).
- Android Gradle build not run here: this environment has no Java/JDK or Android SDK installed. Build it locally with JDK 17 and Android SDK/NDK from `Zkp-App/android`.
