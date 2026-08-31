# Mobile Development Notes

This project uses Expo development builds rather than Expo Go.

## Windows workflow

On Windows, use this repository to write React Native code, run the FastAPI server, and test backend endpoints. iOS simulator support still needs macOS and Xcode.

## Android option

If you install Android Studio, you can run:

```bash
cd mobile
npm install
npx expo install --fix
npx expo run:android
```

## iOS option

On a Mac:

```bash
cd mobile
npm install
npx expo install --fix
npx expo run:ios
```

After that, add the Swift `AlarmKitBridge` implementation described in `docs/ios-alarmkit.md`.
