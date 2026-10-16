// Only fixed event names and coarse modes cross this boundary.
export function trackGame(name: 'game_start' | 'game_end', mode?: 'bots' | 'watch_bots' | 'explore' | 'online') {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('nanded:analytics', { detail: { name, mode } }));
}
