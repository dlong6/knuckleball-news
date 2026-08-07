(function () {
  const CATEGORY_OPTIONS = [
    "Eephus",
    "Wormburner",
    "Can of Corn",
    "Extra Innings",
    "Showcase",
  ];

  const TEAM_LABELS = [
    "Arizona Diamondbacks",
    "Atlanta Braves",
    "Baltimore Orioles",
    "Boston Red Sox",
    "Chicago Cubs",
    "Chicago White Sox",
    "Cincinnati Reds",
    "Cleveland Guardians",
    "Colorado Rockies",
    "Detroit Tigers",
    "Houston Astros",
    "Kansas City Royals",
    "Los Angeles Angels",
    "Los Angeles Dodgers",
    "Miami Marlins",
    "Milwaukee Brewers",
    "Minnesota Twins",
    "New York Mets",
    "New York Yankees",
    "Oakland Athletics",
    "Philadelphia Phillies",
    "Pittsburgh Pirates",
    "San Diego Padres",
    "San Francisco Giants",
    "Seattle Mariners",
    "St. Louis Cardinals",
    "Tampa Bay Rays",
    "Texas Rangers",
    "Toronto Blue Jays",
    "Washington Nationals",
  ];

  const config = window.KB_CONFIG || {};
  const hasSupabaseConfig = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  const supabaseClient =
    hasSupabaseConfig &&
    window.supabase &&
    window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  const LOCAL_ARTICLES_CACHE_KEY = "knuckleball.cachedArticles.v1";

  const splitList = (value) =>
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const toBoolean = (value) => {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      return normalized === "true" || normalized === "1" || normalized === "yes";
    }

    if (typeof value === "number") {
      return value === 1;
    }

    return false;
  };

  const toSlug = (value) =>
    String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

  const escapeHtml = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const plainTextToHtml = (value) => {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }

    const paragraphs = text
      .split(/\n\s*\n/g)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`);

    return paragraphs.join("\n");
  };

  const htmlToPlainText = (value) => {
    const html = String(value || "");
    if (!html.trim()) {
      return "";
    }

    const container = document.createElement("div");
    container.innerHTML = html;

    const blocks = Array.from(container.querySelectorAll("p,li,h1,h2,h3,h4,h5,h6,blockquote"));
    if (!blocks.length) {
      return (container.textContent || "").trim();
    }

    return blocks
      .map((block) => (block.textContent || "").trim())
      .filter(Boolean)
      .join("\n\n");
  };

  const normalizeArticle = (article) => {
    const teams = Array.isArray(article.teams)
      ? article.teams
      : splitList(article.teams || "");

    return {
      id: article.id || null,
      slug: toSlug(article.slug || article.title),
      title: String(article.title || "").trim(),
      author: String(article.author || "").trim() || "Knuckleball News",
      category: String(article.category || "").trim(),
      is_series: toBoolean(article.is_series),
      teams,
      summary: String(article.summary || "").trim(),
      body_html: String(article.body_html || "").trim(),
      status: article.status === "draft" ? "draft" : "published",
      published_at: article.published_at || new Date().toISOString(),
      updated_at: article.updated_at || null,
      created_at: article.created_at || null,
    };
  };

  const sortByNewest = (articles) =>
    [...articles].sort((left, right) => {
      const leftTime = Date.parse(left.published_at || left.created_at || "") || 0;
      const rightTime = Date.parse(right.published_at || right.created_at || "") || 0;
      return rightTime - leftTime;
    });

  const readCachedArticles = () => {
    try {
      const raw = window.localStorage.getItem(LOCAL_ARTICLES_CACHE_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.map(normalizeArticle);
    } catch (_error) {
      return [];
    }
  };

  const writeCachedArticles = (articles) => {
    try {
      window.localStorage.setItem(LOCAL_ARTICLES_CACHE_KEY, JSON.stringify(articles.map(normalizeArticle)));
    } catch (_error) {
      // Ignore storage quota/private-mode errors.
    }
  };

  const upsertCachedArticle = (article) => {
    const normalized = normalizeArticle(article);
    const cached = readCachedArticles();
    const index = cached.findIndex(
      (item) => (normalized.id && item.id === normalized.id) || item.slug === normalized.slug
    );

    if (index >= 0) {
      cached[index] = normalized;
    } else {
      cached.push(normalized);
    }

    writeCachedArticles(sortByNewest(cached));
  };

  const removeCachedArticle = (articleId) => {
    if (!articleId) {
      return;
    }

    const cached = readCachedArticles();
    const next = cached.filter((article) => article.id !== articleId);
    writeCachedArticles(next);
  };

  const getCachedPublishedArticles = () =>
    sortByNewest(readCachedArticles().filter((article) => article.status === "published"));

  const formatWriteError = (error) => {
    if (!error) {
      return new Error("Unable to save article.");
    }

    const message = String(error.message || "").toLowerCase();
    if (message.includes("row-level security") || error.code === "42501") {
      return new Error(
        'Save blocked by Supabase Row Level Security. In the SQL editor, run: create policy "Authenticated users can insert articles" on public.articles for insert to authenticated with check (true);'
      );
    }

    if (
      (message.includes("column") && message.includes("is_series") && message.includes("does not exist")) ||
      (error.code === "42703" && message.includes("is_series"))
    ) {
      return new Error(
        'Your Supabase table is missing the is_series column. Run this SQL first: alter table public.articles add column if not exists is_series boolean not null default false;'
      );
    }

    return error;
  };

  const formatDate = (isoString) => {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const datePart = new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date);

    const timePart = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }).format(date);

    return `${datePart} ${timePart}`;
  };

  const fetchPublishedArticles = async () => {
    if (!supabaseClient) {
      return getCachedPublishedArticles();
    }

    const { data, error } = await supabaseClient
      .from("articles")
      .select("*")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      return getCachedPublishedArticles();
    }

    const published = (data || []).map(normalizeArticle);
    published.forEach(upsertCachedArticle);

    if (published.length) {
      return published;
    }

    return getCachedPublishedArticles();
  };

  const fetchPublishedArticleBySlug = async (slug) => {
    if (!supabaseClient) {
      return getCachedPublishedArticles().find((article) => article.slug === slug) || null;
    }

    const { data, error } = await supabaseClient
      .from("articles")
      .select("*")
      .eq("status", "published")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      return getCachedPublishedArticles().find((article) => article.slug === slug) || null;
    }

    if (data) {
      const normalized = normalizeArticle(data);
      upsertCachedArticle(normalized);
      return normalized;
    }

    return getCachedPublishedArticles().find((article) => article.slug === slug) || null;
  };

  const fetchAllArticles = async () => {
    if (!supabaseClient) {
      return sortByNewest(readCachedArticles());
    }

    const { data, error } = await supabaseClient
      .from("articles")
      .select("*")
      .order("published_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const allArticles = (data || []).map(normalizeArticle);
    allArticles.forEach(upsertCachedArticle);
    return allArticles;
  };

  const saveArticle = async (articleInput) => {
    if (!supabaseClient) {
      throw new Error("Supabase is not configured.");
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabaseClient.auth.getSession();
    if (sessionError) {
      throw sessionError;
    }
    if (!session) {
      throw new Error("You are signed out. Please sign in again.");
    }

    const normalized = normalizeArticle(articleInput);
    if (!normalized.title) {
      throw new Error("Title is required.");
    }

    if (!normalized.body_html) {
      throw new Error("Article body is required.");
    }

    const payload = {
      title: normalized.title,
      slug: normalized.slug,
      author: normalized.author,
      category: normalized.category,
      is_series: normalized.is_series,
      teams: normalized.teams,
      summary: normalized.summary,
      body_html: normalized.body_html,
      status: normalized.status,
      published_at: normalized.published_at,
    };

    let query;
    if (normalized.id) {
      query = supabaseClient
        .from("articles")
        .update(payload)
        .eq("id", normalized.id);
    } else {
      query = supabaseClient.from("articles").insert(payload);
    }

    const { error } = await query;

    if (error) {
      throw formatWriteError(error);
    }

    upsertCachedArticle(normalized);

    return normalized;
  };

  const deleteArticle = async (articleId) => {
    if (!supabaseClient) {
      throw new Error("Supabase is not configured.");
    }

    const { error } = await supabaseClient.from("articles").delete().eq("id", articleId);

    if (error) {
      throw error;
    }

    removeCachedArticle(articleId);
  };

  const signIn = async (email, password) => {
    if (!supabaseClient) {
      throw new Error("Supabase is not configured.");
    }

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      throw error;
    }

    return data;
  };

  const signOut = async () => {
    if (!supabaseClient) {
      return;
    }

    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      throw error;
    }
  };

  const getSession = async () => {
    if (!supabaseClient) {
      return null;
    }

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
      throw error;
    }

    return data.session;
  };

  const onAuthStateChange = (handler) => {
    if (!supabaseClient) {
      return () => {};
    }

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      handler(session);
    });

    return () => subscription.unsubscribe();
  };

  window.KBData = {
    CATEGORY_OPTIONS,
    TEAM_LABELS,
    hasSupabaseConfig,
    splitList,
    toSlug,
    plainTextToHtml,
    htmlToPlainText,
    formatDate,
    normalizeArticle,
    fetchPublishedArticles,
    fetchPublishedArticleBySlug,
    fetchAllArticles,
    saveArticle,
    deleteArticle,
    signIn,
    signOut,
    getSession,
    onAuthStateChange,
  };
})();
