(function () {
  const TICKER_ATTR = "data-wormburner-ticker";
  const TICKER_CACHE_KEY = "knuckleball.latestTickerText.v1";

  const getLatestTickerSourceArticle = (articles) => {
    const sorted = [...(articles || [])].sort((left, right) => {
      const leftTime = Date.parse(left.published_at || left.created_at || "") || 0;
      const rightTime = Date.parse(right.published_at || right.created_at || "") || 0;
      return rightTime - leftTime;
    });

    return sorted.find((article) => Boolean(getTickerParagraphText(article))) || null;
  };

  const getTickerParagraphText = (article) => {
    const html = String(article.body_html || "").trim();
    if (!html) {
      return "";
    }

    const container = document.createElement("div");
    container.innerHTML = html;

    const tickerParagraph = container.querySelector(`p[${TICKER_ATTR}="true"]`);
    if (!tickerParagraph) {
      return "";
    }

    return (tickerParagraph.textContent || "").replace(/\s+/g, " ").trim();
  };

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

  const updateHeadlineLinks = (article) => {
    const tickerParagraph = getTickerParagraphText(article);
    if (!tickerParagraph) {
      return;
    }

    writeCachedTickerText(tickerParagraph);
    renderTickerText(tickerParagraph);
  };

  const setupTicker = async () => {
    if (!window.KBData || typeof window.KBData.fetchPublishedArticles !== "function") {
      return;
    }

    if (!document.querySelector(".headline-track")) {
      return;
    }

    // Render cached ticker immediately to avoid any static flash on refresh.
    renderTickerText(readCachedTickerText());

    try {
      const articles = await window.KBData.fetchPublishedArticles();
      const latestTickerSource = getLatestTickerSourceArticle(articles);
      if (!latestTickerSource) {
        return;
      }

      updateHeadlineLinks(latestTickerSource);
    } catch (_error) {
      // Keep cached ticker text if live fetch fails.
    }
  };

  setupTicker();
})();
