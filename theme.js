// Set theme early to avoid FOUC
(function () {
  var KEY = 'm3calc/v1/theme';
  try {
    var saved = localStorage.getItem(KEY);
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = (saved === 'light' || saved === 'dark') ? saved : (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) { /* noop */ }
})();

