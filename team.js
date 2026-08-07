(function () {
  const CATEGORY_LABELS = {
    Eephus: "tag-eephus",
    Wormburner: "tag-wormburner",
    "Can of Corn": "tag-can-of-corn",
    "Extra Innings": "tag-extra-innings",
    Showcase: "tag-showcase",
  };

  const titleNode = document.querySelector("#team-page-title");
  const subtitleNode = document.querySelector("#team-page-subtitle");
  const articleList = document.querySelector("#team-article-list");
  const teamPickerLinks = document.querySelector("#team-picker-links");

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

  const resolveTeamFromQuery = () => {
    const params = new URLSearchParams(window.location.search);
    const requested = String(params.get("team") || "").trim();
    if (!requested) {
      return "";
    }

    const requestedSlug = window.KBData.toSlug(requested);
    return (
      window.KBData.TEAM_LABELS.find((team) => window.KBData.toSlug(team) === requestedSlug) || ""
    );
  };

  const setHeader = (teamName, count) => {
    if (!titleNode || !subtitleNode) {
      return;
    }

    if (!teamName) {
      titleNode.textContent = "Team not found";
      subtitleNode.textContent = "Pick a valid team from the Search tab in navigation.";
      document.title = "Team Not Found | Knuckleball News";
      return;
    }

    titleNode.textContent = `${teamName} Coverage`;
    subtitleNode.textContent = `${count} article${count === 1 ? "" : "s"} tagged with ${teamName}.`;
    document.title = `${teamName} Articles | Knuckleball News`;
  };

  const renderTeamPickerLinks = (activeTeam) => {
    if (!teamPickerLinks) {
      return;
    }

    teamPickerLinks.innerHTML = "";

    window.KBData.TEAM_LABELS.forEach((team) => {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = `team.html?team=${encodeURIComponent(team)}`;
      link.textContent = team;

      if (team === activeTeam) {
        link.setAttribute("aria-current", "page");
      }

      item.appendChild(link);
      teamPickerLinks.appendChild(item);
    });
  };

  const renderEmptyState = (teamName) => {
    if (!articleList) {
      return;
    }

    const empty = document.createElement("article");
    empty.className = "post-card";
    empty.innerHTML = [
      '<p class="post-kicker">No Results</p>',
      `<h2>No articles tagged for ${teamName} yet.</h2>`,
      '<p>Choose another team from the sidebar or check back for future coverage.</p>',
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
      fallbackParagraph.textContent =
        article.summary || window.KBData.htmlToPlainText(article.body_html || "");
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

  const renderArticleList = (articles, teamName) => {
    if (!articleList) {
      return;
    }

    articleList.innerHTML = "";

    if (!articles.length) {
      renderEmptyState(teamName);
      return;
    }

    const fragment = document.createDocumentFragment();
    articles.forEach((article, index) => {
      fragment.appendChild(renderArticleCard(article, index));
    });
    articleList.appendChild(fragment);
  };

  const setupTeamPage = async () => {
    bindInstagramShare();

    const teamName = resolveTeamFromQuery();
    renderTeamPickerLinks(teamName);

    if (!teamName) {
      setHeader("", 0);
      renderArticleList([], "this team");
      return;
    }

    try {
      const publishedArticles = await window.KBData.fetchPublishedArticles();
      const filteredArticles = sortArticlesNewestFirst(
        (publishedArticles || []).filter((article) => {
          const teams = window.KBData
            .splitList((article.teams || []).join(","))
            .map((team) => window.KBData.toSlug(team));

          return teams.includes(window.KBData.toSlug(teamName));
        })
      );

      setHeader(teamName, filteredArticles.length);
      renderArticleList(filteredArticles, teamName);
    } catch (error) {
      console.error("Unable to load team coverage", error);
      setHeader(teamName, 0);
      renderArticleList([], teamName);
    }
  };

  setupTeamPage();
})();
