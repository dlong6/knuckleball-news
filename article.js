(function () {
	const SIDEBAR_LINK_LIMIT = 12;
	const MOBILE_BREAKPOINT = 760;
	const CATEGORY_LABELS = {
		Eephus: "tag-eephus",
		Wormburner: "tag-wormburner",
		"Can of Corn": "tag-can-of-corn",
		"Extra Innings": "tag-extra-innings",
		Showcase: "tag-showcase",
	};

	const articleView = document.querySelector("#article-view");
	const recentLinks = document.querySelector("#recent-article-links");

	const getSortableTimestamp = (article) => {
		const timestamp = Date.parse(article.published_at || article.created_at || "");
		return Number.isFinite(timestamp) ? timestamp : 0;
	};

	const sortArticlesNewestFirst = (articles) =>
		[...articles].sort((left, right) => getSortableTimestamp(right) - getSortableTimestamp(left));

	const getNextArticle = (articles, currentSlug) => {
		const index = articles.findIndex((article) => article.slug === currentSlug);
		if (index === -1) {
			return null;
		}

		return articles[index + 1] || null;
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

	const renderNotFound = () => {
		if (!articleView) {
			return;
		}

		document.title = "Article Not Found | Knuckleball News";
		articleView.className = "post-card";
		articleView.innerHTML = [
			'<p class="post-kicker">Not Found</p>',
			"<h2>Article Not Found</h2>",
			"<p>The article you requested could not be found.</p>",
			'<p><a href="index.html">Return to home</a></p>',
		].join("");
	};

	const renderRecentLinks = (articles, currentSlug) => {
		if (!recentLinks) {
			return;
		}

		recentLinks.innerHTML = "";

		articles
			.filter((article) => article.slug !== currentSlug)
			.slice(0, SIDEBAR_LINK_LIMIT)
			.forEach((article) => {
				const item = document.createElement("li");
				const link = document.createElement("a");
				link.href = createArticleUrl(article);
				link.textContent = article.title;
				item.appendChild(link);
				recentLinks.appendChild(item);
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
		const body = root.querySelector(".post-body");
		if (!body) {
			return;
		}

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

		body.querySelectorAll(`[data-wormburner-ticker="true"]`).forEach((node) => {
			node.remove();
		});
	};

	const renderArticle = (article, nextArticle) => {
		if (!articleView) {
			return;
		}

		const meta = `By ${article.author || "Knuckleball News"} | ${window.KBData.formatDate(article.published_at)}`;

		articleView.className = "post-card";
		articleView.id = article.slug;
		articleView.dataset.category = article.category || "";
		articleView.dataset.series = article.is_series ? "true" : "false";
		articleView.dataset.teams = (article.teams || []).join(", ");
		articleView.innerHTML = "";

		const kicker = document.createElement("p");
		kicker.className = "post-kicker";
		kicker.textContent = article.category || "Featured";

		const heading = document.createElement("h2");
		heading.textContent = article.title;

		const metaRow = document.createElement("div");
		metaRow.className = "post-meta-row";

		const metaText = document.createElement("p");
		metaText.className = "post-meta";
		metaText.textContent = meta;

		const labelsWrap = document.createElement("div");
		labelsWrap.className = "post-labels";
		labelsWrap.setAttribute("aria-label", "Article labels");

		if (article.category && CATEGORY_LABELS[article.category]) {
			labelsWrap.appendChild(createCategoryTagLink(article.category));
		}

		if (article.is_series) {
			labelsWrap.appendChild(createSeriesTagLink());
		}

		const teams = window.KBData
			.splitList((article.teams || []).join(","))
			.filter((team) => window.KBData.TEAM_LABELS.includes(team))
			.sort((a, b) => a.localeCompare(b));

		labelsWrap.hidden = !labelsWrap.children.length;

		metaRow.appendChild(metaText);
		metaRow.appendChild(labelsWrap);

		const summary = document.createElement("p");
		summary.className = "post-summary";
		summary.textContent = article.summary || "";
		summary.hidden = !article.summary;

		const body = document.createElement("div");
		body.className = "post-body";
		body.innerHTML = article.body_html || "";

		articleView.appendChild(kicker);
		articleView.appendChild(heading);
		articleView.appendChild(metaRow);
		articleView.appendChild(summary);
		articleView.appendChild(body);
		articleView.appendChild(createShareActions(article));
		articleView.appendChild(createTeamLabelsSection(teams));

		if (nextArticle) {
			const nextWrap = document.createElement("div");
			nextWrap.className = "load-next-article-wrap";

			const nextButton = document.createElement("a");
			nextButton.className = "load-next-article-button";
			nextButton.href = createArticleUrl(nextArticle);
			nextButton.textContent = "Load Next Article";

			nextWrap.appendChild(nextButton);
			articleView.appendChild(nextWrap);
		}

		normalizeArticleTables(articleView);
		normalizePostBodyTypography(articleView);
		normalizePostBodyLinks(articleView);

		document.title = `${article.title} | Knuckleball News`;
	};

	const setupPage = async () => {
		bindInstagramShare();

		const params = new URLSearchParams(window.location.search);
		const slug = window.KBData.toSlug(params.get("slug") || "");
		if (!slug) {
			renderNotFound();
			return;
		}

		try {
			const [article, publishedArticles] = await Promise.all([
				window.KBData.fetchPublishedArticleBySlug(slug),
				window.KBData.fetchPublishedArticles(),
			]);

			const sortedArticles = sortArticlesNewestFirst(publishedArticles || []);
			renderRecentLinks(sortedArticles, slug);

			if (!article) {
				renderNotFound();
				return;
			}

			const nextArticle = getNextArticle(sortedArticles, slug);
			renderArticle(article, nextArticle);
		} catch (error) {
			console.error("Unable to load article", error);
			renderNotFound();
		}
	};

	setupPage();
})();
