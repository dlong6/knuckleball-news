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

  const isMobileViewport = () => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
  const getInitialVisibleCount = () =>
    isMobileViewport() ? MOBILE_INITIAL_VISIBLE_COUNT : DESKTOP_INITIAL_VISIBLE_COUNT;

  const getSortableTimestamp = (article) => {
    const timestamp = Date.parse(article.published_at || article.created_at || "");
    return Number.isFinite(timestamp) ? timestamp : 0;
  };

  const sortArticlesNewestFirst = (articles) =>
    [...articles].sort((left, right) => getSortableTimestamp(right) - getSortableTimestamp(left));

  const extractEmbeddedHomepageArticles = () => {
    if (!mainFeed) {
      return [];
    }

    return Array.from(mainFeed.querySelectorAll(".post-card"))
      .filter((card) => card.querySelector("h2 a"))
      .map((card, index) => {
      const title = card.querySelector("h2 a")?.textContent?.trim();
      if (!title) {
        return null;
      }
      const metaText = card.querySelector(".post-meta")?.textContent?.trim() || "";
      const metaMatch = metaText.match(/^By\s+(.+?)\s*\|\s*(.+)$/i);
      const author = metaMatch ? metaMatch[1].trim() : "Knuckleball News";
      const dateText = metaMatch ? metaMatch[2].trim() : "";
      const publishedAt = Number.isFinite(Date.parse(dateText))
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
        legacyUrl && legacyUrl !== "#" ? legacyUrl : `article.html?slug=${encodeURIComponent(slug)}`;

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

    return `article.html?slug=${encodeURIComponent(article.slug)}`;
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
    kicker.textContent = index === 0 ? "New Post" : "Recent Post";

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

  const renderCurrentPage = () => {
    const total = activeArticles.length;
    const pageItems = activeArticles.slice(0, Math.min(visibleCount, total));
    if (isMobileViewport()) {
      renderMobileArticleCollection(pageItems);
    } else {
      renderArticleCollection(pageItems);
    }
    syncAutoPagerState();
  };

  const setActiveArticles = (articles, resetVisible = true) => {
    activeArticles = articles;
    if (resetVisible) {
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

  const normalizeArticleTables = (root = document) => {
    Array.from(root.querySelectorAll(".post-body table")).forEach((table) => {
      let parent = table.parentElement;
      while (parent && parent !== root && !parent.classList.contains("stats-table-wrap")) {
        const tag = parent.tagName.toLowerCase();
        const canUnwrap = ["div", "figure", "section", "article", "span"].includes(tag);
        const hasOnlyTableChild = parent.children.length === 1 && parent.firstElementChild === table;
        if (!canUnwrap || !hasOnlyTableChild) {
          break;
        }

        const grandParent = parent.parentNode;
        if (!grandParent) {
          break;
        }

        grandParent.insertBefore(table, parent);
        parent.remove();
        parent = table.parentElement;
      }

      const formattingNodes = [
        table,
        ...table.querySelectorAll("thead, tbody, tfoot, tr, th, td, colgroup, col, caption, p, div, span, font, strong, em, b, i, u"),
      ];

      formattingNodes.forEach((node) => {
        node.removeAttribute("style");
        node.removeAttribute("class");
        node.removeAttribute("width");
        node.removeAttribute("height");
        node.removeAttribute("align");
        node.removeAttribute("valign");
        node.removeAttribute("bgcolor");
        node.removeAttribute("border");
        node.removeAttribute("cellpadding");
        node.removeAttribute("cellspacing");
      });

      table.querySelectorAll("colgroup, col, caption").forEach((node) => node.remove());
      table.querySelectorAll("th, td").forEach((cell) => {
        let text = (cell.textContent || "").replace(/\s+/g, " ").trim();
        if (cell.tagName === "TH") {
          text = text.replace(/\s*click to sort (ascending|descending)\s*/gi, " ").replace(/\s+/g, " ").trim();
          text = text.replace(/\s*\([^)]*\)\s*$/g, "").trim();
        }
        cell.innerHTML = text;
      });

      table.className = "stats-table";
      const columnCount = Array.from(table.querySelectorAll("tr")).reduce((maxCount, row) => {
        const cells = row.querySelectorAll("th, td").length;
        return Math.max(maxCount, cells);
      }, 0);
      table.classList.toggle("stats-table-wide", columnCount >= 6);

      if (!table.closest(".stats-table-wrap")) {
        const wrap = document.createElement("div");
        wrap.className = "stats-table-wrap";
        wrap.setAttribute("aria-label", "Article data table");
        table.parentNode?.insertBefore(wrap, table);
        wrap.appendChild(table);
      }
    });
  };

  const normalizePostBodyLinks = (root = document) => {
    Array.from(root.querySelectorAll(".post-body a[href]")).forEach((link) => {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    });
  };

  const normalizePostBodyTypography = (root = document) => {
    Array.from(root.querySelectorAll(".post-body")).forEach((body) => {
      // Strip legacy presentational attributes that can override site typography.
      body.querySelectorAll("*").forEach((node) => {
        if (!(node instanceof HTMLElement)) {
          return;
        }

        node.removeAttribute("style");
        node.removeAttribute("align");
        node.removeAttribute("face");
        node.removeAttribute("size");
        node.removeAttribute("color");
      });

      // Unwrap purely presentational inline wrappers.
      body.querySelectorAll("font, span").forEach((node) => {
        if (!(node instanceof HTMLElement)) {
          return;
        }

        while (node.firstChild) {
          node.parentNode?.insertBefore(node.firstChild, node);
        }
        node.remove();
      });

      const isJunkWrapper = (node) => {
        if (!(node instanceof HTMLElement)) {
          return false;
        }

        if (!node.matches("div, p, span")) {
          return false;
        }

        if (node.querySelector("img, picture, video, iframe, table, ul, ol, blockquote, h1, h2, h3, h4, h5, h6")) {
          return false;
        }

        const cleaned = (node.innerHTML || "")
          .replace(/<br\s*\/?>/gi, "")
          .replace(/&nbsp;/gi, "")
          .replace(/[\s\u200b\u200c\u200d\ufeff]/g, "");

        return cleaned.length === 0;
      };

      while (body.firstChild && (body.firstChild.nodeType === Node.TEXT_NODE && !(body.firstChild.textContent || "").trim())) {
        body.firstChild.remove();
      }

      while (body.lastChild && (body.lastChild.nodeType === Node.TEXT_NODE && !(body.lastChild.textContent || "").trim())) {
        body.lastChild.remove();
      }

      while (isJunkWrapper(body.firstElementChild)) {
        body.firstElementChild.remove();
      }

      while (isJunkWrapper(body.lastElementChild)) {
        body.lastElementChild.remove();
      }

      Array.from(body.querySelectorAll(":scope > div")).forEach((node) => {
        if (isJunkWrapper(node)) {
          node.remove();
          return;
        }

        const hasBlockChildren = Boolean(
          node.querySelector("p, div, ul, ol, table, blockquote, h1, h2, h3, h4, h5, h6")
        );
        if (!hasBlockChildren) {
          const paragraph = document.createElement("p");
          paragraph.innerHTML = node.innerHTML;
          node.replaceWith(paragraph);
        }
      });

      Array.from(body.querySelectorAll(":scope > br")).forEach((node) => {
        node.remove();
      });

      const firstNode = body.firstChild;
      if (firstNode && firstNode.nodeType === Node.TEXT_NODE) {
        const text = (firstNode.textContent || "").trim();
        if (text) {
          const paragraph = document.createElement("p");
          paragraph.textContent = text;
          firstNode.replaceWith(paragraph);
        }
      }

      while (body.firstElementChild && body.firstElementChild.tagName === "BR") {
        body.firstElementChild.remove();
      }

      while (body.lastElementChild && body.lastElementChild.tagName === "BR") {
        body.lastElementChild.remove();
      }

      body.querySelectorAll("[data-wormburner-ticker='true']").forEach((node) => {
        node.remove();
      });
    });
  };

  const enableAllTableTools = (root = document) => {
    normalizePostBodyTypography(root);
    normalizeArticleTables(root);
    normalizePostBodyLinks(root);
    Array.from(root.querySelectorAll(".stats-table")).forEach((table) => {
      enableTableSorting(table);
    });
  };

  const renderSupabaseHomepage = async () => {
    const embeddedArticles = extractEmbeddedHomepageArticles();
    const publishedArticles = await window.KBData.fetchPublishedArticles();
    allPublishedArticles = mergeHomepageArticles(publishedArticles, embeddedArticles);

    ensureAutoPager();
    syncSidebarLinks(allPublishedArticles);
    setActiveArticles(allPublishedArticles, true);
  };

  const setupFallbackHomepage = () => {
    allPublishedArticles = extractEmbeddedHomepageArticles();
    ensureAutoPager();
    syncSidebarLinks(allPublishedArticles);
    setActiveArticles(allPublishedArticles, true);
    hydrateAllLabels();
    enableAllTableTools(document);
  };

  const setupPage = async () => {
    bindSearch();
    bindInstagramShare();

    const mobileQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const rerenderForViewport = () => {
      renderCurrentPage();
    };

    if (typeof mobileQuery.addEventListener === "function") {
      mobileQuery.addEventListener("change", rerenderForViewport);
    } else if (typeof mobileQuery.addListener === "function") {
      mobileQuery.addListener(rerenderForViewport);
    }

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
