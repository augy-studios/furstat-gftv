const Icons = {
  trophy: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M7 21h10v-2H7v2Zm5-4a5 5 0 0 0 5-5V5h2a2 2 0 0 1 2 2v1a5 5 0 0 1-4 4.9A7 7 0 0 1 13 17h-2a7 7 0 0 1-4-4.1A5 5 0 0 1 3 8V7a2 2 0 0 1 2-2h2v7a5 5 0 0 0 5 5Zm7-10V7h-2v2.6A3 3 0 0 0 19 7ZM5 9.6V7H3v1a3 3 0 0 0 2 1.6Z"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M3 3h2v18H3V3Zm16 6h2v12h-2V9ZM9 13h2v8H9v-8Zm4-10h2v18h-2V3Z"/></svg>`,
  map: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M15 4.5 9 3 3 4.5v15L9 18l6 1.5 6-1.5v-15L15 6V4.5ZM9 5.3l4 1V18.7l-4-1V5.3ZM5 6.1 7 5.6V17.9L5 18.4V6.1Zm14 11.5-2 .5V5.9l2-.5v12.2Z"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 21s-7.5-4.3-9.7-8.4A5.6 5.6 0 0 1 12 6a5.6 5.6 0 0 1 9.7 6.6C19.5 16.7 12 21 12 21Z"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 22A10 10 0 1 1 22 12 10 10 0 0 1 12 22Zm1-10V7h-2v7h6v-2h-4Z"/></svg>`
};

const $ = (sel, p = document) => p.querySelector(sel);
const $$ = (sel, p = document) => Array.from(p.querySelectorAll(sel));

const state = {
  data: {
    sections: []
  },
  tags: new Set(),
  activeTags: new Set(),
  q: "",
};

function icon(name) {
  return Icons[name] || Icons.chart;
}

function tagChip(tag) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "tag";
  b.innerHTML = `#${tag} <span class="x" aria-hidden="true">×</span>`;
  b.setAttribute("aria-pressed", state.activeTags.has(tag) ? "true" : "false");
  b.addEventListener("click", () => {
    if (state.activeTags.has(tag)) state.activeTags.delete(tag);
    else state.activeTags.add(tag);
    render();
  });
  return b;
}

function card(item) {
  const a = document.createElement("article");
  a.className = "card";
  a.tabIndex = 0;
  a.setAttribute("role", "link");
  a.setAttribute("aria-label", item.title);
  a.addEventListener("click", () => window.location.href = item.href);
  a.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      window.location.href = item.href;
    }
  });

  const accent = item.accent || "var(--accent)";
  a.innerHTML = `
    <div class="icon" style="color:${accent}">${icon(item.icon)}</div>
    <h3>${item.title}</h3>
    <p>${item.desc || ""}</p>
    <div class="meta">
      ${item.new ? '<span class="badge">New</span>' : ''}
      ${(item.tags||[]).slice(0,3).map(t=>`<span class="tag-sm">#${t}</span>`).join("")}
    </div>
  `;
  return a;
}

function normalize(str) {
  return (str || "").toLowerCase();
}

function filterItems(items) {
  const q = normalize(state.q);
  const hasTags = state.activeTags.size > 0;
  return items.filter(it => {
    const text = `${it.title} ${it.desc} ${(it.tags||[]).join(" ")}`.toLowerCase();
    const matchesQ = q ? text.includes(q) : true;
    const matchesTags = hasTags ? (it.tags || []).some(t => state.activeTags.has(t)) : true;
    return matchesQ && matchesTags;
  });
}

function collectTags(data) {
  state.tags = new Set();
  for (const s of data.sections || []) {
    for (const it of s.items || [])(it.tags || []).forEach(t => state.tags.add(t));
  }
}

function render() {
  const container = $("#sections");
  container.innerHTML = "";

  let totalCount = 0;
  for (const section of state.data.sections || []) {
    const items = filterItems(section.items || []);
    totalCount += items.length;

    if (items.length === 0) continue;

    const sec = document.createElement("div");
    sec.className = "section";
    sec.innerHTML = `<h2>${section.title}</h2>`;

    const grid = document.createElement("div");
    grid.className = "grid";
    items.forEach(it => grid.appendChild(card(it)));

    sec.appendChild(grid);
    container.appendChild(sec);
  }

  $("#empty").classList.toggle("hidden", totalCount !== 0);
}

async function loadData() {
  try {
    const res = await fetch("/assets/pages.json", {
      cache: "no-store"
    });
    if (!res.ok) throw new Error("Failed to load pages.json");
    state.data = await res.json();
  } catch (err) {
    console.warn(err);
    // Fallback demo data to keep the page usable if pages.json is missing
    state.data = {
      sections: [{
          title: "Popular",
          items: [{
              id: "leaders",
              title: "Global Leaderboards",
              href: "leaderboards/index.html",
              desc: "Top players, by game & season.",
              icon: "trophy",
              tags: ["global", "live", "rankings"],
              new: true
            },
            {
              id: "heatmap",
              title: "Live Heatmap",
              href: "heatmap/index.html",
              desc: "Real‑time activity across regions.",
              icon: "map",
              tags: ["live", "regions"],
              accent: "#06b6d4"
            },
            {
              id: "sentiment",
              title: "Community Sentiment",
              href: "sentiment/index.html",
              desc: "Social chatter trendlines.",
              icon: "heart",
              tags: ["social", "trend"]
            }
          ]
        },
        {
          title: "By Category",
          items: [{
              id: "attendance",
              title: "Attendance Trends",
              href: "attendance/index.html",
              desc: "Multi‑year event growth.",
              icon: "chart",
              tags: ["events", "history"],
              accent: "#f43f5e"
            },
            {
              id: "timelines",
              title: "Timelines & Milestones",
              href: "timelines/index.html",
              desc: "Roadmaps and rollouts.",
              icon: "clock",
              tags: ["planning", "org"]
            }
          ]
        }
      ]
    };
  }
  collectTags(state.data);
  renderTags();
  render();
}

function renderTags() {
  const wrap = $("#tags");
  wrap.innerHTML = "";
  Array.from(state.tags).sort((a, b) => a.localeCompare(b)).forEach(t => wrap.appendChild(tagChip(t)));
}

function initSearch() {
  const input = $("#search");
  input.addEventListener("input", (e) => {
    state.q = e.target.value;
    render();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    }
  });
}

function initTheme() {
  const btn = $("#themeToggle");
  const key = "fsh-theme";

  const updateButton = (t) => {
    btn.textContent = t === "light" ? "☀️" : t === "dark" ? "🌙" : "🖥️";
    btn.setAttribute("aria-label", `Theme: ${t}`);
  };

  const apply = (t) => {
    document.documentElement.dataset.theme = t; // "dark" | "light" | "auto"
    updateButton(t);
  };

  const toggle = () => {
    const cur = localStorage.getItem(key) || "auto";
    const next = cur === "dark" ? "light" : cur === "light" ? "auto" : "dark";
    localStorage.setItem(key, next);
    apply(next);
  };

  apply(localStorage.getItem(key) || "auto");
  btn.addEventListener("click", toggle);
}

function initMisc() {
  $("#year").textContent = new Date().getFullYear();
  $("#clearFilters").addEventListener("click", () => {
    state.activeTags.clear();
    state.q = "";
    $("#search").value = "";
    renderTags();
    render();
  });
}

window.addEventListener("DOMContentLoaded", () => {
  initSearch();
  initTheme();
  initMisc();
  loadData();
});