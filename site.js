(function () {
  const SIDEBAR_LINK_LIMIT = 12;
  const DESKTOP_INITIAL_VISIBLE_COUNT = 3;
  const MOBILE_INITIAL_VISIBLE_COUNT = 8;
  const AUTO_PAGE_SIZE = 3;
  const MOBILE_BREAKPOINT = 760;
  const CATEGORY_LABELS = {
    Eephus: "tag-eephus",
    Wormburner: "tag-wormburner",
    "Can of Corn": "tag-can-of-corn",
    "Extra Innings": "tag-extra-innings",
    Showcase: "tag-showcase",
  };

  const mainFeed = document.querySelector(".main-feed");
  const linksList = document.querySelector("#article-links-list");
  const searchInput = document.querySelector("#article-search");

  let allPublishedArticles = [];
  let activeArticles = [];
  let visibleCount = DESKTOP_INITIAL_VISIBLE_COUNT;
  let autoPagerSentinel = null;
  let autoPagerObserver = null;
  let isAutoPaging = false;

  // Which home-feed layout is on screen: "cards" (full articles) or "list"
  // (the phone headline list). It's chosen from the screen width when the
  // feed is built (page load or a new search) and is never swapped on
  // resize/rotate, so a reader never has the article taken away mid-read.
  let feedLayout = null;

  const isMobileViewport = () => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
  const getInitialVisibleCount = () =>
    isMobileViewport() ? MOBILE_INITIAL_VISIBLE_COUNT : DESKTOP_INITIAL_VISIBLE_COUNT;

  const getSortableTimestamp = (article) => {
    const timestamp = Date.parse(article.published_at || article.created_at || "");
    return Number.isFinite(timestamp) ? timestamp : 0;
  };

  const sortArticlesNewestFirst = (articles) =>
    [...articles].sort((left, right) => getSortableTimestamp(right) - getSortableTimestamp(left));

  // Articles already written into the page. The daily publish step pre-builds
  // the latest articles into the home page (marked data-prerendered) so there's
  // no "Loading" message; those are only used if the live list can't load, so
  // an article unpublished since the last build doesn't linger.
  const extractEmbeddedHomepageArticles = ({ includePrerendered = false } = {}) => {
    if (!mainFeed) {
      return [];
    }

    return Array.from(mainFeed.querySelectorAll(".post-card"))
      .filter((card) => card.querySelector("h2 a"))
      .filter((card) => includePrerendered || card.dataset.prerendered !== "true")
      .map((card, index) => {
      const title = card.querySelector("h2 a")?.textContent?.trim();
      if (!title) {
        return null;
      }
      const metaText = card.querySelector(".post-meta")?.textContent?.trim() || "";
      const metaMatch = metaText.match(/^By\s+(.+?)\s*\|\s*(.+)$/i);
      const author = metaMatch ? metaMatch[1].trim() : "Knuckleball News";
      const dateText = metaMatch ? metaMatch[2].trim() : "";
      const publishedAt = Number.isFinite(Date.parse(card.dataset.publishedAt || ""))
        ? new Date(card.dataset.publishedAt).toISOString()
        : Number.isFinite(Date.parse(dateText))
          ? new Date(dateText).toISOString()
          : "1970-01-01T00:00:00.000Z";

      const slugFromId = card.id && card.id !== "top-story" ? card.id : "";
      const slug = slugFromId || window.KBData.toSlug(title) || `legacy-article-${index + 1}`;

      const firstParagraph = Array.from(card.querySelectorAll("p")).find(
        (paragraph) =>
          !paragraph.classList.contains("post-kicker") &&
          !paragraph.classList.contains("post-meta") &&
          !paragraph.classList.contains("post-actions") &&
          !paragraph.classList.contains("table-caption")
      );

      const bodyRoot = card.cloneNode(true);
      bodyRoot.querySelectorAll(".post-kicker, h2, .post-meta-row, .post-actions").forEach((node) => {
        node.remove();
      });
      const bodyHtml = bodyRoot.innerHTML.trim();

      const legacyUrl = card.querySelector("h2 a")?.getAttribute("href") || "";
      const resolvedUrl =
        legacyUrl && legacyUrl !== "#" ? legacyUrl : `/articles/${encodeURIComponent(slug)}/`;

      return {
        id: null,
        slug,
        title,
        author,
        category: card.dataset.category || "",
        is_series: card.dataset.series === "true",
        teams: window.KBData.splitList(card.dataset.teams || ""),
        summary: firstParagraph?.textContent?.trim() || "",
        body_html: bodyHtml,
        status: "published",
        published_at: publishedAt,
        created_at: null,
        updated_at: null,
        url: resolvedUrl,
      };
    })
      .filter(Boolean);
  };

  const mergeHomepageArticles = (primaryArticles, fallbackArticles) => {
    const seenSlugs = new Set(primaryArticles.map((article) => article.slug));
    const merged = [...primaryArticles];

    fallbackArticles.forEach((article) => {
      if (seenSlugs.has(article.slug)) {
        return;
      }

      seenSlugs.add(article.slug);
      merged.push(article);
    });

    return sortArticlesNewestFirst(merged);
  };

  const createTag = (text, className) => {
    const tag = document.createElement("span");
    tag.className = `tag-chip ${className}`;
    tag.textContent = text;
    return tag;
  };

  const createCategoryTagLink = (category) => {
    const tag = document.createElement("a");
    tag.className = `tag-chip ${CATEGORY_LABELS[category]}`;
    tag.href = `category.html?category=${encodeURIComponent(category)}`;
    tag.target = "_blank";
    tag.rel = "noopener noreferrer";
    tag.textContent = category;
    return tag;
  };

  const createSeriesTagLink = () => {
    const tag = document.createElement("a");
    tag.className = "tag-chip tag-series";
    tag.href = "category.html?series=true";
    tag.target = "_blank";
    tag.rel = "noopener noreferrer";
    tag.textContent = "Series";
    return tag;
  };

  const createTeamTagLink = (team) => {
    const tag = document.createElement("a");
    tag.className = "tag-chip tag-team";
    tag.classList.add(getTeamTagClassName(team));
    tag.href = `team.html?team=${encodeURIComponent(team)}`;
    tag.target = "_blank";
    tag.rel = "noopener noreferrer";
    tag.textContent = team;
    return tag;
  };

  const getTeamTagClassName = (team) => `tag-team-${window.KBData.toSlug(team)}`;

  const applyTeamLabelSectionState = (section, expanded) => {
    const toggle = section.querySelector(".team-labels-toggle");
    const wrap = section.querySelector(".post-team-labels");
    if (!toggle || !wrap) {
      return;
    }

    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = `Team Labels ${expanded ? "^" : ">"}`;
    wrap.hidden = !expanded;
  };

  const ensureTeamLabelSection = (post) => {
    let wrap = post.querySelector(".post-team-labels");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "post-team-labels";
      wrap.setAttribute("aria-label", "Team labels");
    }

    let section = post.querySelector(".team-labels-section");
    if (!section) {
      section = document.createElement("section");
      section.className = "team-labels-section";

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "team-labels-toggle";

      section.appendChild(toggle);
      section.appendChild(wrap);
      post.appendChild(section);

      toggle.addEventListener("click", () => {
        const expanded = toggle.getAttribute("aria-expanded") === "true";
        applyTeamLabelSectionState(section, !expanded);
      });
    } else if (!section.contains(wrap)) {
      section.appendChild(wrap);
    }

    applyTeamLabelSectionState(section, false);
    return { section, wrap };
  };

  const ensureTeamLabelGrid = (post) => ensureTeamLabelSection(post).wrap;

  const createArticleUrl = (article) => {
    const explicitUrl = String(article.url || "").trim();
    if (explicitUrl && explicitUrl !== "#") {
      return explicitUrl;
    }

    return `/articles/${encodeURIComponent(article.slug)}/`;
  };

  const resolveArticleUrl = (article) =>
    new URL(createArticleUrl(article), window.location.href).toString();

  const createShareActions = (article) => {
    const wrap = document.createElement("div");
    const label = document.createElement("span");
    const facebook = document.createElement("a");
    const twitter = document.createElement("a");
    const instagram = document.createElement("a");
    const email = document.createElement("a");

    const articleUrl = resolveArticleUrl(article);
    const shareText = `${article.title} | Knuckleball News`;

    wrap.className = "post-share";

    label.className = "post-share-label";
    label.textContent = "Share:";

    facebook.className = "post-share-link";
    facebook.target = "_blank";
    facebook.rel = "noopener noreferrer";
    facebook.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(articleUrl)}`;
    facebook.textContent = "Facebook";

    twitter.className = "post-share-link";
    twitter.target = "_blank";
    twitter.rel = "noopener noreferrer";
    twitter.href = `https://twitter.com/intent/tweet?url=${encodeURIComponent(articleUrl)}&text=${encodeURIComponent(
      shareText
    )}`;
    twitter.textContent = "Twitter";

    instagram.className = "post-share-link";
    instagram.target = "_blank";
    instagram.rel = "noopener noreferrer";
    instagram.href = "https://www.instagram.com/";
    instagram.textContent = "Instagram";
    instagram.dataset.shareInstagram = "true";
    instagram.dataset.shareUrl = articleUrl;
    instagram.dataset.shareTitle = shareText;
    instagram.title = "Opens Instagram and copies the article link for easy paste.";

    email.className = "post-share-link";
    email.href = `mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(`${shareText}\n\n${articleUrl}`)}`;
    email.textContent = "Email";

    wrap.appendChild(label);
    wrap.appendChild(facebook);
    wrap.appendChild(twitter);
    wrap.appendChild(instagram);
    wrap.appendChild(email);

    return wrap;
  };

  const getTextExcerpt = (article, maxLength = 260) => {
    const source = article.summary || window.KBData.htmlToPlainText(article.body_html || "");
    const singleLine = source.replace(/\s+/g, " ").trim();

    if (singleLine.length <= maxLength) {
      return singleLine;
    }

    return `${singleLine.slice(0, maxLength).trim()}...`;
  };

  const buildArticleCard = (article, index) => {
    const card = document.createElement("article");
    const titleLink = document.createElement("a");
    const heading = document.createElement("h2");
    const kicker = document.createElement("p");
    const metaRow = document.createElement("div");
    const meta = document.createElement("p");
    const labelsWrap = document.createElement("div");
    const body = document.createElement("div");

    card.className = "post-card";
    card.id = article.slug;
    card.dataset.category = article.category || "";
    card.dataset.series = article.is_series ? "true" : "false";
    card.dataset.teams = (article.teams || []).join(", ");

    kicker.className = "post-kicker";
    kicker.textContent = index === 0 ? "New Post" : "News Article";

    heading.className = "post-title";
    titleLink.href = createArticleUrl(article);
    titleLink.textContent = article.title;
    heading.appendChild(titleLink);

    metaRow.className = "post-meta-row";
    meta.className = "post-meta";
    meta.textContent = `By ${article.author || "Knuckleball News"} | ${window.KBData.formatDate(
      article.published_at
    )}`;

    labelsWrap.className = "post-labels";
    labelsWrap.setAttribute("aria-label", "Article labels");

    metaRow.appendChild(meta);
    metaRow.appendChild(labelsWrap);

    body.className = "post-body";
    if (article.body_html) {
      body.innerHTML = article.body_html;
    } else {
      const fallbackParagraph = document.createElement("p");
      fallbackParagraph.textContent = getTextExcerpt(article);
      body.appendChild(fallbackParagraph);
    }

    card.appendChild(kicker);
    card.appendChild(heading);
    card.appendChild(metaRow);
    card.appendChild(body);
    card.appendChild(createShareActions(article));

    return card;
  };

  const bindInstagramShare = () => {
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const trigger = target ? target.closest("a[data-share-instagram='true']") : null;

      if (!trigger) {
        return;
      }

      event.preventDefault();

      const shareUrl = trigger.dataset.shareUrl;
      const shareTitle = trigger.dataset.shareTitle || document.title;
      if (!shareUrl) {
        return;
      }

      if (navigator.share) {
        event.preventDefault();
        navigator
          .share({
            title: shareTitle,
            url: shareUrl,
          })
          .catch(() => {});
        return;
      }

      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard
          .writeText(shareUrl)
          .then(() => {
            window.alert("Article link copied. Paste it into your Instagram post, story, or bio link.");
            window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
          })
          .catch(() => {
            window.prompt("Copy this link to share on Instagram", shareUrl);
            window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
          });
        return;
      }

      window.prompt("Copy this link to share on Instagram", shareUrl);
      window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
    });
  };

  const hydratePostLabels = (post) => {
    const labelsWrap = post.querySelector(".post-labels");
    const { section: teamLabelsSection, wrap: teamLabelsWrap } = ensureTeamLabelSection(post);
    const category = (post.dataset.category || "").trim();
    const isSeries = post.dataset.series === "true";
    const teams = window.KBData
      .splitList(post.dataset.teams || "")
      .filter((team) => window.KBData.TEAM_LABELS.includes(team))
      .sort((a, b) => a.localeCompare(b));

    if (!labelsWrap) {
      return;
    }

    labelsWrap.innerHTML = "";

    if (category && CATEGORY_LABELS[category]) {
      labelsWrap.appendChild(createCategoryTagLink(category));
    }

    if (isSeries) {
      labelsWrap.appendChild(createSeriesTagLink());
    }

    teamLabelsWrap.innerHTML = "";
    teams.forEach((team) => {
      const tag = createTeamTagLink(team);
      teamLabelsWrap.appendChild(tag);
    });

    labelsWrap.hidden = !labelsWrap.children.length;
    teamLabelsSection.hidden = !teamLabelsWrap.children.length;
    applyTeamLabelSectionState(teamLabelsSection, false);
  };

  const hydrateAllLabels = () => {
    Array.from(document.querySelectorAll(".post-card")).forEach(hydratePostLabels);
  };

  const syncSidebarLinks = (articles) => {
    if (!linksList) {
      return;
    }

    linksList.innerHTML = "";

    articles.slice(0, SIDEBAR_LINK_LIMIT).forEach((article) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = createArticleUrl(article);
      a.textContent = article.title;
      li.appendChild(a);
      linksList.appendChild(li);
    });
  };

  const renderArticleCollection = (articles) => {
    if (!mainFeed) {
      return;
    }

    mainFeed.innerHTML = "";

    if (!articles.length) {
      const hasSearchQuery = Boolean(searchInput?.value?.trim());
      const emptyHeading = hasSearchQuery
        ? "No articles matched your search."
        : "No published articles yet.";
      const empty = document.createElement("article");
      empty.className = "post-card";
      empty.innerHTML = `<p class='post-kicker'>No Results</p><h2>${emptyHeading}</h2>`;
      mainFeed.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    articles.forEach((article, index) => {
      fragment.appendChild(buildArticleCard(article, index));
    });

    mainFeed.appendChild(fragment);
    hydrateAllLabels();
    enableAllTableTools(mainFeed);
  };

  const renderMobileArticleCollection = (articles) => {
    if (!mainFeed) {
      return;
    }

    mainFeed.innerHTML = "";

    if (!articles.length) {
      const hasSearchQuery = Boolean(searchInput?.value?.trim());
      const emptyHeading = hasSearchQuery
        ? "No articles matched your search."
        : "No published articles yet.";
      const empty = document.createElement("article");
      empty.className = "post-card";
      empty.innerHTML = `<p class='post-kicker'>No Results</p><h2>${emptyHeading}</h2>`;
      mainFeed.appendChild(empty);
      return;
    }

    const list = document.createElement("ol");
    list.className = "mobile-latest-list";

    articles.forEach((article) => {
      const item = document.createElement("li");
      item.className = "mobile-latest-item";

      const title = document.createElement("a");
      title.className = "mobile-latest-link";
      title.href = createArticleUrl(article);
      title.textContent = article.title;

      const meta = document.createElement("p");
      meta.className = "mobile-latest-meta";
      meta.textContent = `${window.KBData.formatDate(article.published_at)} | ${article.author || "Knuckleball News"}`;

      item.appendChild(title);
      item.appendChild(meta);
      list.appendChild(item);
    });

    mainFeed.appendChild(list);
  };

  const ensureAutoPager = () => {
    if (!mainFeed || autoPagerSentinel) {
      return;
    }

    autoPagerSentinel = document.createElement("div");
    autoPagerSentinel.className = "feed-auto-pager";
    autoPagerSentinel.setAttribute("aria-hidden", "true");
    mainFeed.insertAdjacentElement("afterend", autoPagerSentinel);

    if (!("IntersectionObserver" in window)) {
      return;
    }

    autoPagerObserver = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting || isAutoPaging) {
          return;
        }

        const total = activeArticles.length;
        if (visibleCount >= total) {
          return;
        }

        isAutoPaging = true;
        visibleCount = Math.min(visibleCount + AUTO_PAGE_SIZE, total);
        renderCurrentPage();
        window.requestAnimationFrame(() => {
          isAutoPaging = false;
        });
      },
      {
        root: null,
        rootMargin: "0px 0px 360px 0px",
        threshold: 0,
      }
    );

    autoPagerObserver.observe(autoPagerSentinel);
  };

  const syncAutoPagerState = () => {
    if (!autoPagerSentinel) {
      return;
    }

    const total = activeArticles.length;
    autoPagerSentinel.hidden = !activeArticles.length || visibleCount >= total;
  };

  const getViewportLayout = () => (isMobileViewport() ? "list" : "cards");

  const renderCurrentPage = () => {
    const total = activeArticles.length;
    const pageItems = activeArticles.slice(0, Math.min(visibleCount, total));
    if (!feedLayout) {
      feedLayout = getViewportLayout();
    }
    if (feedLayout === "list") {
      renderMobileArticleCollection(pageItems);
    } else {
      renderArticleCollection(pageItems);
    }
    syncAutoPagerState();
  };

  const setActiveArticles = (articles, resetVisible = true) => {
    activeArticles = articles;
    if (resetVisible) {
      // A fresh list (first load or a new search) starts at the top, so it
      // uses whichever layout fits the screen right now.
      feedLayout = getViewportLayout();
      visibleCount = getInitialVisibleCount();
    }
    renderCurrentPage();
  };

  const searchPublishedArticles = (query) => {
    const terms = query
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (!terms.length) {
      return allPublishedArticles;
    }

    return allPublishedArticles.filter((article) => {
      const source = [
        article.title,
        article.author,
        article.category,
        article.is_series ? "series" : "",
        article.summary,
        (article.teams || []).join(" "),
        window.KBData.htmlToPlainText(article.body_html || ""),
      ]
        .join(" ")
        .toLowerCase();

      return terms.every((term) => source.includes(term));
    });
  };

  const bindSearch = () => {
    if (!searchInput) {
      return;
    }

    searchInput.form?.addEventListener("submit", (event) => {
      event.preventDefault();
    });

    searchInput.addEventListener("input", () => {
      const results = searchPublishedArticles(searchInput.value);
      setActiveArticles(results, true);
    });
  };

  const enableTableSorting = (table) => {
    if (!table || !table.tBodies.length) {
      return;
    }

    const tbody = table.tBodies[0];
    const headers = Array.from(table.querySelectorAll("thead th"));
    let activeColumn = -1;
    let activeDirection = "ascending";

    const parseSortableValue = (rawValue) => {
      const cleaned = rawValue.trim().replace(/,/g, "");
      const normalized = cleaned.startsWith(".") ? `0${cleaned}` : cleaned;
      const numericPattern = /^-?\d+(\.\d+)?$/;

      if (numericPattern.test(normalized)) {
        return { type: "number", value: Number(normalized) };
      }

      return { type: "text", value: rawValue.trim().toLowerCase() };
    };

    const getCellText = (row, columnIndex) => {
      const cell = row.children[columnIndex];
      return cell ? cell.textContent || "" : "";
    };

    const setSortState = (header, direction) => {
      headers.forEach((th) => {
        th.setAttribute("aria-sort", "none");
        th.classList.remove("sort-asc", "sort-desc");
      });

      header.setAttribute("aria-sort", direction);
      header.classList.add(direction === "ascending" ? "sort-asc" : "sort-desc");
    };

    const sortByColumn = (columnIndex, header) => {
      const rows = Array.from(tbody.rows);
      const direction =
        activeColumn === columnIndex && activeDirection === "ascending"
          ? "descending"
          : "ascending";

      rows.sort((rowA, rowB) => {
        const valueA = parseSortableValue(getCellText(rowA, columnIndex));
        const valueB = parseSortableValue(getCellText(rowB, columnIndex));

        let comparison = 0;

        if (valueA.type === "number" && valueB.type === "number") {
          comparison = valueA.value - valueB.value;
        } else {
          comparison = String(valueA.value).localeCompare(String(valueB.value), undefined, {
            numeric: true,
            sensitivity: "base",
          });
        }

        return direction === "ascending" ? comparison : -comparison;
      });

      const fragment = document.createDocumentFragment();
      rows.forEach((row) => fragment.appendChild(row));
      tbody.appendChild(fragment);

      activeColumn = columnIndex;
      activeDirection = direction;
      setSortState(header, direction);
    };

    headers.forEach((header, index) => {
      header.classList.add("sortable-header");
      header.setAttribute("aria-sort", "none");
      header.tabIndex = 0;

      header.addEventListener("click", () => {
        sortByColumn(index, header);
      });

      header.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          sortByColumn(index, header);
        }
      });
    });
  };

  // ---------------------------------------------------------------------
  // Post-body sanitizer.
  //
  // Earlier versions of this file tried to detect and fix up specific
  // shapes of messy pasted content (deeply-nested wrapper divs, stray
  // presentational attributes, "junk" empty wrappers at the start/end of an
  // article). That reactive, pattern-matching approach kept finding new
  // gaps — most seriously, the div-unwrapping pass could silently drop an
  // entire paragraph if its wrapper didn't exactly match the expected
  // shape, which is exactly what happened to a paragraph in one article.
  //
  // This sanitizer instead REBUILDS each article body from scratch using
  // only a small, fixed set of allowed elements (paragraphs, bold/italic/
  // underline/strike, links, images, lists, tables, headings, and the
  // explicit "table-caption" class). Every node in the source is visited
  // exactly once and is either emitted as one of those allowed elements,
  // folded into the current paragraph as plain text/inline formatting, or
  // (for an unrecognized wrapper) unwrapped so its CONTENTS still get
  // processed. Nothing is ever skipped wholesale, so content can't
  // silently disappear. This is the same approach used in the admin
  // editor when an article is saved, so articles saved going forward
  // arrive here already in this shape — this pass is mainly a safety net
  // for older articles saved before that existed.
  const SANITIZE_INLINE_MARKS = { strong: "strong", b: "strong", em: "em", i: "em", u: "u", s: "s", strike: "s", del: "s" };
  const SANITIZE_BLOCK_BOUNDARY_TAGS = new Set(["p", "div", "section", "article", "blockquote", "header", "footer", "figure"]);
  const LEGACY_TICKER_ATTR = "data-wormburner-ticker";

  const sanitizeWalkInlineChildrenInto = (node, container) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.textContent) {
          container.appendChild(document.createTextNode(child.textContent));
        }
        return;
      }

      if (child.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      const tag = child.tagName.toLowerCase();

      if (tag === "br") {
        container.appendChild(document.createElement("br"));
        return;
      }

      if (SANITIZE_INLINE_MARKS[tag]) {
        const clean = document.createElement(SANITIZE_INLINE_MARKS[tag]);
        container.appendChild(clean);
        sanitizeWalkInlineChildrenInto(child, clean);
        return;
      }

      if (tag === "a") {
        const href = child.getAttribute("href") || "";
        if (href) {
          const clean = document.createElement("a");
          clean.setAttribute("href", href);
          clean.setAttribute("target", "_blank");
          clean.setAttribute("rel", "noopener noreferrer");
          container.appendChild(clean);
          sanitizeWalkInlineChildrenInto(child, clean);
        } else {
          sanitizeWalkInlineChildrenInto(child, container);
        }
        return;
      }

      if (tag === "img") {
        const src = child.getAttribute("src") || "";
        if (src) {
          const clean = document.createElement("img");
          clean.setAttribute("src", src);
          clean.setAttribute("alt", child.getAttribute("alt") || "");
          clean.className = "editor-image";
          container.appendChild(clean);
        }
        return;
      }

      sanitizeWalkInlineChildrenInto(child, container);
    });
  };

  const sanitizeBuildCleanTable = (table) => {
    const buildSection = (sourceSection, tagName) => {
      const rows = sourceSection ? Array.from(sourceSection.children).filter((c) => c.tagName === "TR") : [];
      if (!rows.length) {
        return null;
      }

      const section = document.createElement(tagName);
      rows.forEach((row) => {
        const cleanRow = document.createElement("tr");
        Array.from(row.children)
          .filter((c) => c.tagName === "TD" || c.tagName === "TH")
          .forEach((cell) => {
            const cleanCell = document.createElement(cell.tagName.toLowerCase());
            let text = (cell.textContent || "").replace(/\s+/g, " ").trim();
            if (cell.tagName === "TH") {
              text = text.replace(/\s*click to sort (ascending|descending)\s*/gi, " ").replace(/\s+/g, " ").trim();
              text = text.replace(/\s*\([^)]*\)\s*$/g, "").trim();
              cleanCell.setAttribute("scope", "col");
            }
            cleanCell.textContent = text;
            cleanRow.appendChild(cleanCell);
          });
        if (cleanRow.children.length) {
          section.appendChild(cleanRow);
        }
      });
      return section.children.length ? section : null;
    };

    const cleanTable = document.createElement("table");
    cleanTable.className = "stats-table";

    const theadSource = table.querySelector("thead");
    const tbodySource = table.querySelector("tbody") || table;
    const cleanThead = buildSection(theadSource, "thead");
    const cleanTbody = buildSection(tbodySource, "tbody");

    if (!cleanThead && cleanTbody && cleanTbody.firstElementChild) {
      const firstRow = cleanTbody.firstElementChild;
      const allHeaderCells = Array.from(firstRow.children).every((c) => c.tagName === "TH");
      if (allHeaderCells) {
        const promotedThead = document.createElement("thead");
        promotedThead.appendChild(firstRow);
        cleanTable.appendChild(promotedThead);
      }
    } else if (cleanThead) {
      cleanTable.appendChild(cleanThead);
    }

    if (cleanTbody && cleanTbody.children.length) {
      cleanTable.appendChild(cleanTbody);
    }

    if (!cleanTable.querySelector("tr")) {
      return null;
    }

    const columnCount = Array.from(cleanTable.querySelectorAll("tr")).reduce(
      (maxCount, row) => Math.max(maxCount, row.children.length),
      0
    );
    cleanTable.classList.toggle("stats-table-wide", columnCount >= 6);

    const wrap = document.createElement("div");
    wrap.className = "stats-table-wrap";
    wrap.setAttribute("aria-label", "Article data table");
    wrap.appendChild(cleanTable);
    return wrap;
  };

  const sanitizeBuildCleanList = (listNode, tagName) => {
    const clean = document.createElement(tagName);
    Array.from(listNode.children)
      .filter((c) => c.tagName === "LI")
      .forEach((li) => {
        const cleanLi = document.createElement("li");
        sanitizeWalkInlineChildrenInto(li, cleanLi);
        if (cleanLi.textContent.trim()) {
          clean.appendChild(cleanLi);
        }
      });
    return clean.children.length ? clean : null;
  };

  const sanitizeCreateParagraphState = (output) => {
    let currentParagraph = null;
    return {
      getParagraph() {
        if (!currentParagraph) {
          currentParagraph = document.createElement("p");
        }
        return currentParagraph;
      },
      flush() {
        if (currentParagraph && currentParagraph.textContent.replace(/ /g, " ").trim() !== "") {
          output.appendChild(currentParagraph);
        }
        currentParagraph = null;
      },
    };
  };

  const sanitizeAppendInline = (node, state) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent) {
        state.getParagraph().appendChild(document.createTextNode(node.textContent));
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const tag = node.tagName.toLowerCase();

    if (tag === "br") {
      state.getParagraph().appendChild(document.createElement("br"));
      return;
    }

    if (SANITIZE_INLINE_MARKS[tag]) {
      const clean = document.createElement(SANITIZE_INLINE_MARKS[tag]);
      state.getParagraph().appendChild(clean);
      sanitizeWalkInlineChildrenInto(node, clean);
      return;
    }

    if (tag === "a") {
      const href = node.getAttribute("href") || "";
      if (href) {
        const clean = document.createElement("a");
        clean.setAttribute("href", href);
        clean.setAttribute("target", "_blank");
        clean.setAttribute("rel", "noopener noreferrer");
        state.getParagraph().appendChild(clean);
        sanitizeWalkInlineChildrenInto(node, clean);
      } else {
        Array.from(node.childNodes).forEach((child) => sanitizeAppendInline(child, state));
      }
      return;
    }

    if (tag === "img") {
      const src = node.getAttribute("src") || "";
      if (src) {
        const clean = document.createElement("img");
        clean.setAttribute("src", src);
        clean.setAttribute("alt", node.getAttribute("alt") || "");
        clean.className = "editor-image";
        state.getParagraph().appendChild(clean);
      }
      return;
    }

    Array.from(node.childNodes).forEach((child) => sanitizeAppendInline(child, state));
  };

  const sanitizeProcessChildren = (sourceNode, output, state) => {
    Array.from(sourceNode.childNodes).forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        sanitizeAppendInline(child, state);
        return;
      }

      if (child.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      const tag = child.tagName.toLowerCase();

      if (tag === "table") {
        state.flush();
        const clean = sanitizeBuildCleanTable(child);
        if (clean) {
          output.appendChild(clean);
        }
        return;
      }

      if (tag === "ul" || tag === "ol") {
        state.flush();
        const clean = sanitizeBuildCleanList(child, tag);
        if (clean) {
          output.appendChild(clean);
        }
        return;
      }

      if (/^h[1-6]$/.test(tag)) {
        state.flush();
        const heading = document.createElement(tag);
        sanitizeWalkInlineChildrenInto(child, heading);
        if (heading.textContent.trim()) {
          output.appendChild(heading);
        }
        return;
      }

      if (tag === "p" && child.classList.contains("table-caption")) {
        state.flush();
        const caption = document.createElement("p");
        caption.className = "table-caption";
        sanitizeWalkInlineChildrenInto(child, caption);
        if (caption.textContent.trim()) {
          output.appendChild(caption);
        }
        return;
      }

      if (SANITIZE_BLOCK_BOUNDARY_TAGS.has(tag)) {
        state.flush();
        sanitizeProcessChildren(child, output, state);
        state.flush();
        return;
      }

      sanitizeAppendInline(child, state);
    });
  };

  const sanitizePostBodyHtml = (html) => {
    const source = document.createElement("div");
    source.innerHTML = String(html || "");
    const output = document.createElement("div");
    const state = sanitizeCreateParagraphState(output);
    sanitizeProcessChildren(source, output, state);
    state.flush();
    return output.innerHTML.trim();
  };

  const normalizePostBodyTypography = (root = document) => {
    Array.from(root.querySelectorAll(".post-body")).forEach((body) => {
      body.querySelectorAll(`[${LEGACY_TICKER_ATTR}="true"]`).forEach((node) => node.remove());
      body.innerHTML = sanitizePostBodyHtml(body.innerHTML);
    });
  };

  const enableAllTableTools = (root = document) => {
    normalizePostBodyTypography(root);
    Array.from(root.querySelectorAll(".stats-table")).forEach((table) => {
      enableTableSorting(table);
    });
  };

  const renderSupabaseHomepage = async () => {
    const embeddedArticles = extractEmbeddedHomepageArticles();
    const prerenderedArticles = extractEmbeddedHomepageArticles({ includePrerendered: true });
    const publishedArticles = await window.KBData.fetchPublishedArticles();
    // If the live list came back empty (e.g. a Supabase hiccup on a first
    // visit), keep showing the pre-built articles instead of "No articles".
    allPublishedArticles = publishedArticles.length
      ? mergeHomepageArticles(publishedArticles, embeddedArticles)
      : sortArticlesNewestFirst(prerenderedArticles);

    ensureAutoPager();
    syncSidebarLinks(allPublishedArticles);
    setActiveArticles(allPublishedArticles, true);
  };

  const setupFallbackHomepage = () => {
    allPublishedArticles = sortArticlesNewestFirst(extractEmbeddedHomepageArticles({ includePrerendered: true }));
    ensureAutoPager();
    syncSidebarLinks(allPublishedArticles);
    setActiveArticles(allPublishedArticles, true);
    hydrateAllLabels();
    enableAllTableTools(document);
  };

  // ---------- Keeping the reader's place ----------
  // When the window is resized or a phone is rotated, text reflows and the
  // paragraph being read can jump up or down the page. This remembers which
  // block of the feed is at the top of the window (and how far into it the
  // reader is), then scrolls it back to the same spot after the reflow.
  const keepReadingPlace = () => {
    if (!mainFeed) {
      return;
    }

    const ANCHOR_SELECTOR = [
      ".post-card > .post-kicker",
      ".post-card > h2",
      ".post-card > .post-meta-row",
      ".post-body > *",
      ".mobile-latest-item",
    ].join(", ");

    let anchor = null;
    let widthAtAnchor = window.innerWidth;
    let heightAtAnchor = window.innerHeight;
    let pending = false;

    const getBlocks = () => Array.from(mainFeed.querySelectorAll(ANCHOR_SELECTOR));

    const recordAnchor = () => {
      anchor = null;
      widthAtAnchor = window.innerWidth;
      heightAtAnchor = window.innerHeight;
      const blocks = getBlocks();
      for (let index = 0; index < blocks.length; index += 1) {
        const rect = blocks[index].getBoundingClientRect();
        if (rect.bottom > 0 && rect.height > 0) {
          anchor = {
            index,
            tag: blocks[index].tagName,
            top: rect.top,
            // How far into this block the top of the window is (0 to 1).
            progress: rect.top < 0 ? -rect.top / rect.height : 0,
          };
          return;
        }
      }
    };

    const restoreAnchor = () => {
      if (!anchor) {
        return;
      }
      const block = getBlocks()[anchor.index];
      if (!block || block.tagName !== anchor.tag) {
        return;
      }
      const rect = block.getBoundingClientRect();
      const shift = anchor.top < 0 ? rect.top + anchor.progress * rect.height : rect.top - anchor.top;
      if (Math.abs(shift) >= 1) {
        window.scrollBy(0, shift);
      }
    };

    // Scroll events fired while the window is mid-resize come from the
    // reflow itself, not the reader, so they must not overwrite the anchor.
    const isResizing = () =>
      window.innerWidth !== widthAtAnchor || window.innerHeight !== heightAtAnchor;

    window.addEventListener(
      "scroll",
      () => {
        if (pending || isResizing()) {
          return;
        }
        pending = true;
        window.requestAnimationFrame(() => {
          pending = false;
          if (!isResizing()) {
            recordAnchor();
          }
        });
      },
      { passive: true }
    );

    window.addEventListener("resize", () => {
      window.requestAnimationFrame(() => {
        restoreAnchor();
        recordAnchor();
      });
    });

    recordAnchor();
  };

  const setupPage = async () => {
    bindSearch();
    bindInstagramShare();

    // The feed layout (full articles or phone headline list) is picked when
    // the page loads and is not swapped on resize or rotate, so a reader
    // never loses the article they're in. keepReadingPlace holds their spot
    // while the text reflows.
    keepReadingPlace();

    if (!window.KBData.hasSupabaseConfig) {
      setupFallbackHomepage();
      return;
    }

    try {
      await renderSupabaseHomepage();
    } catch (error) {
      console.error("Unable to load published articles", error);
      setupFallbackHomepage();
      return;
    }

    enableAllTableTools(mainFeed || document);
  };

  setupPage();
})();
