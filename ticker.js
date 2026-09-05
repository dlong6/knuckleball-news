(function () {
  const TICKER_CACHE_KEY = "knuckleball.latestTickerText.v1";
  const LOCAL_TICKER_HEADLINE_KEY = "knuckleball.tickerHeadline.v1";
  const MIN_TICKER_DURATION_SECONDS = 8;
  const MAX_TICKER_DURATION_SECONDS = 22;
  const MOBILE_SCROLL_SPEED_PX_PER_SECOND = 96;
  const DESKTOP_SCROLL_SPEED_PX_PER_SECOND = 122;

  const getHeadlineLinks = () => Array.from(document.querySelectorAll(".headline-track .headline-copy"));

  const getHeadlineTrack = () => document.querySelector(".headline-track");

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const syncTickerMotion = () => {
    const track = getHeadlineTrack();
    const headlineLinks = getHeadlineLinks();
    const firstCopy = headlineLinks[0];

    if (!track || !firstCopy) {
      return;
    }

    const text = String(firstCopy.textContent || "").trim();
    if (!text) {
      track.style.animation = "none";
      track.style.transform = "translateX(0)";
      return;
    }

    const isMobile = window.matchMedia("(max-width: 760px)").matches;
    const speed = isMobile ? MOBILE_SCROLL_SPEED_PX_PER_SECOND : DESKTOP_SCROLL_SPEED_PX_PER_SECOND;
    const travelDistance = firstCopy.scrollWidth;
    const durationSeconds = clamp(travelDistance / speed, MIN_TICKER_DURATION_SECONDS, MAX_TICKER_DURATION_SECONDS);

    track.style.setProperty("--headline-duration", `${durationSeconds.toFixed(2)}s`);
    track.style.animation = "";
  };

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

    syncTickerMotion();
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

  const fixInitialScrollPosition = () => {
    if (window.location.hash) {
      return;
    }

    try {
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "manual";
      }
    } catch (_error) {
      // Ignore browser limitations.
    }

    const navigationEntry =
      typeof performance !== "undefined" &&
      typeof performance.getEntriesByType === "function" &&
      performance.getEntriesByType("navigation")[0];
    const navigationType = navigationEntry?.type || "navigate";
    if (navigationType === "back_forward") {
      return;
    }

    window.requestAnimationFrame(() => {
      if ((window.scrollY || window.pageYOffset || 0) > 1) {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }
    });
  };

  window.addEventListener("storage", (event) => {
    if (event.key !== TICKER_CACHE_KEY && event.key !== LOCAL_TICKER_HEADLINE_KEY) {
      return;
    }

    renderTickerText(readStoredTickerText());
  });

  window.addEventListener("resize", syncTickerMotion);

  fixInitialScrollPosition();

  setupTicker();
})();
