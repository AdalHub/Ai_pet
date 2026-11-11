# MC Maps

A Minecraft-skinned Google Maps wrapper, modelled on Game Maps IRL: search a place, see yourself as Steve on a
blocky grass/dirt/stone/water map, get a route (walk / drive / cycle) and turn-by-turn navigation with voice.
Plain HTML/JS PWA — no build step, no App Store, no $99 Apple fee. Add it to your phone's home screen.

## Run it

```bash
./scripts/fetch-textures.sh        # pulls Minecraft textures into assets/mc/ (git-ignored)
python3 -m http.server 8080        # then open http://localhost:8080
```

**On a phone**, GPS only works over HTTPS, so use one of:
* **GitHub Pages** (included workflow `.github/workflows/minecraft-maps-pages.yml`, enable Pages → "GitHub Actions" in repo settings; Pages on a *private* repo needs a paid GitHub plan), or
* a tunnel: `npx cloudflared tunnel --url http://localhost:8080` (or ngrok) and open the https URL.

Then Safari/Chrome → Share → **Add to Home Screen**.

## Google API key (you create this — I can't access your Google account)

1. https://console.cloud.google.com → create/select a project (sign in as the account that should be billed), **enable billing**.
2. APIs & Services → Library → enable: **Maps JavaScript API**, **Places API (New)**, **Routes API**.
3. Credentials → Create API key. **Restrict it**: Application restrictions → *Websites* → add your Pages/tunnel URL and
   `http://localhost:8080/*`; API restrictions → just those three APIs.
4. **Set a budget + quota cap** (Billing → Budgets & alerts; APIs → Quotas) so a leaked key can't run up a bill.
5. Open the app and paste the key when asked. It's stored only in your browser's localStorage, never in git.

## Cost tracking

The 🗺 (map) button shows how many billable calls *this device* made this month and an estimated cost vs. the free tier.
Real billing lives in Cloud Console → Billing → Reports (and the API dashboard's per-API request counts). Tune the price
table at the top of `app.js` (`SKUS`) from https://mapsplatform.google.com/pricing.

Calls the app makes: 1 map load per launch · 1 autocomplete request per pause in typing (≥3 chars, 350 ms debounce) ·
1 place-details per chosen result · 1 route per destination / travel-mode change. Off-route never auto-reroutes (it asks).

## Controls
Compass = centre on me · boots/minecart/saddle = walk/drive/cycle · emerald = **Creative mode** (tap map to teleport — handy
indoors/testing) · map = usage & cost.

## Textures & licensing
Textures are Mojang's and are downloaded at setup/deploy time from the community mirror
`InventivetalentDev/minecraft-assets`; they are **not committed**. Fine for personal use with friends; don't publish
commercially. Google Maps terms don't allow replacing Google's tiles, so the look is done with Google's official JSON
map styling + a tiled-texture overlay + Minecraft UI/markers (Game Maps IRL uses its own OpenStreetMap-based tiles instead).
