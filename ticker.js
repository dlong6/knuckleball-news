(function () {
  const TICKER_CACHE_KEY = "knuckleball.latestTickerText.v1";

  const getHeadlineLinks = () => Array.from(document.querySelectorAll(".headline-track .headline-copy"));

  const renderTickerText = (tickerText) => {
    const headlineLinks = getHeadlineLinks();
    if (!headlineLinks.length) {
      return;
    }

    const normalizedText = String(tickerText || "").trim();

    headlineLinks.forEach((link) => {
      link.textContent = "";

      if (!normalizedText) {
        return;
      }

      const prefix = document.createElement("span");
      prefix.className = "headline-prefix";
      prefix.textContent = "LATEST: ";

      link.appendChild(prefix);
      link.appendChild(document.createTextNode(normalizedText));
    });
  };

  const readCachedTickerText = () => {
    try {
      return String(window.localStorage.getItem(TICKER_CACHE_KEY) || "").trim();
    } catch (_error) {
      return "";
    }
  };

  const writeCachedTickerText = (value) => {
    try {
      const normalized = String(value || "").trim();
      if (!normalized) {
        return;
      }

      window.localStorage.setItem(TICKER_CACHE_KEY, normalized);
    } catch (_error) {
      // Ignore storage failures.
    }
  };

  const setupTicker = async () => {
    if (!window.KBData || typeof window.KBData.fetchTickerHeadline !== "function") {
      return;
    }

    if (!document.querySelector(".headline-track")) {
      return;
    }

    // Render cached ticker immediately to avoid any static flash on refresh.
    renderTickerText(readCachedTickerText());

    try {
      const headlineText = await window.KBData.fetchTickerHeadline();
      if (!headlineText) {
        return;
      }

      writeCachedTickerText(headlineText);
      renderTickerText(headlineText);
    } catch (_error) {
      // Keep cached ticker text if live fetch fails.
    }
  };

  setupTicker();
})();
