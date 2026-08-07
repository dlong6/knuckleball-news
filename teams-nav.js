(function () {
  const MODAL_ID = "teams-nav-modal";
  const FORM_ID = "teams-nav-form";
  const TEAM_LIST_ID = "teams-nav-list";
  const CATEGORY_LIST_ID = "category-nav-list";
  const SEARCH_ID = "teams-nav-search";
  const ERROR_ID = "teams-nav-error";

  const getKnownTeam = (rawValue) => {
    const value = String(rawValue || "").trim();
    if (!value) {
      return "";
    }

    const slug = window.KBData.toSlug(value);
    return window.KBData.TEAM_LABELS.find((team) => window.KBData.toSlug(team) === slug) || "";
  };

  const getKnownCategory = (rawValue) => {
    const value = String(rawValue || "").trim();
    if (!value) {
      return "";
    }

    const slug = window.KBData.toSlug(value);
    return (
      window.KBData.CATEGORY_OPTIONS.find((category) => window.KBData.toSlug(category) === slug) || ""
    );
  };

  const buildModal = () => {
    if (document.getElementById(MODAL_ID)) {
      return document.getElementById(MODAL_ID);
    }

    const dialog = document.createElement("dialog");
    dialog.id = MODAL_ID;
    dialog.className = "teams-modal";
    dialog.setAttribute("aria-labelledby", "teams-nav-title");

    const form = document.createElement("form");
    form.id = FORM_ID;
    form.className = "teams-modal-form";
    form.method = "dialog";

    const heading = document.createElement("h2");
    heading.id = "teams-nav-title";
    heading.textContent = "Search Articles";

    const intro = document.createElement("p");
    intro.textContent = "Choose a team, category, or series to open a new results page.";

    const searchWrap = document.createElement("label");
    searchWrap.className = "team-modal-search-wrap";
    searchWrap.setAttribute("for", SEARCH_ID);
    searchWrap.textContent = "Search teams and categories";

    const searchInput = document.createElement("input");
    searchInput.id = SEARCH_ID;
    searchInput.className = "team-modal-search";
    searchInput.type = "search";
    searchInput.placeholder = "Type team, category, or series";
    searchInput.autocomplete = "off";
    searchWrap.appendChild(searchInput);

    const teamHeading = document.createElement("p");
    teamHeading.className = "team-modal-section";
    teamHeading.textContent = "Teams";

    const teamGrid = document.createElement("div");
    teamGrid.id = TEAM_LIST_ID;
    teamGrid.className = "team-modal-grid";
    teamGrid.dataset.modalGroup = "teams";
    teamGrid.setAttribute("role", "listbox");
    teamGrid.setAttribute("aria-label", "MLB teams");

    window.KBData.TEAM_LABELS.forEach((team) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "team-modal-team";
      button.dataset.searchOption = "team";
      button.dataset.optionValue = team;
      button.textContent = team;
      teamGrid.appendChild(button);
    });

    const categoryHeading = document.createElement("p");
    categoryHeading.className = "team-modal-section";
    categoryHeading.textContent = "Category";

    const categoryGrid = document.createElement("div");
    categoryGrid.id = CATEGORY_LIST_ID;
    categoryGrid.className = "team-modal-grid";
    categoryGrid.dataset.modalGroup = "categories";
    categoryGrid.setAttribute("role", "listbox");
    categoryGrid.setAttribute("aria-label", "Article categories and series");

    window.KBData.CATEGORY_OPTIONS.forEach((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "team-modal-team";
      button.dataset.searchOption = "category";
      button.dataset.optionValue = category;
      button.textContent = category;
      categoryGrid.appendChild(button);
    });

    const seriesButton = document.createElement("button");
    seriesButton.type = "button";
    seriesButton.className = "team-modal-team";
    seriesButton.dataset.searchOption = "series";
    seriesButton.dataset.optionValue = "series";
    seriesButton.textContent = "Series";
    categoryGrid.appendChild(seriesButton);

    const error = document.createElement("p");
    error.id = ERROR_ID;
    error.className = "form-error";
    error.hidden = true;

    const actions = document.createElement("div");
    actions.className = "team-modal-actions";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "secondary-button";
    closeButton.textContent = "Close";
    closeButton.dataset.closeTeamsModal = "true";

    actions.appendChild(closeButton);

    form.appendChild(heading);
    form.appendChild(intro);
    form.appendChild(searchWrap);
    form.appendChild(teamHeading);
    form.appendChild(teamGrid);
    form.appendChild(categoryHeading);
    form.appendChild(categoryGrid);
    form.appendChild(error);
    form.appendChild(actions);
    dialog.appendChild(form);

    document.body.appendChild(dialog);
    return dialog;
  };

  const openSearchPage = (optionType, rawValue) => {
    let targetUrl = "";

    if (optionType === "team") {
      const knownTeam = getKnownTeam(rawValue);
      if (!knownTeam) {
        return false;
      }
      targetUrl = `team.html?team=${encodeURIComponent(knownTeam)}`;
    }

    if (optionType === "category") {
      const knownCategory = getKnownCategory(rawValue);
      if (!knownCategory) {
        return false;
      }
      targetUrl = `category.html?category=${encodeURIComponent(knownCategory)}`;
    }

    if (optionType === "series") {
      targetUrl = "category.html?series=true";
    }

    if (!targetUrl) {
      return false;
    }

    const win = window.open(targetUrl, "_blank", "noopener,noreferrer");
    return Boolean(win);
  };

  const bindModalEvents = (dialog) => {
    const form = dialog.querySelector(`#${FORM_ID}`);
    const teamGrid = dialog.querySelector(`#${TEAM_LIST_ID}`);
    const categoryGrid = dialog.querySelector(`#${CATEGORY_LIST_ID}`);
    const searchInput = dialog.querySelector(`#${SEARCH_ID}`);
    const error = dialog.querySelector(`#${ERROR_ID}`);

    if (!form || !teamGrid || !categoryGrid || !searchInput || !error) {
      return;
    }

    if (dialog.dataset.bound === "true") {
      return;
    }

    const allOptionGrids = [teamGrid, categoryGrid];
    const allOptionButtons = () =>
      allOptionGrids.flatMap((grid) => Array.from(grid.querySelectorAll("button[data-search-option]")));

    form.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target ? target.closest("button[data-search-option]") : null;

      if (button) {
        error.hidden = true;
        const opened = openSearchPage(button.dataset.searchOption || "", button.dataset.optionValue || "");
        if (!opened) {
          error.hidden = false;
          error.textContent = "Unable to open the selected page. Please allow pop-ups for this site.";
          return;
        }

        dialog.close();
        return;
      }

      const closeTrigger = target ? target.closest("[data-close-teams-modal='true']") : null;
      if (closeTrigger) {
        dialog.close();
        return;
      }
    });

    searchInput.addEventListener("input", () => {
      const terms = searchInput.value
        .toLowerCase()
        .trim()
        .split(/\s+/)
        .filter(Boolean);

      allOptionButtons().forEach((button) => {
        const optionText = String(button.textContent || "").toLowerCase();
        const isMatch = terms.every((term) => optionText.includes(term));
        button.hidden = !isMatch;
      });
    });

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        dialog.close();
      }
    });

    dialog.addEventListener("close", () => {
      searchInput.value = "";
      allOptionButtons().forEach((button) => {
        button.hidden = false;
      });
      error.hidden = true;
    });

    dialog.dataset.bound = "true";
  };

  const bindNavTriggers = (dialog) => {
    const triggers = Array.from(document.querySelectorAll("[data-open-team-modal='true']"));
    triggers.forEach((trigger) => {
      trigger.addEventListener("click", (event) => {
        event.preventDefault();

        if (typeof dialog.showModal === "function") {
          dialog.showModal();
          return;
        }

        dialog.setAttribute("open", "");
      });
    });
  };

  const setupTeamsNav = () => {
    if (
      !window.KBData ||
      !Array.isArray(window.KBData.TEAM_LABELS) ||
      !Array.isArray(window.KBData.CATEGORY_OPTIONS)
    ) {
      return;
    }

    const dialog = buildModal();
    bindModalEvents(dialog);
    bindNavTriggers(dialog);
  };

  setupTeamsNav();
})();
