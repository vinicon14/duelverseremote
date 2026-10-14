# Project Architecture Rules

- Keep mobile Party call controls in a dedicated bottom dock; this prevents video and header actions from overlapping on narrow screens.
- Edge functions must validate users with `auth.getUser(jwt)` passing the token explicitly; newer auth client builds ignore the global Authorization header and reject every user (this silently cut players off the TURN relay).
- `get-ice-servers` merges every configured TURN provider (static, Cloudflare, Metered); keep more than one relay so a single quota/outage cannot break duel video.
