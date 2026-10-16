/* Aggregate game analytics. Never pass player/game state or URL parameters here. */
(() => {
  const host = 'cs.nanded.fun';
  const id = 'G-ZJDMT177HT';
  if (location.hostname !== host || window.__nandedAnalyticsInitialized) return;
  window.__nandedAnalyticsInitialized = true;
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
  gtag('js', new Date());
  const safePage = { page_location: 'https://' + host + '/', page_referrer: '', page_title: 'Counter Strike Nanded' };
  gtag('set', safePage);
  gtag('config', id, { ...safePage, send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, cookie_domain: host });
  gtag('event', 'page_view', { ...safePage, send_to: id });
  const modes = new Set(['bots', 'watch_bots', 'explore', 'online', 'drive']);
  const events = new Set(['game_start', 'game_end', 'mission_complete']);
  window.addEventListener('nanded:analytics', (event) => {
    const detail = event.detail;
    if (!detail || !events.has(detail.name)) return;
    const params = { ...safePage, send_to: id };
    if (modes.has(detail.mode)) params.game_mode = detail.mode;
    gtag('event', detail.name, params);
  });
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
  document.head.appendChild(script);
})();
