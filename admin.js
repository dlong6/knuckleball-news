(function () {
  const configWarning = document.querySelector("#config-warning");
  const loginPanel = document.querySelector("#login-panel");
  const editorPanel = document.querySelector("#editor-panel");
  const loginForm = document.querySelector("#login-form");
  const loginError = document.querySelector("#login-error");
  const articleForm = document.querySelector("#article-form");
  const articleList = document.querySelector("#article-list");
  const articleListSearch = document.querySelector("#article-list-search");
  const editorToolbar = document.querySelector("#editor-toolbar");
  const logoutButton = document.querySelector("#logout-button");
  const newArticleButton = document.querySelector("#new-article-button");
  const createArticleViewButton = document.querySelector("#create-article-view-button");
  const updateHeadlineViewButton = document.querySelector("#update-headline-view-button");
  const articleEditorPanel = document.querySelector("#article-editor-panel");
  const closeArticleEditorButton = document.querySelector("#close-article-editor-button");
  const headlineEditorPanel = document.querySelector("#headline-editor-panel");
  const closeHeadlineEditorButton = document.querySelector("#close-headline-editor-button");
  const headlineForm = document.querySelector("#headline-form");
  const headlineTextInput = document.querySelector("#headline-text");
  const headlineStatus = document.querySelector("#headline-status");
  const headlineError = document.querySelector("#headline-error");
  const generateSlugButton = document.querySelector("#generate-slug-button");
  const saveStatus = document.querySelector("#save-status");
  const saveError = document.querySelector("#save-error");
  const saveToast = document.querySelector("#save-toast");
  const editorHelp = document.querySelector("#editor-help");
  const tableBuilderDialog = document.querySelector("#table-builder-dialog");
  const tableBuilderForm = document.querySelector("#table-builder-form");
  const tableBuilderRows = document.querySelector("#table-builder-rows");
  const tableBuilderCols = document.querySelector("#table-builder-cols");
  const tableBuilderError = document.querySelector("#table-builder-error");
  const tableBuilderCancel = document.querySelector("#table-builder-cancel");
  const deleteArticleDialog = document.querySelector("#delete-article-dialog");
  const deleteArticleForm = document.querySelector("#delete-article-form");
  const deleteArticleMessage = document.querySelector("#delete-article-message");
  const deleteArticleCancel = document.querySelector("#delete-article-cancel");
  const actionConfirmDialog = document.querySelector("#action-confirm-dialog");
  const actionConfirmForm = document.querySelector("#action-confirm-form");
  const actionConfirmMessage = document.querySelector("#action-confirm-message");
  const actionConfirmCancel = document.querySelector("#action-confirm-cancel");
  const actionConfirmSubmit = document.querySelector("#action-confirm-submit");
  const teamsSelector = document.querySelector("#article-teams-selector");
  const LEGACY_TICKER_ATTR = "data-wormburner-ticker";
  const ARTICLE_DRAFT_STORAGE_KEY = "knuckleball.admin.articleDraft.v1";
  const TABLE_EDIT_ACTIONS = new Set([
    "table-row-add",
    "table-col-add",
    "table-header-row-add",
    "table-row-delete",
    "table-col-delete",
    "table-header-row-delete",
  ]);

  const field = {
    id: document.querySelector("#article-id"),
    title: document.querySelector("#article-title"),
    slug: document.querySelector("#article-slug"),
    author: document.querySelector("#article-author"),
    category: document.querySelector("#article-category"),
    isSeries: document.querySelector("#article-is-series"),
    status: document.querySelector("#article-status"),
    publishedAt: document.querySelector("#article-published-at"),
    teams: document.querySelector("#article-teams"),
    body: document.querySelector("#article-body"),
    bodyEditor: document.querySelector("#article-body-editor"),
  };

  let cachedArticles = [];
  let currentListFilter = "";
  let tableDialogResolver = null;
  let deleteDialogResolver = null;
  let actionConfirmResolver = null;
  let selectedTeams = new Set();
  let saveToastTimer = null;
  let hasInitializedEditorView = false;

  const flashSaveToast = (message = "Article saved") => {
    if (!saveToast) {
      return;
    }

    if (saveToastTimer) {
      window.clearTimeout(saveToastTimer);
    }

    saveToast.textContent = message;
    saveToast.hidden = false;
    saveToastTimer = window.setTimeout(() => {
      saveToast.hidden = true;
      saveToastTimer = null;
    }, 1800);
  };

  const setAdminView = (view) => {
    if (articleEditorPanel) {
      articleEditorPanel.hidden = view !== "article";
    }

    if (headlineEditorPanel) {
      headlineEditorPanel.hidden = view !== "headline";
    }
  };

  const setVisibleState = ({ showWarning, showLogin, showEditor }) => {
    configWarning.hidden = !showWarning;
    loginPanel.hidden = !showLogin;
    editorPanel.hidden = !showEditor;
  };

  const setText = (node, value, visible) => {
    node.textContent = value;
    node.hidden = !visible;
  };

  const toLocalDateTimeInputValue = (isoString) => {
    const date = new Date(isoString || Date.now());
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };

  const fromLocalDateTimeInputValue = (value) => {
    if (!value) {
      return new Date().toISOString();
    }

    return new Date(value).toISOString();
  };

  const captureEditorState = () => ({
    id: String(field.id.value || ""),
    title: String(field.title.value || ""),
    slug: String(field.slug.value || ""),
    author: String(field.author.value || ""),
    category: String(field.category.value || ""),
    isSeries: Boolean(field.isSeries.checked),
    status: String(field.status.value || "published"),
    publishedAt: String(field.publishedAt.value || ""),
    teams: Array.from(selectedTeams),
    bodyHtml: String(field.bodyEditor.innerHTML || ""),
  });

  const hasMeaningfulEditorState = (state) => {
    if (!state) {
      return false;
    }

    const bodyText = String(state.bodyHtml || "").replace(/<[^>]*>/g, " ").trim();
    return Boolean(
      String(state.title || "").trim() ||
      String(state.slug || "").trim() ||
      String(state.author || "").trim() ||
      String(state.category || "").trim() ||
      String(state.id || "").trim() ||
      bodyText ||
      (Array.isArray(state.teams) && state.teams.length)
    );
  };

  const writeDraftToStorage = () => {
    try {
      const state = captureEditorState();
      if (!hasMeaningfulEditorState(state)) {
        window.sessionStorage.removeItem(ARTICLE_DRAFT_STORAGE_KEY);
        return;
      }

      window.sessionStorage.setItem(ARTICLE_DRAFT_STORAGE_KEY, JSON.stringify(state));
    } catch (_error) {
      // Ignore private-mode/session storage errors.
    }
  };

  const clearDraftFromStorage = () => {
    try {
      window.sessionStorage.removeItem(ARTICLE_DRAFT_STORAGE_KEY);
    } catch (_error) {
      // Ignore storage errors.
    }
  };

  const hydrateEditorFromState = (state) => {
    field.id.value = String(state.id || "");
    field.title.value = String(state.title || "");
    field.slug.value = String(state.slug || "");
    field.author.value = String(state.author || "");
    field.category.value = String(state.category || "");
    field.isSeries.checked = Boolean(state.isSeries);
    field.status.value = String(state.status || "published");
    field.publishedAt.value = String(state.publishedAt || toLocalDateTimeInputValue(new Date().toISOString()));
    setSelectedTeams(parseTeamsInput(state.teams || []));

    const normalizedBodyHtml = stripLegacyTickerParagraphFromBody(state.bodyHtml || "");
    field.body.value = normalizedBodyHtml;
    field.bodyEditor.innerHTML = normalizedBodyHtml;
    sanitizeEditorContent(field.bodyEditor);
    syncGenerateSlugButtonState();
    updateTableActionState();
  };

  const restoreDraftFromStorage = () => {
    try {
      const raw = window.sessionStorage.getItem(ARTICLE_DRAFT_STORAGE_KEY);
      if (!raw) {
        return false;
      }

      const parsed = JSON.parse(raw);
      if (!hasMeaningfulEditorState(parsed)) {
        clearDraftFromStorage();
        return false;
      }

      hydrateEditorFromState(parsed);
      return true;
    } catch (_error) {
      return false;
    }
  };

  const clearEditor = (options = {}) => {
    const { clearDraft = true } = options;

    field.id.value = "";
    field.title.value = "";
    field.slug.value = "";
    field.author.value = "";
    field.category.value = "";
    field.isSeries.checked = false;
    field.status.value = "published";
    field.publishedAt.value = toLocalDateTimeInputValue(new Date().toISOString());
    selectedTeams = new Set();
    field.teams.value = "";
    syncTeamSelectorUI();
    field.body.value = "";
    field.bodyEditor.innerHTML = "";
    syncGenerateSlugButtonState();
    updateTableActionState();
    setText(saveStatus, "", false);
    setText(saveError, "", false);

    if (clearDraft) {
      clearDraftFromStorage();
    }
  };

  const syncTeamsFieldValue = () => {
    field.teams.value = Array.from(selectedTeams).join(", ");
  };

  const syncTeamSelectorUI = () => {
    if (!teamsSelector) {
      return;
    }

    teamsSelector.querySelectorAll("button[data-team]").forEach((button) => {
      const teamName = button.dataset.team || "";
      const isActive = selectedTeams.has(teamName);
      button.classList.toggle("is-selected", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  };

  const setSelectedTeams = (teams) => {
    const allowed = new Set(window.KBData.TEAM_LABELS);
    selectedTeams = new Set(
      teams.filter((team) => allowed.has(team))
    );
    syncTeamsFieldValue();
    syncTeamSelectorUI();
  };

  const syncGenerateSlugButtonState = () => {
    if (!generateSlugButton) {
      return;
    }

    generateSlugButton.disabled = !field.title.value.trim();
  };

  const stripLegacyTickerParagraphFromBody = (bodyHtml) => {
    const container = document.createElement("div");
    container.innerHTML = String(bodyHtml || "").trim();

    const taggedTicker = container.querySelector(`p[${LEGACY_TICKER_ATTR}="true"]`);
    if (taggedTicker) {
      taggedTicker.remove();
    }

    return container.innerHTML.trim();
  };

  const parseTeamsInput = (value) => {
    if (Array.isArray(value)) {
      return value.map((item) => String(item || "").trim()).filter(Boolean);
    }

    return window.KBData.splitList(value || "");
  };

  const toggleTeamSelection = (team) => {
    if (!team) {
      return;
    }

    if (selectedTeams.has(team)) {
      selectedTeams.delete(team);
    } else {
      selectedTeams.add(team);
    }

    syncTeamsFieldValue();
    syncTeamSelectorUI();
  };

  const renderTeamSelector = () => {
    if (!teamsSelector) {
      return;
    }

    teamsSelector.innerHTML = "";

    window.KBData.TEAM_LABELS.forEach((team) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "team-selector-chip";
      button.dataset.team = team;
      button.textContent = team;
      button.setAttribute("aria-pressed", "false");

      button.addEventListener("click", () => {
        toggleTeamSelection(team);
      });

      teamsSelector.appendChild(button);
    });

    syncTeamSelectorUI();
  };

  const getTableContext = () => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) {
      return null;
    }

    let node = selection.anchorNode;
    if (!node) {
      return null;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentElement;
    }

    if (!(node instanceof Element)) {
      return null;
    }

    const cell = node.closest("td, th");
    if (!cell || !field.bodyEditor.contains(cell)) {
      return null;
    }

    const row = cell.parentElement;
    if (!row || row.tagName !== "TR") {
      return null;
    }

    const table = row.closest("table");
    if (!table || !field.bodyEditor.contains(table)) {
      return null;
    }

    const rowCells = Array.from(row.children).filter((child) => child.matches("td, th"));
    const columnIndex = rowCells.indexOf(cell);
    if (columnIndex === -1) {
      return null;
    }

    return { table, row, cell, columnIndex };
  };

  const updateEditorHelp = () => {
    if (!editorHelp) {
      return;
    }

    if (getTableContext()) {
      editorHelp.textContent = "Table selected: use row/column tools or add/delete header rows.";
      return;
    }

    editorHelp.textContent = "Use the toolbar to format text, add links or photos, and insert or edit tables.";
  };

  const updateTableActionState = () => {
    if (!editorToolbar) {
      return;
    }

    const context = getTableContext();
    const hasTableSelection = Boolean(context);
    const inHeaderRow = Boolean(context && context.row.parentElement?.tagName === "THEAD");

    editorToolbar.querySelectorAll("button[data-editor-action]").forEach((button) => {
      const action = button.dataset.editorAction;
      if (!TABLE_EDIT_ACTIONS.has(action)) {
        return;
      }

      let disabled = !hasTableSelection;
      if (action === "table-header-row-delete") {
        disabled = !inHeaderRow;
      }

      button.disabled = disabled;
      button.setAttribute("aria-disabled", String(disabled));
    });

    updateEditorHelp();
  };

  const focusEditor = () => {
    field.bodyEditor.focus();
  };

  const normalizeUrl = (value) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) {
      return "";
    }

    if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) {
      return trimmed;
    }

    return `https://${trimmed}`;
  };

  const pickImageFile = () => new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.opacity = "0";

    const cleanup = () => {
      input.removeEventListener("change", handleChange);
      input.remove();
    };

    const handleChange = () => {
      const file = input.files && input.files[0] ? input.files[0] : null;
      cleanup();
      resolve(file);
    };

    input.addEventListener("change", handleChange, { once: true });
    document.body.appendChild(input);
    input.click();
  });

  const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read image file."));
    reader.readAsDataURL(file);
  });

  const insertHtmlAtCursor = (html) => {
    focusEditor();
    document.execCommand("insertHTML", false, html);
  };

  const normalizeEditorLinks = (root = field.bodyEditor) => {
    if (!root) {
      return;
    }

    root.querySelectorAll("a[href]").forEach((link) => {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    });
  };

  // ---------------------------------------------------------------------
  // Editor content sanitizer.
  //
  // Earlier versions of this file tried to detect and strip specific known
  // problems in pasted content (inline style attributes, <font> tags, extra
  // table wrappers, deeply-nested <div> wrappers from Word/Google Docs).
  // That reactive, pattern-matching approach kept finding new gaps — most
  // seriously, a div-unwrapping pass could silently drop an entire
  // paragraph if its wrapper didn't exactly match the expected shape.
  //
  // This sanitizer takes the opposite approach: instead of trying to detect
  // and remove everything bad, it REBUILDS the content from scratch using
  // only a small, fixed set of allowed elements (paragraphs, bold/italic/
  // underline/strike, links, images, lists, tables, headings). Every node
  // in the source is visited exactly once and is either emitted as one of
  // those allowed elements, folded into the current paragraph as plain
  // text/inline formatting, or (for an unrecognized wrapper like a stray
  // <span> or <font> or a deeply nested <div>) unwrapped so its CONTENTS
  // still get processed. Nothing is ever skipped wholesale, so content
  // can't silently disappear the way it could with the old approach.
  const SANITIZE_INLINE_MARKS = { strong: "strong", b: "strong", em: "em", i: "em", u: "u", s: "s", strike: "s", del: "s" };
  const SANITIZE_BLOCK_BOUNDARY_TAGS = new Set(["p", "div", "section", "article", "blockquote", "header", "footer", "figure"]);

  // Fills `container` with a clean copy of `node`'s children, allowing only
  // text, line breaks, the inline marks above, links, and images. Used both
  // for building nested inline content (e.g. <strong> inside a paragraph)
  // and for list items and headings, which only ever contain inline content.
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

      // Unrecognized inline-ish wrapper (span, font, sup, sub, pasted-site
      // markup, etc.) — unwrap it: keep its content, drop the wrapper and
      // whatever attributes it carried.
      sanitizeWalkInlineChildrenInto(child, container);
    });
  };

  // Rebuilds a pasted/stored <table> into the site's canonical structure:
  // a <table class="stats-table"> with plain-text cells, wrapped in
  // <div class="stats-table-wrap">. Handles tables that already have a
  // proper <thead>, and tables where the first row uses <th> cells but
  // never got wrapped in an explicit <thead>.
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

  // Tracks the paragraph currently being built as top-level content is
  // walked, so that a run of text/inline elements across several source
  // nodes (or several nested wrapper divs) collapses into a single <p>.
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

  // Appends exactly one source node (text or an inline-ish element) into
  // the paragraph currently being built.
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

    // Unrecognized inline wrapper — unwrap, keep processing its children.
    Array.from(node.childNodes).forEach((child) => sanitizeAppendInline(child, state));
  };

  // Walks `sourceNode`'s children, emitting clean block-level elements
  // (tables, lists, headings, table captions) directly into `output`, and
  // folding everything else (text, inline formatting, and any div/p/section
  // wrapper) into the paragraph currently under construction. A wrapper div
  // — however deeply nested, whatever paste tool produced it — is treated
  // purely as a boundary: its content is recursively processed into the
  // SAME flat output and paragraph state, so it can reshape structure but
  // can never cause content to be skipped.
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

  const sanitizeArticleHtml = (html) => {
    const source = document.createElement("div");
    source.innerHTML = String(html || "");
    const output = document.createElement("div");
    const state = sanitizeCreateParagraphState(output);
    sanitizeProcessChildren(source, output, state);
    state.flush();
    return output.innerHTML.trim();
  };

  // Applies the sanitizer to a live editor root, replacing its content with
  // the cleaned version and returning the cleaned HTML string.
  const sanitizeEditorContent = (root = field.bodyEditor) => {
    if (!root) {
      return "";
    }

    const cleaned = sanitizeArticleHtml(root.innerHTML);
    root.innerHTML = cleaned;
    return cleaned;
  };

  // Moves the caret to the end of the editor's content. Used after a paste
  // is sanitized (which replaces the editor's innerHTML wholesale, losing
  // whatever caret position existed) so typing can continue naturally.
  const placeCaretAtEditorEnd = (root = field.bodyEditor) => {
    if (!root) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);

    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    selection.removeAllRanges();
    selection.addRange(range);
  };

  const getSelectedText = () => {
    const selection = window.getSelection();
    return selection ? selection.toString().trim() : "";
  };

  const setTableBuilderError = (message) => {
    if (!tableBuilderError) {
      return;
    }

    tableBuilderError.textContent = message || "";
    tableBuilderError.hidden = !message;
  };

  const captureEditorSelectionRange = () => {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) {
      return null;
    }

    const range = selection.getRangeAt(0);
    if (!field.bodyEditor.contains(range.startContainer)) {
      return null;
    }

    return range.cloneRange();
  };

  const restoreEditorSelectionRange = (range) => {
    if (!range) {
      return;
    }

    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    focusEditor();
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const fallbackPromptForTableSize = () => {
    const rowsRaw = window.prompt("How many table rows? (including header)", "4");
    if (!rowsRaw) {
      return null;
    }

    const colsRaw = window.prompt("How many columns?", "4");
    if (!colsRaw) {
      return null;
    }

    const rowCount = Number.parseInt(rowsRaw, 10);
    const colCount = Number.parseInt(colsRaw, 10);
    if (!Number.isInteger(rowCount) || !Number.isInteger(colCount) || rowCount < 2 || colCount < 1) {
      window.alert("Use at least 2 rows and 1 column.");
      return null;
    }

    return { rowCount, colCount };
  };

  const requestTableSize = () => {
    if (!tableBuilderDialog || !tableBuilderRows || !tableBuilderCols) {
      return Promise.resolve(fallbackPromptForTableSize());
    }

    tableBuilderRows.value = "4";
    tableBuilderCols.value = "4";
    setTableBuilderError("");

    return new Promise((resolve) => {
      tableDialogResolver = resolve;
      tableBuilderDialog.showModal();
      window.requestAnimationFrame(() => {
        tableBuilderRows.focus();
        tableBuilderRows.select();
      });
    });
  };

  const insertTable = async () => {
    const preservedSelection = captureEditorSelectionRange();
    const size = await requestTableSize();
    if (!size) {
      return;
    }

    const { rowCount, colCount } = size;
    restoreEditorSelectionRange(preservedSelection);

    const headerCells = Array.from({ length: colCount }, (_, index) => `<th scope=\"col\">Column ${index + 1}</th>`).join("");
    const bodyRows = Array.from({ length: rowCount - 1 }, () => {
      const cells = Array.from({ length: colCount }, () => "<td>Value</td>").join("");
      return `<tr>${cells}</tr>`;
    }).join("");

    const html = `
      <div class=\"stats-table-wrap\" aria-label=\"Article data table\">
        <table class=\"stats-table\">
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
      <p class=\"table-caption\">Use the table filter above to search rows.</p>
    `;

    insertHtmlAtCursor(html);
  };

  const getTableColumnCount = (table) => {
    return Array.from(table.querySelectorAll("tr")).reduce((maxCount, row) => {
      const rowCells = Array.from(row.children).filter((child) => child.matches("td, th"));
      return Math.max(maxCount, rowCells.length);
    }, 0);
  };

  const ensureTableHead = (table) => {
    let head = table.querySelector("thead");
    if (head) {
      return head;
    }

    head = document.createElement("thead");
    const body = table.querySelector("tbody");
    if (body) {
      table.insertBefore(head, body);
    } else {
      table.insertBefore(head, table.firstChild);
    }
    return head;
  };

  const createTableCell = (templateCell, fallbackTag = "td") => {
    const normalizedTag = templateCell?.tagName?.toLowerCase() === "th" || fallbackTag === "th" ? "th" : "td";
    const cell = document.createElement(normalizedTag);

    if (normalizedTag === "th") {
      cell.setAttribute("scope", "col");
      cell.textContent = "Column";
      return cell;
    }

    cell.textContent = "Value";
    return cell;
  };

  const placeCursorInCell = (cell) => {
    if (!cell) {
      return;
    }

    focusEditor();
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(true);

    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    selection.removeAllRanges();
    selection.addRange(range);
  };

  const addTableRow = () => {
    const context = getTableContext();
    if (!context) {
      window.alert("Place the cursor inside a table cell first.");
      return;
    }

    const sourceCells = Array.from(context.row.children).filter((child) => child.matches("td, th"));
    if (!sourceCells.length) {
      return;
    }

    const newRow = document.createElement("tr");
    sourceCells.forEach((sourceCell) => {
      newRow.appendChild(createTableCell(sourceCell, sourceCell.tagName.toLowerCase()));
    });

    context.row.insertAdjacentElement("afterend", newRow);
    placeCursorInCell(newRow.children[Math.min(context.columnIndex, newRow.children.length - 1)]);
  };

  const addTableColumn = () => {
    const context = getTableContext();
    if (!context) {
      window.alert("Place the cursor inside a table cell first.");
      return;
    }

    const rows = Array.from(context.table.querySelectorAll("tr"));
    let activeCell = null;

    rows.forEach((row) => {
      const rowCells = Array.from(row.children).filter((child) => child.matches("td, th"));
      if (!rowCells.length) {
        return;
      }

      const sourceCell = rowCells[Math.min(context.columnIndex, rowCells.length - 1)];
      const insertAfterCell = rowCells[Math.min(context.columnIndex, rowCells.length - 1)];
      const newCell = createTableCell(sourceCell, sourceCell.tagName.toLowerCase());
      insertAfterCell.insertAdjacentElement("afterend", newCell);

      if (row === context.row) {
        activeCell = newCell;
      }
    });

    placeCursorInCell(activeCell);
  };

  const addTableHeaderRow = () => {
    const context = getTableContext();
    if (!context) {
      window.alert("Place the cursor inside a table cell first.");
      return;
    }

    const header = ensureTableHead(context.table);
    const columnCount = Math.max(1, getTableColumnCount(context.table));

    const sourceRow = context.row.parentElement?.tagName === "THEAD"
      ? context.row
      : header.querySelector("tr:last-of-type");
    const sourceCells = sourceRow
      ? Array.from(sourceRow.children).filter((child) => child.matches("td, th"))
      : [];

    const newRow = document.createElement("tr");
    for (let index = 0; index < columnCount; index += 1) {
      const templateCell = sourceCells[Math.min(index, sourceCells.length - 1)] || null;
      const newCell = createTableCell(templateCell, "th");
      if (!templateCell) {
        newCell.textContent = `Column ${index + 1}`;
      }
      newRow.appendChild(newCell);
    }

    if (context.row.parentElement?.tagName === "THEAD") {
      context.row.insertAdjacentElement("afterend", newRow);
    } else {
      header.appendChild(newRow);
    }

    placeCursorInCell(newRow.children[Math.min(context.columnIndex, newRow.children.length - 1)] || null);
  };

  const deleteTableHeaderRow = () => {
    const context = getTableContext();
    if (!context) {
      window.alert("Place the cursor inside a table cell first.");
      return;
    }

    const section = context.row.parentElement;
    if (!section || section.tagName !== "THEAD") {
      window.alert("Place the cursor inside a header row to delete it.");
      return;
    }

    const fallbackHeaderRow = context.row.nextElementSibling || context.row.previousElementSibling;
    context.row.remove();

    if (fallbackHeaderRow) {
      const cells = Array.from(fallbackHeaderRow.children).filter((child) => child.matches("td, th"));
      placeCursorInCell(cells[Math.min(context.columnIndex, cells.length - 1)] || null);
      return;
    }

    section.remove();

    const fallbackBodyRow = context.table.querySelector("tbody tr") || context.table.querySelector("tr");
    if (fallbackBodyRow) {
      const cells = Array.from(fallbackBodyRow.children).filter((child) => child.matches("td, th"));
      placeCursorInCell(cells[Math.min(context.columnIndex, cells.length - 1)] || null);
    }
  };

  const deleteTableRow = () => {
    const context = getTableContext();
    if (!context) {
      window.alert("Place the cursor inside a table cell first.");
      return;
    }

    const rows = Array.from(context.table.querySelectorAll("tr"));
    if (rows.length <= 1) {
      window.alert("A table needs at least one row.");
      return;
    }

    const fallbackRow = context.row.nextElementSibling || context.row.previousElementSibling;
    context.row.remove();

    if (fallbackRow) {
      const cells = Array.from(fallbackRow.children).filter((child) => child.matches("td, th"));
      placeCursorInCell(cells[Math.min(context.columnIndex, cells.length - 1)] || null);
    }
  };

  const deleteTableColumn = () => {
    const context = getTableContext();
    if (!context) {
      window.alert("Place the cursor inside a table cell first.");
      return;
    }

    const rows = Array.from(context.table.querySelectorAll("tr"));
    const maxColumnCount = rows.reduce((count, row) => {
      const rowCells = Array.from(row.children).filter((child) => child.matches("td, th"));
      return Math.max(count, rowCells.length);
    }, 0);

    if (maxColumnCount <= 1) {
      window.alert("A table needs at least one column.");
      return;
    }

    let activeCell = null;
    rows.forEach((row) => {
      const rowCells = Array.from(row.children).filter((child) => child.matches("td, th"));
      if (context.columnIndex >= rowCells.length) {
        return;
      }

      rowCells[context.columnIndex].remove();

      if (row === context.row) {
        const updatedCells = Array.from(row.children).filter((child) => child.matches("td, th"));
        activeCell = updatedCells[Math.min(context.columnIndex, updatedCells.length - 1)] || null;
      }
    });

    placeCursorInCell(activeCell);
  };

  const handleToolbarAction = async (action) => {
    if (!action) {
      return;
    }

    if (action === "bold") {
      focusEditor();
      document.execCommand("bold");
      return;
    }

    if (action === "italic") {
      focusEditor();
      document.execCommand("italic");
      return;
    }

    if (action === "underline") {
      focusEditor();
      document.execCommand("underline");
      return;
    }

    if (action === "strike") {
      focusEditor();
      document.execCommand("strikeThrough");
      return;
    }

    if (action === "link") {
      const rawUrl = window.prompt("Enter URL for the link", "https://");
      if (!rawUrl) {
        return;
      }

      const url = normalizeUrl(rawUrl);
      if (!url) {
        return;
      }

      const selectedText = getSelectedText();
      if (selectedText) {
        document.execCommand("createLink", false, url);
        normalizeEditorLinks(field.bodyEditor);
      } else {
        insertHtmlAtCursor(`<a href=\"${url}\" target=\"_blank\" rel=\"noopener noreferrer\">${url}</a>`);
      }
      return;
    }

    if (action === "image") {
      const file = await pickImageFile();
      if (!file) {
        return;
      }

      if (!file.type.startsWith("image/")) {
        window.alert("Please select an image file.");
        return;
      }

      let src = "";
      try {
        src = await readFileAsDataUrl(file);
      } catch (error) {
        window.alert(error.message || "Unable to read image file.");
        return;
      }

      const defaultAlt = file.name ? file.name.replace(/\.[a-z0-9]+$/i, "") : "Article image";
      const alt = window.prompt("Enter image alt text", defaultAlt) || defaultAlt;
      insertHtmlAtCursor(`<p><img src=\"${src}\" alt=\"${alt.replace(/\"/g, "&quot;")}\" class=\"editor-image\" /></p>`);
      return;
    }

    if (action === "table") {
      await insertTable();
      updateTableActionState();
      return;
    }

    if (action === "table-row-add") {
      addTableRow();
      updateTableActionState();
      return;
    }

    if (action === "table-col-add") {
      addTableColumn();
      updateTableActionState();
      return;
    }

    if (action === "table-row-delete") {
      deleteTableRow();
      updateTableActionState();
      return;
    }

    if (action === "table-col-delete") {
      deleteTableColumn();
      updateTableActionState();
      return;
    }

    if (action === "table-header-row-add") {
      addTableHeaderRow();
      updateTableActionState();
      return;
    }

    if (action === "table-header-row-delete") {
      deleteTableHeaderRow();
      updateTableActionState();
    }
  };

  const setupTableBuilderDialog = () => {
    if (!tableBuilderDialog || !tableBuilderForm || !tableBuilderRows || !tableBuilderCols) {
      return;
    }

    if (tableBuilderCancel) {
      tableBuilderCancel.addEventListener("click", () => {
        tableBuilderDialog.close("cancel");
      });
    }

    tableBuilderForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const rowCount = Number.parseInt(tableBuilderRows.value, 10);
      const colCount = Number.parseInt(tableBuilderCols.value, 10);
      if (!Number.isInteger(rowCount) || !Number.isInteger(colCount) || rowCount < 2 || colCount < 1) {
        setTableBuilderError("Use at least 2 rows and 1 column.");
        return;
      }

      tableBuilderDialog.dataset.rowCount = String(rowCount);
      tableBuilderDialog.dataset.colCount = String(colCount);
      setTableBuilderError("");
      tableBuilderDialog.close("submit");
    });

    tableBuilderDialog.addEventListener("close", () => {
      if (!tableDialogResolver) {
        return;
      }

      const resolver = tableDialogResolver;
      tableDialogResolver = null;

      if (tableBuilderDialog.returnValue !== "submit") {
        resolver(null);
        return;
      }

      const rowCount = Number.parseInt(tableBuilderDialog.dataset.rowCount || "", 10);
      const colCount = Number.parseInt(tableBuilderDialog.dataset.colCount || "", 10);
      if (!Number.isInteger(rowCount) || !Number.isInteger(colCount)) {
        resolver(null);
        return;
      }

      resolver({ rowCount, colCount });
    });
  };

  const requestDeleteConfirm = (articleTitle) => {
    if (!deleteArticleDialog || !deleteArticleForm || !deleteArticleMessage) {
      return Promise.resolve(window.confirm(`Delete "${articleTitle}"?`));
    }

    deleteArticleMessage.textContent = `Delete "${articleTitle}"? This cannot be undone.`;

    return new Promise((resolve) => {
      deleteDialogResolver = resolve;
      deleteArticleDialog.showModal();
      window.requestAnimationFrame(() => {
        deleteArticleCancel?.focus();
      });
    });
  };

  const setupDeleteArticleDialog = () => {
    if (!deleteArticleDialog || !deleteArticleForm) {
      return;
    }

    if (deleteArticleCancel) {
      deleteArticleCancel.addEventListener("click", () => {
        deleteArticleDialog.close("cancel");
      });
    }

    deleteArticleForm.addEventListener("submit", (event) => {
      event.preventDefault();
      deleteArticleDialog.close("confirm");
    });

    deleteArticleDialog.addEventListener("close", () => {
      if (!deleteDialogResolver) {
        return;
      }

      const resolver = deleteDialogResolver;
      deleteDialogResolver = null;
      resolver(deleteArticleDialog.returnValue === "confirm");
    });
  };

  const requestActionConfirm = (message, confirmLabel = "Confirm") => {
    if (!actionConfirmDialog || !actionConfirmForm || !actionConfirmMessage || !actionConfirmSubmit) {
      return Promise.resolve(window.confirm(message));
    }

    actionConfirmMessage.textContent = message;
    actionConfirmSubmit.textContent = confirmLabel;

    return new Promise((resolve) => {
      actionConfirmResolver = resolve;
      actionConfirmDialog.showModal();
      window.requestAnimationFrame(() => {
        actionConfirmCancel?.focus();
      });
    });
  };

  const setupActionConfirmDialog = () => {
    if (!actionConfirmDialog || !actionConfirmForm) {
      return;
    }

    actionConfirmCancel?.addEventListener("click", () => {
      actionConfirmDialog.close("cancel");
    });

    actionConfirmForm.addEventListener("submit", (event) => {
      event.preventDefault();
      actionConfirmDialog.close("confirm");
    });

    actionConfirmDialog.addEventListener("close", () => {
      if (!actionConfirmResolver) {
        return;
      }

      const resolver = actionConfirmResolver;
      actionConfirmResolver = null;
      resolver(actionConfirmDialog.returnValue === "confirm");
    });
  };

  const fillEditor = (article) => {
    field.id.value = article.id || "";
    field.title.value = article.title || "";
    field.slug.value = article.slug || "";
    field.author.value = article.author || "";
    field.category.value = article.category || "";
    const normalizedBodyHtml = stripLegacyTickerParagraphFromBody(article.body_html || "");
    field.isSeries.checked = Boolean(article.is_series);
    field.status.value = article.status || "published";
    field.publishedAt.value = toLocalDateTimeInputValue(article.published_at);
    setSelectedTeams(parseTeamsInput(article.teams || []));
    field.body.value = normalizedBodyHtml;
    field.bodyEditor.innerHTML = normalizedBodyHtml;
    sanitizeEditorContent(field.bodyEditor);
    syncGenerateSlugButtonState();
    updateTableActionState();
    setAdminView("article");
    setText(saveStatus, "Editing article", true);
    setText(saveError, "", false);
    writeDraftToStorage();
  };

  const createActionButton = (text, className, onClick) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.className = className;
    button.addEventListener("click", onClick);
    return button;
  };

  const renderArticleList = () => {
    articleList.innerHTML = "";

    const visibleArticles = cachedArticles.filter((article) => {
      if (!currentListFilter) {
        return true;
      }

      const source = [
        article.title,
        article.author,
        article.category,
        article.is_series ? "series" : "",
        article.status,
        (article.teams || []).join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return currentListFilter
        .split(/\s+/)
        .filter(Boolean)
        .every((term) => source.includes(term));
    });

    if (!visibleArticles.length) {
      const empty = document.createElement("li");
      empty.textContent = cachedArticles.length
        ? "No matching articles."
        : "No articles yet.";
      articleList.appendChild(empty);
      return;
    }

    visibleArticles.forEach((article) => {
      const item = document.createElement("li");

      const textWrap = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = article.title;

      const meta = document.createElement("p");
      meta.className = "article-meta";
      const seriesPrefix = article.is_series ? "SERIES | " : "";
      meta.textContent = `${seriesPrefix}${article.status.toUpperCase()} | ${window.KBData.formatDate(article.published_at)}`;

      textWrap.appendChild(title);
      textWrap.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "item-actions";

      const editButton = createActionButton("Edit", "secondary-button", () => {
        fillEditor(article);
      });

      const deleteButton = createActionButton("Delete", "secondary-button", async () => {
        const confirmed = await requestDeleteConfirm(article.title);
        if (!confirmed) {
          return;
        }

        setText(saveError, "", false);
        setText(saveStatus, "Deleting article...", true);

        try {
          await window.KBData.deleteArticle(article.id);
          await refreshArticles();
          clearEditor();
          setText(saveStatus, "Article deleted", true);
        } catch (error) {
          setText(saveError, error.message || "Unable to delete article", true);
        }
      });

      actions.appendChild(editButton);
      actions.appendChild(deleteButton);

      item.appendChild(textWrap);
      item.appendChild(actions);
      articleList.appendChild(item);
    });
  };

  const refreshArticles = async () => {
    cachedArticles = await window.KBData.fetchAllArticles();
    renderArticleList();
  };

  const populateCategoryOptions = () => {
    field.category.innerHTML = "";

    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "No category";
    field.category.appendChild(emptyOption);

    window.KBData.CATEGORY_OPTIONS.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      field.category.appendChild(option);
    });
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    setText(loginError, "", false);

    const email = document.querySelector("#login-email").value.trim();
    const password = document.querySelector("#login-password").value;

    try {
      await window.KBData.signIn(email, password);
    } catch (error) {
      setText(loginError, error.message || "Unable to sign in", true);
    }
  };

  const handleArticleSave = async (event) => {
    event.preventDefault();
    setText(saveStatus, "Saving article...", true);
    setText(saveError, "", false);

    try {
      sanitizeEditorContent(field.bodyEditor);
      const cleanedBodyHtml = stripLegacyTickerParagraphFromBody(field.bodyEditor.innerHTML.trim());
      field.bodyEditor.innerHTML = cleanedBodyHtml;
      field.body.value = cleanedBodyHtml;

      const payload = {
        id: field.id.value || null,
        title: field.title.value,
        slug: field.slug.value || window.KBData.toSlug(field.title.value),
        author: field.author.value,
        category: field.category.value,
        is_series: field.isSeries.checked,
        status: field.status.value,
        published_at: fromLocalDateTimeInputValue(field.publishedAt.value),
        teams: window.KBData.splitList(field.teams.value),
        summary: "",
        body_html: field.body.value,
      };

      const bodyText = field.bodyEditor.textContent?.trim() || "";
      if (!bodyText) {
        throw new Error("Article body is required.");
      }

      await window.KBData.saveArticle(payload);
      await refreshArticles();
      setText(saveStatus, "Article saved", true);
      setText(saveError, "", false);
      flashSaveToast("Article saved");
      if (!field.id.value) {
        clearEditor();
        setAdminView("article");
      } else {
        field.body.value = cleanedBodyHtml;
        writeDraftToStorage();
      }
    } catch (error) {
      setText(saveError, error.message || "Unable to save article", true);
      setText(saveStatus, "", false);
    }
  };

  const handleHeadlineSave = async (event) => {
    event.preventDefault();
    if (!headlineTextInput) {
      return;
    }

    setText(headlineStatus, "Saving headline...", true);
    setText(headlineError, "", false);

    try {
      const result = await window.KBData.saveTickerHeadline(headlineTextInput.value);
      const message = result?.scope === "remote"
        ? "Headline saved"
        : "Headline saved (local fallback)";
      setText(headlineStatus, message, true);
      setText(headlineError, "", false);
    } catch (error) {
      setText(headlineError, error.message || "Unable to save headline", true);
      setText(headlineStatus, "", false);
    }
  };

  const openHeadlineEditor = async () => {
    if (!headlineTextInput) {
      return;
    }

    setText(headlineStatus, "Loading headline...", true);
    setText(headlineError, "", false);

    try {
      const headline = await window.KBData.fetchTickerHeadline();
      headlineTextInput.value = headline || "";
      setAdminView("headline");
      setText(headlineStatus, "", false);
    } catch (error) {
      setText(headlineError, error.message || "Unable to load headline", true);
      setText(headlineStatus, "", false);
    }
  };

  const handleSaveShortcut = (event) => {
    const key = String(event.key || "").toLowerCase();
    const isSaveShortcut = (event.ctrlKey || event.metaKey) && key === "s";
    if (!isSaveShortcut) {
      return;
    }

    if (!editorPanel || editorPanel.hidden || !articleForm || !field.status) {
      return;
    }

    if (articleEditorPanel && articleEditorPanel.hidden) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    setText(saveStatus, "Saving article...", true);
    setText(saveError, "", false);
    articleForm.requestSubmit();
  };

  const applySessionState = async (session) => {
    if (!window.KBData.hasSupabaseConfig) {
      setVisibleState({ showWarning: true, showLogin: false, showEditor: false });
      return;
    }

    if (!session) {
      setVisibleState({ showWarning: false, showLogin: true, showEditor: false });
      hasInitializedEditorView = false;
      return;
    }

    setVisibleState({ showWarning: false, showLogin: false, showEditor: true });
    await refreshArticles();

    if (!hasInitializedEditorView) {
      const restoredDraft = restoreDraftFromStorage();
      setAdminView(restoredDraft ? "article" : "none");
      hasInitializedEditorView = true;
    }
  };

  const setup = async () => {
    populateCategoryOptions();
    renderTeamSelector();
    clearEditor();
    updateTableActionState();
    setupTableBuilderDialog();
    setupDeleteArticleDialog();
    setupActionConfirmDialog();

    loginForm.addEventListener("submit", handleLoginSubmit);
    articleForm.addEventListener("submit", handleArticleSave);
    headlineForm?.addEventListener("submit", handleHeadlineSave);

    createArticleViewButton?.addEventListener("click", () => {
      restoreDraftFromStorage();
      setAdminView("article");
    });

    updateHeadlineViewButton?.addEventListener("click", () => {
      openHeadlineEditor();
    });

    closeHeadlineEditorButton?.addEventListener("click", () => {
      setAdminView("none");
      setText(headlineStatus, "", false);
      setText(headlineError, "", false);
    });

    closeArticleEditorButton?.addEventListener("click", async () => {
      const confirmed = await requestActionConfirm(
        "Close the article editor and discard unsaved changes?",
        "Close Editor"
      );
      if (!confirmed) {
        return;
      }

      clearEditor();
      setAdminView("none");
    });

    newArticleButton.addEventListener("click", async () => {
      const confirmed = await requestActionConfirm(
        "Clear the form and remove unsaved edits?",
        "Clear Form"
      );
      if (!confirmed) {
        return;
      }

      clearEditor();
      setAdminView("article");
    });

    if (articleListSearch) {
      articleListSearch.addEventListener("input", () => {
        currentListFilter = articleListSearch.value.toLowerCase().trim();
        renderArticleList();
      });
    }

    if (editorToolbar) {
      editorToolbar.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-editor-action]");
        if (!button) {
          return;
        }

        event.preventDefault();
        await handleToolbarAction(button.dataset.editorAction);
      });
    }

    if (field.bodyEditor) {
      field.bodyEditor.addEventListener("input", () => {
        field.body.value = stripLegacyTickerParagraphFromBody(field.bodyEditor.innerHTML || "");
        writeDraftToStorage();
      });
      field.bodyEditor.addEventListener("mouseup", updateTableActionState);
      field.bodyEditor.addEventListener("keyup", updateTableActionState);
      field.bodyEditor.addEventListener("paste", () => {
        window.setTimeout(() => {
          sanitizeEditorContent(field.bodyEditor);
          placeCaretAtEditorEnd(field.bodyEditor);
          field.body.value = stripLegacyTickerParagraphFromBody(field.bodyEditor.innerHTML || "");
          writeDraftToStorage();
          updateTableActionState();
        }, 0);
      });
    }

    [
      field.title,
      field.slug,
      field.author,
      field.category,
      field.status,
      field.publishedAt,
      field.isSeries,
    ].forEach((input) => {
      input?.addEventListener("input", writeDraftToStorage);
      input?.addEventListener("change", writeDraftToStorage);
    });

    document.addEventListener("selectionchange", () => {
      const selection = window.getSelection();
      if (!selection || !selection.anchorNode || !field.bodyEditor.contains(selection.anchorNode)) {
        return;
      }

      updateTableActionState();
    });

    document.addEventListener("keydown", handleSaveShortcut);

    field.title.addEventListener("input", () => {
      syncGenerateSlugButtonState();
    });

    if (generateSlugButton) {
      generateSlugButton.addEventListener("click", () => {
        const title = field.title.value.trim();
        if (!title) {
          return;
        }

        field.slug.value = window.KBData.toSlug(title);
        writeDraftToStorage();
      });
    }

    logoutButton.addEventListener("click", async () => {
      try {
        await window.KBData.signOut();
      } catch (error) {
        setText(saveError, error.message || "Unable to sign out", true);
      }
    });

    window.KBData.onAuthStateChange((session) => {
      applySessionState(session).catch((error) => {
        setText(saveError, error.message || "Unable to refresh auth state", true);
      });
    });

    try {
      const session = await window.KBData.getSession();
      await applySessionState(session);
    } catch (error) {
      setVisibleState({ showWarning: false, showLogin: true, showEditor: false });
      setText(loginError, error.message || "Unable to initialize admin panel", true);
    }
  };

  setup();
})();
