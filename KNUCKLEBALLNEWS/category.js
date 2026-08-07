(function () {
  const CATEGORY_LABELS = {
    Eephus: "tag-eephus",
    Wormburner: "tag-wormburner",
    "Can of Corn": "tag-can-of-corn",
    "Extra Innings": "tag-extra-innings",
    Showcase: "tag-showcase",
  };

  const titleNode = document.querySelector("#category-page-title");
  const subtitleNode = document.querySelector("#category-page-subtitle");
  const articleList = document.querySelector("#category-article-list");
  const categoryPickerLinks = document.querySelector("#category-picker-links");

  const getSortableTimestamp = (article) => {
    const timestamp = Date.parse(article.published_at || article.created_at || "");
    return Number.isFinite(timestamp) ? timestamp : 0;
  };

  const sortArticlesNewestFirst = (articles) =>
    [...articles].sort((left, right) => getSortableTimestamp(right) - getSortableTimestamp(left));

  const createArticleUrl = (article) => {
    const explicitUrl = String(article.url || "").trim();
    if (explicitUrl && explicitUrl !== "#") {
      return explicitUrl;
    }

    return `article.html?slug=${encodeURIComponent(article.slug)}`;
  };

  const resolveArticleUrl = (article) =>
    new URL(createArticleUrl(article), window.location.href).toString();

  const getTeamTagClassName = (team) => `tag-team-${window.KBData.toSlug(team)}`;

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

  const createTeamLabelsSection = (teams) => {
    const section = document.createElement("section");
    section.className = "team-labels-section";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "team-labels-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "Team Labels >";

    const wrap = document.createElement("div");
    wrap.className = "post-team-labels";
    wrap.setAttribute("aria-label", "Team labels");
    wrap.hidden = true;

    teams.forEach((team) => {
      const tag = createTeamTagLink(team);
      wrap.appendChild(tag);
    });

    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      toggle.textContent = `Team Labels ${expanded ? ">" : "^"}`;
      wrap.hidden = expanded;
    });

    section.hidden = !teams.length;
    section.appendChild(toggle);
    section.appendChild(wrap);
    return section;
  };

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

  const normalizePostBodyLinks = (root) => {
    if (!root) {
      return;
    }

    root.querySelectorAll(".post-body a[href]").forEach((link) => {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    });
  };

  const getCategoryStateFromQuery = () => {
    const params = new URLSearchParams(window.location.search);
    const isSeries = params.get("series") === "true";
    const requestedCategory = String(params.get("category") || "").trim();

    if (isSeries) {
      return {
        mode: "series",
        category: "",
      };
    }

    if (!requestedCategory) {
      return {
        mode: "none",
        category: "",
      };
    }

    const requestedSlug = window.KBData.toSlug(requestedCategory);
    const knownCategory =
      window.KBData.CATEGORY_OPTIONS.find((category) => window.KBData.toSlug(category) === requestedSlug) || "";

    return {
      mode: knownCategory ? "category" : "none",
      category: knownCategory,
    };
  };

  const setHeader = (state, count) => {
    if (!titleNode || !subtitleNode) {
      return;
    }

    if (state.mode === "series") {
      titleNode.textContent = "Series Coverage";
      subtitleNode.textContent = `${count} series article${count === 1 ? "" : "s"} found.`;
      document.title = "Series Articles | Knuckleball News";
      return;
    }

    if (state.mode === "category") {
      titleNode.textContent = `${state.category} Coverage`;
      subtitleNode.textContent = `${count} article${count === 1 ? "" : "s"} in ${state.category}.`;
      document.title = `${state.category} Articles | Knuckleball News`;
      return;
    }

    titleNode.textContent = "Category not found";
    subtitleNode.textContent = "Pick a valid category or series option from the Search tab.";
    document.title = "Category Not Found | Knuckleball News";
  };

  const renderCategoryPickerLinks = (state) => {
    if (!categoryPickerLinks) {
      return;
    }

    categoryPickerLinks.innerHTML = "";

    const seriesItem = document.createElement("li");
    const seriesLink = document.createElement("a");
    seriesLink.href = "category.html?series=true";
    seriesLink.textContent = "Series";
    if (state.mode === "series") {
      seriesLink.setAttribute("aria-current", "page");
    }
    seriesItem.appendChild(seriesLink);
    categoryPickerLinks.appendChild(seriesItem);

    window.KBData.CATEGORY_OPTIONS.forEach((category) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = `category.html?category=${encodeURIComponent(category)}`;
      link.textContent = category;

      if (state.mode === "category" && category === state.category) {
        link.setAttribute("aria-current", "page");
      }

      item.appendChild(link);
      categoryPickerLinks.appendChild(item);
    });
  };

  const renderEmptyState = (state) => {
    if (!articleList) {
      return;
    }

    const label = state.mode === "series" ? "series" : state.category || "this category";
    const empty = document.createElement("article");
    empty.className = "post-card";
    empty.innerHTML = [
      '<p class="post-kicker">No Results</p>',
      `<h2>No articles found for ${label} yet.</h2>`,
      '<p>Choose another category or team from the Search tab.</p>',
    ].join("");

    articleList.appendChild(empty);
  };

  const renderArticleCard = (article, index) => {
    const card = document.createElement("article");
    card.className = "post-card";

    const kicker = document.createElement("p");
    kicker.className = "post-kicker";
    kicker.textContent = index === 0 ? "New Post" : "Recent Post";

    const heading = document.createElement("h2");
    const link = document.createElement("a");
    link.href = createArticleUrl(article);
    link.textContent = article.title;
    heading.appendChild(link);

    const metaRow = document.createElement("div");
    metaRow.className = "post-meta-row";

    const meta = document.createElement("p");
    meta.className = "post-meta";
    meta.textContent = `By ${article.author || "Knuckleball News"} | ${window.KBData.formatDate(
      article.published_at
    )}`;

    const labelsWrap = document.createElement("div");
    labelsWrap.className = "post-labels";
    labelsWrap.setAttribute("aria-label", "Article labels");

    if (article.category && CATEGORY_LABELS[article.category]) {
      labelsWrap.appendChild(createCategoryTagLink(article.category));
    }

    if (article.is_series) {
      labelsWrap.appendChild(createSeriesTagLink());
    }

    labelsWrap.hidden = !labelsWrap.children.length;
    metaRow.appendChild(meta);
    metaRow.appendChild(labelsWrap);

    const body = document.createElement("div");
    body.className = "post-body";
    if (article.body_html) {
      body.innerHTML = article.body_html;
    } else {
      const fallbackParagraph = document.createElement("p");
      fallbackParagraph.textContent = article.summary || window.KBData.htmlToPlainText(article.body_html || "");
      body.appendChild(fallbackParagraph);
    }

    const teams = window.KBData
      .splitList((article.teams || []).join(","))
      .filter((team) => window.KBData.TEAM_LABELS.includes(team))
      .sort((a, b) => a.localeCompare(b))
      ;

    card.appendChild(kicker);
    card.appendChild(heading);
    card.appendChild(metaRow);
    card.appendChild(body);
    card.appendChild(createShareActions(article));
    card.appendChild(createTeamLabelsSection(teams));
    normalizePostBodyLinks(card);

    return card;
  };

  const renderArticleList = (articles, state) => {
    if (!articleList) {
      return;
    }

    articleList.innerHTML = "";

    if (!articles.length) {
      renderEmptyState(state);
      return;
    }

    const fragment = document.createDocumentFragment();
    articles.forEach((article, index) => {
      fragment.appendChild(renderArticleCard(article, index));
    });
    articleList.appendChild(fragment);
  };

  const setupCategoryPage = async () => {
    bindInstagramShare();

    const state = getCategoryStateFromQuery();
    renderCategoryPickerLinks(state);

    if (state.mode === "none") {
      setHeader(state, 0);
      renderArticleList([], state);
      return;
    }

    try {
      const publishedArticles = await window.KBData.fetchPublishedArticles();
      const filteredArticles = sortArticlesNewestFirst(
        (publishedArticles || []).filter((article) => {
          if (state.mode === "series") {
            return Boolean(article.is_series);
          }

          return window.KBData.toSlug(article.category) === window.KBData.toSlug(state.category);
        })
      );

      setHeader(state, filteredArticles.length);
      renderArticleList(filteredArticles, state);
    } catch (error) {
      console.error("Unable to load category coverage", error);
      setHeader(state, 0);
      renderArticleList([], state);
    }
  };

  setupCategoryPage();
})();
