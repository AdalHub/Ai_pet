// MC Maps — a Minecraft-skinned Google Maps wrapper (search, travel, turn-by-turn navigation).
// Plain ES modules, no build step.

const $ = (s) => document.querySelector(s);
const store = {
  get: (k, d = null) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

/* ------------------------------------------------------------------ *
 * Usage / cost meter. Prices are ROUGH ESTIMATES (USD per 1,000 calls) *
 * and the monthly free allowance per SKU category. Verify at           *
 * https://mapsplatform.google.com/pricing and edit here.               *
 * ------------------------------------------------------------------ */
const SKUS = {
  mapLoad:      { label: 'Map loads',        per1000: 7.00,  free: 10000 },
  autocomplete: { label: 'Autocomplete',     per1000: 2.83,  free: 10000 },
  placeDetails: { label: 'Place details',    per1000: 17.00, free: 5000  },
  route:        { label: 'Routes computed',  per1000: 5.00,  free: 10000 },
};
const usage = {
  month() { return new Date().toISOString().slice(0, 7); },
  load() {
    try { const u = JSON.parse(store.get('mcm.usage', '{}')); if (u.month === this.month()) return u; } catch {}
    return { month: this.month(), counts: {} };
  },
  bump(sku, n = 1) { const u = this.load(); u.counts[sku] = (u.counts[sku] || 0) + n; store.set('mcm.usage', JSON.stringify(u)); },
  reset() { store.del('mcm.usage'); },
  billable(sku, count) { return Math.max(0, count - SKUS[sku].free) / 1000 * SKUS[sku].per1000; },
};

/* ------------------------------ helpers ------------------------------ */
const toast = (msg, ms = 2500) => { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms); };
const ll = (p) => (p ? { lat: typeof p.lat === 'function' ? p.lat() : p.lat, lng: typeof p.lng === 'function' ? p.lng() : p.lng } : null);
const rad = (d) => (d * Math.PI) / 180;
function dist(a, b) { // haversine, metres
  const R = 6371000, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function distToPath(p, path) { // min distance (m) from p to polyline, equirectangular approx
  if (path.length < 2) return Infinity;
  const k = Math.cos(rad(p.lat)), m = 111320;
  const X = (q) => (q.lng - p.lng) * k * m, Y = (q) => (q.lat - p.lat) * m;
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const ax = X(path[i]), ay = Y(path[i]), bx = X(path[i + 1]), by = Y(path[i + 1]);
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}
const fmtDist = (m) => (m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m / 10) * 10 + ' m');
const fmtDur = (s) => { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.max(1, m)} min`; };
const durSec = (d) => (d == null ? 0 : typeof d === 'number' ? d / 1000 : parseInt(String(d), 10) || 0);

/* ------------------------------ Minecraft map style ------------------------------ */
const MC_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#6fb04a' }] },                       // grass
  { elementType: 'labels.text.fill', stylers: [{ color: '#ffffff' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#2b2b2b' }, { weight: 3 }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'labels.text', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#3f7f2a' }] },  // forest
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#7bbd54' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#8b8b8b' }] }, // stone
  { featureType: 'poi.attraction', elementType: 'geometry', stylers: [{ color: '#9a9a9a' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#c9a66b' }] },     // path / dirt
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#7a5a34' }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#d9d9d9' }] }, // gravel / quartz
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#6b6b6b' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#3f76e4' }] },          // MC water
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#cfe0ff' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#2b2b2b' }] },
];

/* ------------------------------ travel modes ------------------------------ */
const MODES = [
  { id: 'WALK',    name: 'Walking',   img: 'assets/mc/boots.png' },
  { id: 'DRIVE',   name: 'Driving',   img: 'assets/mc/minecart.png' },
  { id: 'BICYCLE', name: 'Cycling',   img: 'assets/mc/saddle.png' },
];

/* ------------------------------ state ------------------------------ */
const S = {
  map: null, g: null, libs: {},
  me: null,            // {lat,lng}
  meMarker: null, destMarker: null,
  routeLines: [], route: null, steps: [], dest: null,
  modeIdx: Number(store.get('mcm.mode', 0)) || 0,
  creative: false, watchId: null, navigating: false, stepIdx: 0, offCount: 0,
  session: null, suggestions: [], follow: false,
};

/* ------------------------------ boot ------------------------------ */
function loadMapsScript(key) {
  return new Promise((resolve, reject) => {
    window.__mcmInit = resolve;
    window.gm_authFailure = () => { $('#keyerr').textContent = 'Google rejected this key (check API enablement, billing and referrer restrictions).'; $('#keyerr').hidden = false; showKeyModal(); };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__mcmInit`;
    s.async = true; s.onerror = () => reject(new Error('Could not load Google Maps (offline?)'));
    document.head.append(s);
  });
}
function showKeyModal() { $('#keymodal').hidden = false; }

async function boot() {
  const key = store.get('mcm.key');
  if (!key) return showKeyModal();
  $('#keymodal').hidden = true;
  try { await loadMapsScript(key); } catch (e) { return toast(e.message, 5000); }
  const g = (S.g = google.maps);
  const [{ Map }, places, routes] = await Promise.all([g.importLibrary('maps'), g.importLibrary('places'), g.importLibrary('routes')]);
  S.libs = { places, routes };

  const start = JSON.parse(store.get('mcm.last', 'null')) || { lat: 40.7484, lng: -73.9857 }; // fallback: NYC
  S.map = new Map($('#map'), {
    center: start, zoom: 16, styles: MC_STYLE, disableDefaultUI: true, gestureHandling: 'greedy',
    clickableIcons: false, backgroundColor: '#6fb04a', keyboardShortcuts: false,
  });
  usage.bump('mapLoad');
  defineMarkerClass();
  S.map.addListener('click', (e) => { if (S.creative) teleport(ll(e.latLng)); });
  S.map.addListener('dragstart', () => (S.follow = false));
  startGps();
  wireUi();
}

/* ------------------------------ custom DOM markers (work with JSON styles, no mapId needed) ------------------------------ */
let PixelMarker;
function defineMarkerClass() {
  PixelMarker = class extends S.g.OverlayView {
    constructor(pos, el) { super(); this.pos = pos; this.el = el; this.setMap(S.map); }
    onAdd() { this.getPanes().overlayMouseTarget.appendChild(this.el); }
    draw() { const pr = this.getProjection(); if (!pr) return; const p = pr.fromLatLngToDivPixel(new S.g.LatLng(this.pos)); if (!p) return; this.el.style.left = p.x + 'px'; this.el.style.top = p.y + 'px'; }
    onRemove() { this.el.remove(); }
    set(pos) { this.pos = pos; this.draw(); }
  };
}
function steveEl() {
  const wrap = document.createElement('div'); wrap.className = 'pm steve-wrap';
  const c = document.createElement('canvas'); c.width = c.height = 8; c.className = 'steve';
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const img = new Image(); img.onload = () => { ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8); ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8); }; img.src = 'assets/mc/steve.png';
  wrap.append(c); return wrap;
}
function destEl() {
  const wrap = document.createElement('div'); wrap.className = 'pm';
  const beam = document.createElement('div'); beam.className = 'beam';
  const img = document.createElement('img'); img.src = 'assets/mc/gold_block.png'; img.className = 'dest';
  wrap.append(beam, img); return wrap;
}

/* ------------------------------ player position ------------------------------ */
function setMe(p, { pan = false } = {}) {
  S.me = p; store.set('mcm.last', JSON.stringify(p));
  if (!S.meMarker) S.meMarker = new PixelMarker(p, steveEl()); else S.meMarker.set(p);
  if (pan || S.follow) S.map.panTo(p);
}
function startGps() {
  if (!('geolocation' in navigator)) return toast('No geolocation on this device');
  if (S.watchId != null) navigator.geolocation.clearWatch(S.watchId);
  S.watchId = navigator.geolocation.watchPosition(
    (pos) => { if (S.creative) return; const first = !S.me; setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }, { pan: first }); if (S.navigating) onNavTick(); },
    (err) => toast(err.code === 1 ? 'Location denied — allow it in browser settings (needs HTTPS)' : 'Waiting for GPS...', 4000),
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
}
function teleport(p) { setMe(p); if (S.navigating) onNavTick(); toast('Teleported'); }

/* ------------------------------ search ------------------------------ */
let qTimer;
function wireSearch() {
  const q = $('#q'), list = $('#suggest');
  q.addEventListener('input', () => {
    $('#qclear').hidden = !q.value;
    clearTimeout(qTimer);
    if (q.value.trim().length < 3) { list.hidden = true; return; }
    qTimer = setTimeout(() => autocomplete(q.value.trim()), 350); // debounce + 3-char minimum keeps request counts (and cost) down
  });
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && S.suggestions[0]) pick(S.suggestions[0]); });
  $('#qclear').onclick = () => { q.value = ''; list.hidden = true; $('#qclear').hidden = true; q.focus(); };
}
async function autocomplete(input) {
  const { AutocompleteSuggestion, AutocompleteSessionToken } = S.libs.places;
  S.session ??= new AutocompleteSessionToken();
  try {
    const req = { input, sessionToken: S.session };
    if (S.me) req.locationBias = { center: S.me, radius: 30000 };
    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
    usage.bump('autocomplete');
    S.suggestions = suggestions.filter((s) => s.placePrediction);
    const list = $('#suggest'); list.replaceChildren();
    for (const s of S.suggestions) {
      const p = s.placePrediction, li = document.createElement('li');
      const main = document.createElement('div'); main.className = 'main'; main.textContent = p.mainText?.text ?? p.text.text;
      const sec = document.createElement('div'); sec.className = 'sec'; sec.textContent = p.secondaryText?.text ?? '';
      li.append(main, sec); li.onclick = () => pick(s); list.append(li);
    }
    list.hidden = !S.suggestions.length;
  } catch (e) { console.error(e); toast('Search failed: ' + (e.message || e), 4000); }
}
async function pick(s) {
  $('#suggest').hidden = true; $('#q').blur();
  try {
    const place = s.placePrediction.toPlace();
    await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'viewport'] });
    usage.bump('placeDetails'); S.session = null; // session ends on details fetch
    $('#q').value = place.displayName || '';
    setDestination({ name: place.displayName, address: place.formattedAddress, pos: ll(place.location), viewport: place.viewport });
  } catch (e) { console.error(e); toast('Could not load place: ' + (e.message || e), 4000); }
}

/* ------------------------------ routing ------------------------------ */
function setDestination(d) {
  S.dest = d;
  if (!S.destMarker) S.destMarker = new PixelMarker(d.pos, destEl()); else S.destMarker.set(d.pos);
  if (d.viewport) S.map.fitBounds(d.viewport); else { S.map.setCenter(d.pos); S.map.setZoom(17); }
  $('#rname').textContent = d.name || 'Destination';
  $('#rmeta').textContent = d.address || '';
  $('#routecard').hidden = false; $('#steplist').hidden = true;
  $('#rstart').disabled = true; $('#rsteps').disabled = true;
  computeRoute();
}
async function computeRoute() {
  if (!S.dest) return;
  if (!S.me) { $('#rmeta').textContent = 'Waiting for your location...'; toast('No GPS fix yet — use Creative mode (emerald) to set a start'); return; }
  const mode = MODES[S.modeIdx].id;
  $('#rmeta').textContent = 'Calculating...';
  try {
    const { Route } = S.libs.routes;
    const { routes } = await Route.computeRoutes({
      origin: S.me, destination: S.dest.pos, travelMode: mode,
      fields: ['path', 'legs', 'distanceMeters', 'durationMillis', 'viewport'],
    });
    usage.bump('route');
    if (!routes?.length) { $('#rmeta').textContent = 'No route found for ' + MODES[S.modeIdx].name.toLowerCase(); return; }
    showRoute(routes[0]);
  } catch (e) { console.error(e); $('#rmeta').textContent = 'Route failed: ' + (e.message || e); }
}
function clearLines() { S.routeLines.forEach((l) => l.setMap(null)); S.routeLines = []; }
function showRoute(r) {
  S.route = r; clearLines();
  const path = (r.path || []).map(ll);
  S.routePath = path;
  const common = { map: S.map, path, clickable: false };
  S.routeLines.push(new S.g.Polyline({ ...common, strokeColor: '#000', strokeOpacity: 1, strokeWeight: 11, zIndex: 1 }));
  S.routeLines.push(new S.g.Polyline({ ...common, strokeColor: '#ffd83a', strokeOpacity: 1, strokeWeight: 6, zIndex: 2 }));
  const leg = r.legs?.[0];
  S.steps = (leg?.steps || []).map((st) => ({
    text: st.navigationInstruction?.instructions || st.instructions || 'Continue',
    maneuver: st.navigationInstruction?.maneuver || '',
    end: ll(st.endLocation || st.path?.[st.path.length - 1]),
    meters: st.distanceMeters ?? 0, seconds: durSec(st.durationMillis ?? st.staticDurationMillis),
  }));
  const meters = r.distanceMeters ?? leg?.distanceMeters ?? 0;
  $('#rmeta').textContent = `${MODES[S.modeIdx].name}: ${fmtDist(meters)} · ${fmtDur(durSec(r.durationMillis ?? leg?.durationMillis))}`;
  $('#rstart').disabled = false; $('#rsteps').disabled = !S.steps.length;
  const ol = $('#steplist'); ol.replaceChildren();
  S.steps.forEach((s) => { const li = document.createElement('li'); li.textContent = s.text; const sm = document.createElement('small'); sm.textContent = ` (${fmtDist(s.meters)})`; li.append(sm); ol.append(li); });
  if (r.viewport) S.map.fitBounds(r.viewport, { top: 120, bottom: 200, left: 30, right: 30 });
  else { const b = new S.g.LatLngBounds(); path.forEach((p) => b.extend(p)); S.map.fitBounds(b, 60); }
}
function clearRoute() {
  clearLines(); S.route = null; S.steps = []; S.dest = null;
  S.destMarker?.setMap(null); S.destMarker = null; $('#routecard').hidden = true;
}

/* ------------------------------ navigation ------------------------------ */
const ARROWS = { 'TURN_LEFT': '<', 'TURN_SLIGHT_LEFT': '<', 'TURN_SHARP_LEFT': '<', 'UTURN_LEFT': 'U', 'UTURN_RIGHT': 'U', 'TURN_RIGHT': '>', 'TURN_SLIGHT_RIGHT': '>', 'TURN_SHARP_RIGHT': '>', 'ROUNDABOUT_LEFT': 'O', 'ROUNDABOUT_RIGHT': 'O' };
function startNav() {
  if (!S.route) return;
  S.navigating = true; S.stepIdx = 0; S.offCount = 0; S.follow = true;
  document.body.classList.add('navigating'); $('#navbanner').hidden = false;
  if (S.me) S.map.panTo(S.me); S.map.setZoom(18);
  onNavTick();
}
function stopNav() {
  S.navigating = false; S.follow = false; document.body.classList.remove('navigating'); $('#navbanner').hidden = true;
  speechSynthesis?.cancel?.();
}
function onNavTick() {
  if (!S.navigating || !S.me) return;
  // arrived?
  if (dist(S.me, S.dest.pos) < 25) { $('#navinstr').textContent = 'You have arrived!'; $('#navdist').textContent = S.dest.name || ''; $('#navturn').textContent = '*'; say('You have arrived'); return; }
  // advance step when within 20 m of the step end
  while (S.stepIdx < S.steps.length - 1 && S.steps[S.stepIdx].end && dist(S.me, S.steps[S.stepIdx].end) < 20) S.stepIdx++;
  const st = S.steps[S.stepIdx];
  if (st) {
    const d = st.end ? dist(S.me, st.end) : st.meters;
    if (st._said !== S.stepIdx && d < 80) { st._said = S.stepIdx; say(st.text); }
    $('#navinstr').textContent = st.text; $('#navdist').textContent = 'in ' + fmtDist(d);
    $('#navturn').textContent = ARROWS[st.maneuver] || '^';
  }
  // off-route: don't auto-reroute (every reroute is a paid call) — ask first
  if (S.routePath && distToPath(S.me, S.routePath) > 60) { if (++S.offCount === 3) { toast('Off route — tap Start again to recalculate', 5000); $('#navturn').textContent = '!'; stopNavForReroute(); } } else S.offCount = 0;
}
function stopNavForReroute() { stopNav(); $('#routecard').hidden = false; $('#rstart').textContent = 'Recalculate'; }
function say(text) { try { const u = new SpeechSynthesisUtterance(text); speechSynthesis.speak(u); } catch {} }

/* ------------------------------ UI wiring ------------------------------ */
function renderCost() {
  const u = usage.load(); let total = 0;
  $('#costmonth').textContent = 'Month: ' + u.month;
  const t = $('#costtable'); t.replaceChildren();
  const head = t.insertRow(); ['Call', 'Used', 'Free tier', 'Est. $'].forEach((h, i) => { const c = head.insertCell(); c.textContent = h; c.className = 'dim'; });
  for (const [k, sku] of Object.entries(SKUS)) {
    const n = u.counts[k] || 0, cost = usage.billable(k, n); total += cost;
    const r = t.insertRow(); [sku.label, n, `${sku.free.toLocaleString()}/mo`, '$' + cost.toFixed(2)].forEach((v) => (r.insertCell().textContent = v));
  }
  $('#costtotal').textContent = `Est. billable: $${total.toFixed(2)}`;
}
function wireUi() {
  wireSearch();
  const modeBtn = () => { $('#modeimg').src = MODES[S.modeIdx].img; $('#mode').title = MODES[S.modeIdx].name; };
  modeBtn();
  $('#mode').onclick = () => { S.modeIdx = (S.modeIdx + 1) % MODES.length; store.set('mcm.mode', S.modeIdx); modeBtn(); toast(MODES[S.modeIdx].name); if (S.dest) computeRoute(); };
  $('#locate').onclick = () => { S.follow = true; if (S.me) { S.map.panTo(S.me); S.map.setZoom(Math.max(S.map.getZoom(), 17)); } else toast('Waiting for GPS...'); };
  $('#creative').onclick = () => { S.creative = !S.creative; $('#creative').classList.toggle('on', S.creative); toast(S.creative ? 'Creative mode: tap the map to teleport' : 'Survival mode: using GPS'); if (!S.creative) startGps(); };
  $('#cost').onclick = () => { renderCost(); $('#costmodal').hidden = false; };
  $('#costclose').onclick = () => ($('#costmodal').hidden = true);
  $('#costreset').onclick = () => { usage.reset(); renderCost(); };
  $('#keyreset').onclick = () => { store.del('mcm.key'); location.reload(); };
  $('#rclose').onclick = clearRoute;
  $('#rsteps').onclick = () => ($('#steplist').hidden = !$('#steplist').hidden);
  $('#rstart').onclick = () => { if ($('#rstart').textContent === 'Recalculate') { $('#rstart').textContent = 'Start'; computeRoute(); } else startNav(); };
  $('#navstop').onclick = () => { stopNav(); $('#routecard').hidden = false; };
}

// key modal works before the map exists
$('#keysave').onclick = () => { const k = $('#keyinput').value.trim(); if (!k) return; store.set('mcm.key', k); location.reload(); };
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
boot();
