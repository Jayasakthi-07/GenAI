(function () {
  try {
    var pref = localStorage.getItem('stockroom.theme') || 'system';
    var dark =
      pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) {
    // Storage may be unavailable (private mode); the app still follows the system theme once it loads.
  }
})();
