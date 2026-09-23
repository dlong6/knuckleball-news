// Builds the SEO version of Knuckleball News into ./_site
//
// 1. Copies the normal site files into _site/
// 2. Downloads every published article from Supabase
// 3. Writes a real HTML page for each one at /articles/<slug>/
// 4. Writes an "All Articles" page at /articles/ and a sitemap.xml
// 5. Writes the home page with the latest articles already in it, so
//    visitors and search engines never see "Loading latest articles..."
//
// Run by .github/workflows/publish-site.yml. Needs Node 18 or newer.

import { promises as fs } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const SITE_URL = "https://knuckleballnews.com";
const SITE_NAME = "Knuckleball News";
const ROOT = process.cwd();
const OUT = path.join(ROOT, "_site");

// Files and folders that should not be published.
const EXCLUDE = new Set([".git", ".github", "_site", "scripts", "node_modules", "SUPABASE_SETUP.md", "logos.odt"]);

// ---------- helpers ----------

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const toSlug = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const stripHtml = (html) =>
  String(html || "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const truncate = (text, max = 155) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : max).trim()}…`;
};

const formatDate = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(date);
};

const articlePath = (slug) => `/articles/${encodeURIComponent(slug)}/`;
const jsonLd = (data) => JSON.stringify(data).replace(/</g, "\\u003c");

// ---------- read Supabase settings from kb-config.js ----------

async function readConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (url && key) return { supabaseUrl: url, supabaseAnonKey: key };

  const source = await fs.readFile(path.join(ROOT, "kb-config.js"), "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  const config = sandbox.window.KB_CONFIG || {};
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error("Supabase URL/key not found in kb-config.js");
  }
  return config;
}

// ---------- fetch published articles ----------

async function fetchArticles({ supabaseUrl, supabaseAnonKey }) {
  const endpoint = new URL("/rest/v1/articles", supabaseUrl);
  endpoint.searchParams.set("select", "*");
  endpoint.searchParams.set("status", "eq.published");
  endpoint.searchParams.set("order", "published_at.desc,created_at.desc");

  const response = await fetch(endpoint, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
  });
  if (!response.ok) {
    throw new Error(`Supabase request failed: ${response.status} ${await response.text()}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Unexpected Supabase response");

  const seen = new Set();
  return rows
    .map((row) => ({
      slug: toSlug(row.slug || row.title),
      title: String(row.title || "").trim(),
      author: String(row.author || "").trim() || SITE_NAME,
      category: String(row.category || "").trim(),
      is_series: row.is_series === true || row.is_series === "true",
      teams: Array.isArray(row.teams) ? row.teams.map((t) => String(t || "").trim()).filter(Boolean) : [],
      summary: String(row.summary || "").trim(),
      body_html: String(row.body_html || "").trim(),
      published_at: row.published_at || row.created_at,
      updated_at: row.updated_at || row.published_at || row.created_at,
    }))
    .filter((a) => a.slug && a.title && !seen.has(a.slug) && seen.add(a.slug));
}

// ---------- copy the static site ----------

async function copySite(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    if (EXCLUDE.has(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) await copySite(from, to);
    else await fs.copyFile(from, to);
  }
}

// ---------- page builders ----------

function headTags({ title, description, canonical, type = "website", extra = "" }) {
  return [
    `<base href="/" />`,
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:image" content="${SITE_URL}/logo_blue.png" />`,
    `<meta name="twitter:card" content="summary" />`,
    extra,
  ].join("\n    ");
}

// Replace the template's <title> and SEO tags with page-specific ones.
function withHead(template, tags) {
  return template
    .replace(/\s*<title>[\s\S]*?<\/title>/, "")
    .replace(/\s*<meta name="description"[^>]*>/, "")
    .replace(/\s*<link rel="canonical"[^>]*>/, "")
    .replace(/\s*<meta property="og:[^>]*>/g, "")
    .replace(/\s*<meta name="twitter:[^>]*>/g, "")
    .replace(/<meta charset="UTF-8" \/>/, `<meta charset="UTF-8" />\n    ${tags}`);
}

// Same list the live sidebar shows (article.js): the 12 newest articles,
// with the current one included and marked, so nothing jumps when the page
// refreshes the list after loading.
function recentLinks(articles, currentSlug) {
  return articles
    .slice(0, 12)
    .map((a) => {
      const current = a.slug === currentSlug ? ' aria-current="page"' : "";
      return `<li><a href="${articlePath(a.slug)}"${current}>${escapeHtml(a.title)}</a></li>`;
    })
    .join("\n          ");
}

// Previous (newer) / Next (older) links, same markup as article.js builds.
function articlePager(articles, currentSlug) {
  const index = articles.findIndex((a) => a.slug === currentSlug);
  if (index === -1) return "";
  const previous = articles[index - 1];
  const next = articles[index + 1];
  if (!previous && !next) return "";

  const link = (a, direction) =>
    `<a class="article-pager-link article-pager-${direction}" href="${articlePath(a.slug)}" rel="${direction === "previous" ? "prev" : "next"}">` +
    `<span class="article-pager-label">${direction === "previous" ? "&lt; Previous" : "Next &gt;"}</span>` +
    `<span class="article-pager-title">${escapeHtml(a.title)}</span></a>`;
  const empty = '<span class="article-pager-empty" aria-hidden="true"></span>';

  return `<nav class="article-pager" aria-label="More articles">${previous ? link(previous, "previous") : empty}${next ? link(next, "next") : empty}</nav>`;
}

function buildArticlePage(template, article, articles) {
  const canonical = `${SITE_URL}${articlePath(article.slug)}`;
  const description = truncate(article.summary || stripHtml(article.body_html) || `${article.title} from ${SITE_NAME}.`);

  const structured = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title.slice(0, 110),
    description,
    datePublished: article.published_at,
    dateModified: article.updated_at,
    mainEntityOfPage: canonical,
    image: [`${SITE_URL}/logo_blue.png`],
    author: [{ "@type": article.author === SITE_NAME ? "Organization" : "Person", name: article.author }],
    publisher: { "@type": "Organization", name: SITE_NAME, url: `${SITE_URL}/` },
  };

  const head = headTags({
    title: `${article.title} | ${SITE_NAME}`,
    description,
    canonical,
    type: "article",
    extra: [
      `<meta property="article:published_time" content="${escapeHtml(article.published_at)}" />`,
      `<meta property="article:modified_time" content="${escapeHtml(article.updated_at)}" />`,
      `<script type="application/ld+json">${jsonLd(structured)}</script>`,
    ].join("\n    "),
  });

  const body = `<article id="article-view" class="post-card" data-slug="${escapeHtml(article.slug)}" data-prerendered="true">
          <p class="post-kicker">${escapeHtml(article.category || "Featured")}</p>
          <h2>${escapeHtml(article.title)}</h2>
          <div class="post-meta-row"><p class="post-meta">By ${escapeHtml(article.author)} | ${escapeHtml(formatDate(article.published_at))}</p></div>
          ${article.summary ? `<p class="post-summary">${escapeHtml(article.summary)}</p>` : ""}
          <div class="post-body">${article.body_html}</div>
          ${articlePager(articles, article.slug)}
        </article>`;

  let html = withHead(template, head);
  html = html.replace(/<article id="article-view"[\s\S]*?<\/article>/, body);
  html = html.replace(
    /<ul id="recent-article-links"><\/ul>/,
    `<ul id="recent-article-links">\n          ${recentLinks(articles, article.slug)}\n        </ul>`
  );
  return html;
}

function buildArchivePage(template, articles) {
  const canonical = `${SITE_URL}/articles/`;
  const items = articles
    .map(
      (a) => `<li class="archive-item">
              <a href="${articlePath(a.slug)}">${escapeHtml(a.title)}</a>
              <span class="post-meta"> ${escapeHtml(formatDate(a.published_at))}</span>
            </li>`
    )
    .join("\n            ");

  const main = `<main class="page-shell page-content">
      <section class="main-feed" aria-label="All articles">
        <article class="post-card">
          <p class="post-kicker">Archive</p>
          <h2>All Articles</h2>
          <ul class="archive-list">
            ${items}
          </ul>
        </article>
      </section>
    </main>`;

  let html = withHead(
    template,
    headTags({
      title: `All Articles | ${SITE_NAME}`,
      description: `Every article published on ${SITE_NAME}, newest first.`,
      canonical,
    })
  );
  html = html.replace(/<main[\s\S]*?<\/main>/, main);
  // The archive page doesn't need the article renderer script.
  html = html.replace(/\s*<script src="article.js"><\/script>/, "");
  return html;
}

// ---------- home page ----------

// Must match site.js (the live home page) so nothing shifts when it takes over.
const HOME_DESKTOP_CARDS = 3; // DESKTOP_INITIAL_VISIBLE_COUNT
const HOME_MOBILE_ITEMS = 8; // MOBILE_INITIAL_VISIBLE_COUNT
const HOME_SIDEBAR_LINKS = 12; // SIDEBAR_LINK_LIMIT
const CATEGORY_CLASSES = {
  Eephus: "tag-eephus",
  Wormburner: "tag-wormburner",
  "Can of Corn": "tag-can-of-corn",
  "Extra Innings": "tag-extra-innings",
  Showcase: "tag-showcase",
};

// Same wording as kb-data.js formatDate, e.g. "September 22, 2026 1:10 PM PDT".
// Shown in Pacific time; the live page then shows the visitor's own time zone.
function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const tz = "America/Los_Angeles";
  const datePart = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: tz }).format(date);
  const timePart = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short", timeZone: tz }).format(date);
  return `${datePart} ${timePart}`;
}

// Old articles may still contain the legacy ticker paragraph; site.js hides it.
const stripLegacyTicker = (html) =>
  String(html || "").replace(/<p\b[^>]*data-wormburner-ticker="true"[^>]*>[\s\S]*?<\/p>/gi, "");

function homeCard(article, index) {
  const chips = [];
  if (CATEGORY_CLASSES[article.category]) {
    chips.push(
      `<a class="tag-chip ${CATEGORY_CLASSES[article.category]}" href="category.html?category=${encodeURIComponent(article.category)}" target="_blank" rel="noopener noreferrer">${escapeHtml(article.category)}</a>`
    );
  }
  if (article.is_series) {
    chips.push('<a class="tag-chip tag-series" href="category.html?series=true" target="_blank" rel="noopener noreferrer">Series</a>');
  }

  return `<article class="post-card prerendered-home-card" id="${escapeHtml(article.slug)}" data-prerendered="true" data-published-at="${escapeHtml(article.published_at)}" data-category="${escapeHtml(article.category)}" data-series="${article.is_series ? "true" : "false"}" data-teams="${escapeHtml(article.teams.join(", "))}">
          <p class="post-kicker">${index === 0 ? "New Post" : "News Article"}</p>
          <h2 class="post-title"><a href="${articlePath(article.slug)}">${escapeHtml(article.title)}</a></h2>
          <div class="post-meta-row"><p class="post-meta">By ${escapeHtml(article.author)} | ${escapeHtml(formatDateTime(article.published_at))}</p><div class="post-labels" aria-label="Article labels"${chips.length ? "" : " hidden"}>${chips.join("")}</div></div>
          <div class="post-body">${stripLegacyTicker(article.body_html)}</div>
        </article>`;
}

function buildHomePage(template, articles) {
  const cards = articles.slice(0, HOME_DESKTOP_CARDS).map(homeCard).join("\n        ");

  // Phones show a compact list instead of full cards (see site.js).
  const mobileItems = articles
    .slice(0, HOME_MOBILE_ITEMS)
    .map(
      (a) => `<li class="mobile-latest-item"><a class="mobile-latest-link" href="${articlePath(a.slug)}">${escapeHtml(a.title)}</a><p class="mobile-latest-meta">${escapeHtml(formatDateTime(a.published_at))} | ${escapeHtml(a.author)}</p></li>`
    )
    .join("\n          ");

  const feed = `<section class="main-feed" aria-label="Latest posts">
        ${cards}
        <ol class="mobile-latest-list prerendered-mobile-list">
          ${mobileItems}
        </ol>
      </section>`;

  const sidebarLinks = articles
    .slice(0, HOME_SIDEBAR_LINKS)
    .map((a) => `<li><a href="${articlePath(a.slug)}">${escapeHtml(a.title)}</a></li>`)
    .join("\n            ");

  let html = template.replace(/<section class="main-feed" aria-label="Latest posts">[\s\S]*?<\/section>/, feed);
  html = html.replace(/<ul id="article-links-list"><\/ul>/, `<ul id="article-links-list">\n            ${sidebarLinks}\n          </ul>`);

  if (!html.includes('data-prerendered="true"') || html.includes("Loading latest articles")) {
    throw new Error("Could not insert articles into index.html; check the main-feed markup.");
  }
  return html;
}

function buildSitemap(articles) {
  const newest = articles[0]?.updated_at;
  const urls = [
    { loc: `${SITE_URL}/`, lastmod: newest },
    { loc: `${SITE_URL}/articles/`, lastmod: newest },
    { loc: `${SITE_URL}/chirps.html` },
    ...articles.map((a) => ({ loc: `${SITE_URL}${articlePath(a.slug)}`, lastmod: a.updated_at })),
  ];
  const body = urls
    .map((u) => {
      const lastmod = u.lastmod && !Number.isNaN(Date.parse(u.lastmod)) ? `<lastmod>${new Date(u.lastmod).toISOString()}</lastmod>` : "";
      return `  <url><loc>${escapeHtml(u.loc)}</loc>${lastmod}</url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// ---------- main ----------

async function main() {
  const config = await readConfig();
  const articles = await fetchArticles(config);
  console.log(`Fetched ${articles.length} published articles.`);
  if (!articles.length) {
    // Stop instead of publishing a site with no article pages.
    throw new Error("No published articles returned; refusing to deploy an empty sitemap.");
  }

  await fs.rm(OUT, { recursive: true, force: true });
  await copySite(ROOT, OUT);

  const template = await fs.readFile(path.join(ROOT, "article.html"), "utf8");

  for (const article of articles) {
    const dir = path.join(OUT, "articles", article.slug);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "index.html"), buildArticlePage(template, article, articles));
  }

  await fs.writeFile(path.join(OUT, "articles", "index.html"), buildArchivePage(template, articles));
  await fs.writeFile(path.join(OUT, "sitemap.xml"), buildSitemap(articles));

  const homeTemplate = await fs.readFile(path.join(ROOT, "index.html"), "utf8");
  await fs.writeFile(path.join(OUT, "index.html"), buildHomePage(homeTemplate, articles));

  console.log(`Built ${articles.length} article pages, /articles/, the home page and sitemap.xml into _site/.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
