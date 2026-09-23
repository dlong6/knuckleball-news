(function () {
  const TICKER_CACHE_KEY = "knuckleball.latestTickerText.v1";
  const LOCAL_TICKER_HEADLINE_KEY = "knuckleball.tickerHeadline.v1";
  // Target speed. 120 px/s is exactly 2 pixels per frame on a 60Hz screen
  // and 1 pixel per frame on a 120Hz screen, so every step is the same
  // whole number of pixels: sharp text (no blending between pixels, which
  // made the white text shimmer) and no stutter.
  const TARGET_SPEED_PX_PER_SECOND = 120;

  const getHeadlineLinks = () => Array.from(document.querySelectorAll(".headline-track .headline-copy"));

  const getHeadlineTrack = () => document.querySelector(".headline-track");

  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Positions are tracked in physical screen pixels (device pixels) so they
  // always land exactly on the pixel grid, on regular and Retina screens.
  let copyWidthDevicePx = 0;
  let offsetDevicePx = 0;
  let frameId = null;
  let lastFrameTime = null;
  const recentFrameGaps = [];

  // The screen's refresh rate, locked to a standard value (60Hz, 120Hz...).
  // It only changes after a different rate has been measured consistently,
  // so the step size can't flicker between two values (which would stutter).
  const STANDARD_REFRESH_RATES = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];
  let lockedRefreshRate = 60;
  let pendingRate = null;
  let pendingRateFrames = 0;

  const nearestStandardRate = (intervalMs) =>
    STANDARD_REFRESH_RATES.reduce((best, rate) =>
      Math.abs(1000 / rate - intervalMs) < Math.abs(1000 / best - intervalMs) ? rate : best
    );

  const updateRefreshRate = () => {
    if (recentFrameGaps.length < 10) {
      return;
    }
    // Median of recent frame gaps, so an occasional slow frame is ignored.
    const sorted = [...recentFrameGaps].sort((a, b) => a - b);
    const measured = nearestStandardRate(sorted[Math.floor(sorted.length / 2)]);

    if (measured === lockedRefreshRate) {
      pendingRate = null;
      pendingRateFrames = 0;
      return;
    }
    if (measured !== pendingRate) {
      pendingRate = measured;
      pendingRateFrames = 0;
    }
    pendingRateFrames += 1;
    if (pendingRateFrames >= 30) {
      lockedRefreshRate = measured;
      pendingRate = null;
      pendingRateFrames = 0;
    }
  };

  const stopTicker = (track) => {
    if (frameId !== null) {
      window.cancelAnimationFrame(frameId);
      frameId = null;
    }
    lastFrameTime = null;
    offsetDevicePx = 0;
    if (track) {
      track.style.transform = "translate3d(0, 0, 0)";
    }
  };

  const step = (now) => {
    const track = getHeadlineTrack();
    if (!track || copyWidthDevicePx <= 0) {
      frameId = null;
      return;
    }

    if (lastFrameTime !== null) {
      const gap = now - lastFrameTime;
      // Ignore big gaps (background tab, a dropped frame) when measuring.
      if (gap > 4 && gap < 50) {
        recentFrameGaps.push(gap);
        if (recentFrameGaps.length > 30) {
          recentFrameGaps.shift();
        }
      }
    }
    lastFrameTime = now;
    updateRefreshRate();

    // The same whole number of device pixels every frame: no uneven steps.
    const pixelRatio = window.devicePixelRatio || 1;
    const stepDevicePx = Math.max(
      1,
      Math.round((TARGET_SPEED_PX_PER_SECOND * pixelRatio) / lockedRefreshRate)
    );

    offsetDevicePx += stepDevicePx;
    if (offsetDevicePx >= copyWidthDevicePx) {
      offsetDevicePx -= copyWidthDevicePx;
    }

    track.style.transform = `translate3d(${-offsetDevicePx / pixelRatio}px, 0, 0)`;
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
    // wrapping around makes the loop seamless. Rounded to whole device pixels.
    const pixelRatio = window.devicePixelRatio || 1;
    copyWidthDevicePx = Math.round(firstCopy.getBoundingClientRect().width * pixelRatio);
    if (copyWidthDevicePx <= 0) {
      stopTicker(track);
      return;
    }

    offsetDevicePx %= copyWidthDevicePx;
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
