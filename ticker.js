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

  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  // The ticker is moved from JavaScript instead of a CSS animation so every
  // frame can be snapped to a whole screen pixel. A CSS animation lands on
  // fractional pixels (e.g. 1.7px per frame), which makes the browser blend
  // each letter across neighbouring pixels - that's what looked blurry.
  let copyWidth = 0;
  let speedPxPerSecond = 0;
  let offset = 0;
  let lastFrameTime = null;
  let frameId = null;

  const stopTicker = (track) => {
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId);
      frameId = null;
    }
    lastFrameTime = null;
    offset = 0;
    if (track) {
      track.style.transform = "translate3d(0, 0, 0)";
    }
  };

  const step = (now) => {
    const track = getHeadlineTrack();
    if (!track || copyWidth <= 0) {
      frameId = null;
      return;
    }

    // Cap the time step so returning to a background tab doesn't cause a jump.
    const elapsedSeconds = lastFrameTime === null ? 0 : Math.min((now - lastFrameTime) / 1000, 0.1);
    lastFrameTime = now;
    offset = (offset + speedPxPerSecond * elapsedSeconds) % copyWidth;

    // Snap to the nearest physical pixel (half a CSS pixel on Retina screens).
    const pixelRatio = window.devicePixelRatio || 1;
    const snapped = Math.round(offset * pixelRatio) / pixelRatio;
    track.style.transform = `translate3d(${-snapped}px, 0, 0)`;

    frameId = window.requestAnimationFrame(step);
  };

  const syncTickerMotion = () => {
    const track = getHeadlineTrack();
    const headlineLinks = getHeadlineLinks();
    const firstCopy = headlineLinks[0];

    if (!track || !firstCopy) {
      return;
    }

    const text = String(firstCopy.textContent || "").trim();
    if (!text || reducedMotionQuery.matches) {
      stopTicker(track);
      return;
    }

    // Two identical copies sit side by side; moving by one copy's width and
    // wrapping around makes the loop seamless.
    copyWidth = firstCopy.getBoundingClientRect().width;
    if (copyWidth <= 0) {
      stopTicker(track);
      return;
    }

    // Same speed rules as before: a base speed, with each full pass kept
    // between 8 and 22 seconds.
    const isMobile = window.matchMedia("(max-width: 760px)").matches;
    const baseSpeed = isMobile ? MOBILE_SCROLL_SPEED_PX_PER_SECOND : DESKTOP_SCROLL_SPEED_PX_PER_SECOND;
    const durationSeconds = clamp(copyWidth / baseSpeed, MIN_TICKER_DURATION_SECONDS, MAX_TICKER_DURATION_SECONDS);
    speedPxPerSecond = copyWidth / durationSeconds;

    offset %= copyWidth;
    if (frameId === null) {
      lastFrameTime = null;
      frameId = window.requestAnimationFrame(step);
    }
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

  // Web fonts can finish loading after the first render and change the text
  // width, so measure again once they're ready.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(syncTickerMotion).catch(() => {});
  }

  const onReducedMotionChange = () => syncTickerMotion();
  if (typeof reducedMotionQuery.addEventListener === "function") {
    reducedMotionQuery.addEventListener("change", onReducedMotionChange);
  } else if (typeof reducedMotionQuery.addListener === "function") {
    reducedMotionQuery.addListener(onReducedMotionChange);
  }

  fixInitialScrollPosition();

  setupTicker();
})();
