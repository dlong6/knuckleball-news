// Chirps page (chirps.html): archive of every ticker headline.
// Lists every headline saved to public.ticker_history, newest first,
// grouped by day, with a search box to filter them.
(function () {
  const list = document.querySelector("#headline-archive-list");
  const status = document.querySelector("#headline-archive-status");
  const searchInput = document.querySelector("#headline-archive-search");

  if (!list || !status) {
    return;
  }

  let allHeadlines = [];

  const setStatus = (text) => {
    status.textContent = text;
    status.hidden = !text;
  };

  const dayLabel = (iso) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return "Undated";
    }
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date);
  };

  const timeLabel = (iso) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date);
  };

  const render = (headlines) => {
    list.innerHTML = "";

    if (!headlines.length) {
      const query = searchInput?.value.trim();
      setStatus(query ? `No chirps match "${query}".` : "No chirps yet.");
      return;
    }

    setStatus("");

    let currentDay = null;
    let dayItems = null;

    headlines.forEach((entry) => {
      const day = dayLabel(entry.posted_at);
      if (day !== currentDay) {
        currentDay = day;
        const group = document.createElement("li");
        group.className = "headline-archive-day";

        const heading = document.createElement("h3");
        heading.textContent = day;

        dayItems = document.createElement("ul");
        group.appendChild(heading);
        group.appendChild(dayItems);
        list.appendChild(group);
      }

      const item = document.createElement("li");
      item.className = "headline-archive-item";

      const time = document.createElement("time");
      time.className = "headline-archive-time";
      time.dateTime = entry.posted_at || "";
      time.textContent = timeLabel(entry.posted_at);

      const text = document.createElement("p");
      text.className = "headline-archive-text";
      text.textContent = entry.headline;

      item.appendChild(time);
      item.appendChild(text);
      dayItems.appendChild(item);
    });
  };

  const applySearch = () => {
    const terms = (searchInput?.value || "").toLowerCase().split(/\s+/).filter(Boolean);
    const matches = terms.length
      ? allHeadlines.filter((entry) => {
          const source = entry.headline.toLowerCase();
          return terms.every((term) => source.includes(term));
        })
      : allHeadlines;
    render(matches);
  };

  const load = async () => {
    if (!window.KBData || typeof window.KBData.fetchTickerHistory !== "function") {
      setStatus("Chirps are unavailable right now.");
      return;
    }

    try {
      allHeadlines = await window.KBData.fetchTickerHistory();
      applySearch();
    } catch (error) {
      console.error("Unable to load chirps", error);
      setStatus("Chirps couldn't be loaded right now. Please try again later.");
    }
  };

  searchInput?.addEventListener("input", applySearch);
  load();
})();
