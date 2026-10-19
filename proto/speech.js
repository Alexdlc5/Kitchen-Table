// Read the table aloud (Options › Accessibility), for players who can't see the cards and don't use VoiceOver.
// Uses the phone's own voice (Web Speech API). VoiceOver users get the same sentences through the live region instead.
let on = false;
export const speech = {
  rate: 1,
  set enabled(v) { on = !!v && "speechSynthesis" in window; if (!on) this.stop(); },
  get enabled() { return on; },
  say(text, { interrupt = false } = {}) {
    if (!on || !text) return;
    if (interrupt) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = this.rate; u.lang = document.documentElement.lang || "en";
    speechSynthesis.speak(u);
  },
  idle() { // resolves once the voice has finished (at once when speech is off)
    return new Promise((done) => { const t = () => (!on || !speechSynthesis.speaking ? done() : setTimeout(t, 120)); t(); });
  },
  stop() { try { speechSynthesis.cancel(); } catch {} },
};
