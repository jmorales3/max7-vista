---
name: expo-image Android headers not forwarded by Glide
description: expo-image's source.headers prop is silently dropped on Android — Glide does not forward custom HTTP headers set via the JS source object.
---

# expo-image Android: source.headers not forwarded by Glide

## Rule
Never rely on `expo-image`'s `source={{ uri, headers }}` to carry auth credentials on Android. The prop is accepted by TypeScript and documented, but Glide (the underlying Android image loader) silently drops custom headers set this way.

**Why:** expo-image on Android renders via Glide. The JS-side `headers` object goes through the Expo module layer but is not wired into Glide's OkHttp interceptor chain in expo-image v3.x. Requests arrive at the server with no Authorization header → 401 → blank placeholder.

**How to apply:** For any authenticated image endpoint served to the mobile app:
- Use a short-lived token embedded in the URL as a query parameter (`?token=<sessionId>`), OR
- Pre-fetch the image blob using `customFetch` (which correctly adds the auth header) and serve from a local file URI.

The query-param approach is already implemented in the api-server auth middleware (`app.ts`) — it checks `req.query.token` as a fallback when no Authorization header is present. Image URLs in `patient/[id].tsx` append `?token=${encodeURIComponent(authToken)}`.

**Do not use on iOS either** without device verification — the root cause may be Expo-layer not the OS loader, so it may fail on both platforms.
