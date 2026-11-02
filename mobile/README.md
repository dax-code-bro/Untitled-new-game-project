# Southbound on the App Store and Google Play

The game is a web build, so the store apps wrap `site/southbound` with
[Capacitor](https://capacitorjs.com) (free, open source). Steps, run on a Mac
for iOS (Xcode required) or any machine for Android (Android Studio required):

```bash
cd mobile
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap add ios        # creates ios/ (open with: npx cap open ios)
npx cap add android    # creates android/ (open with: npx cap open android)
npx cap sync           # copies the game in after every build
```

Before submitting:

- Apple Developer Program ($99/year) and a Google Play developer account ($25 once).
- Age rating: the planned content (blood, strong language, drugs) is 17+ on
  the App Store and Mature/M on Google Play. The in-game content filters stay.
- A privacy policy URL (the game collects no personal data; settings stay on device).
- Screenshots: use `tools/southbound/playtest.mjs` at the store's sizes.

Until then, players can install it from the browser: on iPhone, Share then
**Add to Home Screen**; on Android, **Install app**. It opens full screen in
landscape (see `site/southbound/manifest.webmanifest`).
