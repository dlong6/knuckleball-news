(function () {
  const TICKER_CACHE_KEY = "knuckleball.latestTickerText.v1";
  const LOCAL_TICKER_HEADLINE_KEY = "knuckleball.tickerHeadline.v1";

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

  const readStoredTickerText = () => {
    try {
      const primary = String(window.localStorage.getItem(LOCAL_TICKER_HEADLINE_KEY) || "").trim();
      if (primary) {
        return primary;
      }

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

      window.localStorage.setItem(LOCAL_TICKER_HEADLINE_KEY, normalized);
      window.localStorage.setItem(TICKER_CACHE_KEY, normalized);
    } catch (_error) {
      // Ignore storage failures.
    }
  };

  const setupTicker = async () => {
    if (!document.querySelector(".headline-track")) {
      return;
    }

    // Render cached/local ticker immediately to avoid empty flashes on refresh.
    renderTickerText(readStoredTickerText());

    if (!window.KBData || typeof window.KBData.fetchTickerHeadline !== "function") {
      return;
    }

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

  window.addEventListener("storage", (event) => {
    if (event.key !== TICKER_CACHE_KEY && event.key !== LOCAL_TICKER_HEADLINE_KEY) {
      return;
    }

    renderTickerText(readStoredTickerText());
  });

  setupTicker();
})();
