/** The AudioContext constructor, or null where the browser has neither it nor Safari's prefixed one. */
export function getAudioContextClass(): typeof AudioContext | null {
  const prefixed = (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return window.AudioContext ?? prefixed ?? null;
}
