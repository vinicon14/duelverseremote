#!/usr/bin/env bash
# Build Duelverse AAB for Google Play Store
# Requires: Node 20+, JDK 21, Android SDK, android/keystore.properties configured

set -e

echo "🎮 Duelverse — Build AAB for Play Store"
echo "======================================="

# 1. Check keystore
if [ ! -f "android/keystore.properties" ]; then
  echo "❌ android/keystore.properties not found."
  echo "   Read PLAY_STORE_GUIDE.md § 3 to create the keystore."
  exit 1
fi

# 2. Build web
echo "📦 Building web assets..."
npm install
npm run build

# 3. Sync Capacitor
echo "🔄 Syncing Capacitor..."
npx cap sync android

# 4. Build AAB
echo "🏗️  Building signed AAB..."
cd android
./gradlew clean bundleRelease
cd ..

# 5. Report
AAB="android/app/build/outputs/bundle/release/app-release.aab"
if [ -f "$AAB" ]; then
  SIZE=$(du -h "$AAB" | cut -f1)
  echo ""
  echo "✅ Success!"
  echo "   File: $AAB"
  echo "   Size: $SIZE"
  echo ""
  echo "Next: upload to Play Console → Production → Create new release"
else
  echo "❌ AAB not generated. Check gradle output above."
  exit 1
fi
