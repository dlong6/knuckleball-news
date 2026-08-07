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
  const generateSlugButton = document.querySelector("#generate-slug-button");
  const saveStatus = document.querySelector("#save-status");
  const saveError = document.querySelector("#save-error");
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
  const teamsSelector = document.querySelector("#article-teams-selector");
  const TICKER_ATTR = "data-wormburner-ticker";
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
    ticker: document.querySelector("#article-ticker"),
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
  let selectedTeams = new Set();

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

  const clearEditor = () => {
    field.id.value = "";
    field.title.value = "";
    field.slug.value = "";
    field.author.value = "";
    field.category.value = "";
    field.ticker.value = "";
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

  const escapeHtml = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const createTickerParagraphHtml = (tickerText) =>
    `<p ${TICKER_ATTR}="true">${escapeHtml(tickerText).replace(/\n/g, "<br />")}</p>`;

  const stripTickerParagraphFromBody = (bodyHtml) => {
    const container = document.createElement("div");
    container.innerHTML = String(bodyHtml || "").trim();

    const taggedTicker = container.querySelector(`p[${TICKER_ATTR}="true"]`);
    if (taggedTicker) {
      taggedTicker.remove();
    }

    return container.innerHTML.trim();
  };

  const extractTickerFromBody = (bodyHtml) => {
    const container = document.createElement("div");
    container.innerHTML = String(bodyHtml || "").trim();

    const taggedTicker = container.querySelector(`p[${TICKER_ATTR}="true"]`);
    const tickerText = taggedTicker
      ? (taggedTicker.textContent || "").replace(/\s+/g, " ").trim()
      : "";

    if (taggedTicker) {
      taggedTicker.remove();
    }

    return {
      tickerText,
      bodyWithoutTicker: container.innerHTML.trim(),
    };
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

  const normalizeEditorTables = (root = field.bodyEditor) => {
    if (!root) {
      return;
    }

    Array.from(root.querySelectorAll("table")).forEach((table) => {
      // Unwrap common pasted containers so only the canonical wrapper remains.
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

      // Remove pasted column sizing so CSS controls widths consistently.
      table.querySelectorAll("colgroup, col").forEach((node) => node.remove());
      table.querySelectorAll("caption").forEach((node) => node.remove());

      // Flatten rich pasted formatting to plain text so all cells match site styling.
      table.querySelectorAll("th, td").forEach((cell) => {
        let text = (cell.textContent || "").replace(/\s+/g, " ").trim();
        if (cell.tagName === "TH") {
          text = text.replace(/\s*click to sort (ascending|descending)\s*/gi, " ").replace(/\s+/g, " ").trim();
          text = text.replace(/\s*\([^)]*\)\s*$/g, "").trim();
        }
        cell.innerHTML = text;
      });

      table.className = "stats-table";

      if (!table.closest(".stats-table-wrap")) {
        const wrap = document.createElement("div");
        wrap.className = "stats-table-wrap";
        wrap.setAttribute("aria-label", "Article data table");
        table.parentNode?.insertBefore(wrap, table);
        wrap.appendChild(table);
      }
    });
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

  const fillEditor = (article) => {
    field.id.value = article.id || "";
    field.title.value = article.title || "";
    field.slug.value = article.slug || "";
    field.author.value = article.author || "";
    field.category.value = article.category || "";
    const tickerData = extractTickerFromBody(article.body_html || "");
    field.ticker.value = tickerData.tickerText;
    field.isSeries.checked = Boolean(article.is_series);
    field.status.value = article.status || "published";
    field.publishedAt.value = toLocalDateTimeInputValue(article.published_at);
    setSelectedTeams(parseTeamsInput(article.teams || []));
    field.body.value = tickerData.bodyWithoutTicker;
    field.bodyEditor.innerHTML = tickerData.bodyWithoutTicker;
    normalizeEditorLinks(field.bodyEditor);
    normalizeEditorTables(field.bodyEditor);
    syncGenerateSlugButtonState();
    updateTableActionState();
    setText(saveStatus, "Editing article", true);
    setText(saveError, "", false);
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
      normalizeEditorLinks(field.bodyEditor);
      normalizeEditorTables(field.bodyEditor);
      const bodyWithoutTicker = stripTickerParagraphFromBody(field.bodyEditor.innerHTML.trim());
      const tickerText = String(field.ticker?.value || "").trim();

      let composedBody = bodyWithoutTicker;
      if (tickerText) {
        const tickerParagraph = createTickerParagraphHtml(tickerText);
        composedBody = bodyWithoutTicker
          ? `${tickerParagraph}\n${bodyWithoutTicker}`
          : tickerParagraph;
      }

      field.body.value = composedBody;

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
      if (!field.id.value) {
        clearEditor();
      } else {
        field.body.value = bodyWithoutTicker;
      }
    } catch (error) {
      setText(saveError, error.message || "Unable to save article", true);
      setText(saveStatus, "", false);
    }
  };

  const handleDraftSaveShortcut = (event) => {
    const key = String(event.key || "").toLowerCase();
    const isSaveShortcut = (event.ctrlKey || event.metaKey) && key === "s";
    if (!isSaveShortcut) {
      return;
    }

    if (!editorPanel || editorPanel.hidden || !articleForm || !field.status) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    field.status.value = "draft";
    setText(saveStatus, "Saving draft...", true);
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
      return;
    }

    setVisibleState({ showWarning: false, showLogin: false, showEditor: true });
    await refreshArticles();
  };

  const setup = async () => {
    populateCategoryOptions();
    renderTeamSelector();
    clearEditor();
    updateTableActionState();
    setupTableBuilderDialog();
    setupDeleteArticleDialog();

    loginForm.addEventListener("submit", handleLoginSubmit);
    articleForm.addEventListener("submit", handleArticleSave);

    newArticleButton.addEventListener("click", () => {
      clearEditor();
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
      field.bodyEditor.addEventListener("mouseup", updateTableActionState);
      field.bodyEditor.addEventListener("keyup", updateTableActionState);
      field.bodyEditor.addEventListener("paste", () => {
        window.setTimeout(() => {
          normalizeEditorLinks(field.bodyEditor);
          normalizeEditorTables(field.bodyEditor);
          updateTableActionState();
        }, 0);
      });
    }

    document.addEventListener("selectionchange", () => {
      const selection = window.getSelection();
      if (!selection || !selection.anchorNode || !field.bodyEditor.contains(selection.anchorNode)) {
        return;
      }

      updateTableActionState();
    });

    document.addEventListener("keydown", handleDraftSaveShortcut);

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
