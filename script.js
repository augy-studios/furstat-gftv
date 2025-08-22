(function () {
  const dashboardEl = document.getElementById('dashboard');
  const themeToggle = document.getElementById('themeToggle');

  const DEFAULTS = {
    configCandidates: ['assets/config.json', 'assets/config.sample.json'],
    palette: ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#f87171', '#22d3ee', '#fb923c']
  };

  initTheme();
  bindUI();
  loadDefaultConfig();

  function bindUI() {
    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light');
        localStorage.setItem('fs_theme', document.body.classList.contains('light') ? 'light' : 'dark');
      });
    }
  }

  async function loadDefaultConfig() {
    for (const url of DEFAULTS.configCandidates) {
      try {
        const res = await fetch(url, {
          cache: 'no-store'
        });
        if (res.ok) {
          const cfg = await res.json();
          renderDashboard(cfg);
          return;
        }
      } catch (e) {
        /* try next */ }
    }
    dashboardEl.innerHTML = `<div class="card"><h3>No config found</h3><p class="muted">Place <code>assets/config.json</code> in your project.</p></div>`;
  }

  function initTheme() {
    const t = localStorage.getItem('fs_theme');
    if (t === 'light') document.body.classList.add('light');
  }

  async function renderDashboard(config) {
    if (!config || !Array.isArray(config.charts)) {
      dashboardEl.innerHTML = `<div class="card"><h3>Invalid config</h3><p class="muted">Config must contain a <code>charts</code> array.</p></div>`;
      return;
    }
    dashboardEl.innerHTML = '';

    for (const chart of config.charts) {
      const card = document.createElement('article');
      card.className = 'card';
      const chartId = `chart_${chart.id || Math.random().toString(36).slice(2)}`;
      card.innerHTML = `
        <div class="toolbar">
          <button class="btn" data-dlpng>PNG</button>
          <button class="btn" data-dljson>JSON</button>
          <button class="btn" data-dlcsv>CSV</button>
        </div>
        <h3>${escapeHtml(chart.title || chart.id || 'Untitled')}</h3>
        <div id="${chartId}" class="chart"></div>
      `;
      dashboardEl.appendChild(card);

      try {
        const rows = await loadRows(chart.source);
        const {
          data,
          layout,
          csvOut
        } = buildPlot(chart, rows);
        await Plotly.newPlot(chartId, data, layout, {
          displayModeBar: false,
          responsive: true
        });

        card.querySelector('[data-dlpng]').addEventListener('click', () =>
          Plotly.toImage(chartId, {
            format: 'png',
            height: 720,
            width: 1280
          }).then(url => download(url, `${chart.id||'chart'}.png`))
        );
        card.querySelector('[data-dljson]').addEventListener('click', () => {
          const blob = new Blob([JSON.stringify({
            chart,
            sample: rows.slice(0, 20)
          }, null, 2)], {
            type: 'application/json'
          });
          download(URL.createObjectURL(blob), `${chart.id||'chart'}.json`);
        });
        card.querySelector('[data-dlcsv]').addEventListener('click', () => {
          const blob = new Blob([csvOut], {
            type: 'text/csv'
          });
          download(URL.createObjectURL(blob), `${chart.id||'chart'}.csv`);
        });
      } catch (err) {
        console.error(err);
        card.insertAdjacentHTML('beforeend', `<p class="muted">Failed to render: ${escapeHtml(err.message||String(err))}</p>`);
      }
    }
  }

  // --- Data loading helpers ---
  async function loadRows(source) {
    if (!source) throw new Error('Missing source');
    if (source.type === 'csv' && source.path) {
      return parseCsvFromUrl(source.path);
    }
    if ((source.type === 'google_sheet' || source.type === 'google_form') && (source.url || source.sheetUrl)) {
      const url = toGoogleCsvUrl(source);
      return parseCsvFromUrl(url);
    }
    if (source.type === 'url' && source.url) {
      return parseCsvFromUrl(source.url);
    }
    if (source.type === 'inline' && Array.isArray(source.rows)) {
      return source.rows;
    }
    throw new Error('Unsupported or invalid source');
  }

  async function parseCsvFromUrl(url) {
    return new Promise((resolve, reject) => {
      Papa.parse(url, {
        download: true,
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (r) => resolve(r.data),
        error: (e) => reject(e)
      });
    });
  }

  function toGoogleCsvUrl(source) {
    // Expecting: source.url (or sheetUrl), optional source.sheet, optional source.range
    const sheetUrl = source.url || source.sheetUrl;
    const sheetName = source.sheet;
    const range = source.range;

    try {
      const u = new URL(sheetUrl);
      const isSheet = u.hostname.includes('docs.google.com');
      if (!isSheet) return sheetUrl; // assume it's already a direct CSV URL

      // Extract doc id and gid (if present)
      const idMatch = u.pathname.match(/\/d\/([a-zA-Z0-9-_]+)/);
      const id = idMatch ? idMatch[1] : null;
      const gid = u.searchParams.get('gid');

      if (!id) return sheetUrl;

      // Base CSV export
      const base = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`;

      // Priority:
      // 1) If range is provided AND a sheet name is given, use sheet+range (most precise).
      // 2) Else if gid exists, use gid (targets that tab).
      // 3) Else if only sheet name is given, use sheet.
      // 4) Fallback: whole spreadsheet default export.
      if (range && sheetName) {
        return `${base}&sheet=${encodeURIComponent(sheetName)}&range=${encodeURIComponent(range)}`;
      }
      if (gid) {
        return `${base}&gid=${encodeURIComponent(gid)}`;
      }
      if (sheetName) {
        return `${base}&sheet=${encodeURIComponent(sheetName)}`;
      }
      return base;
    } catch {
      return sheetUrl;
    }
  }

  // --- Plot builders ---
  function buildPlot(chart, rows) {
    const type = chart.chart ?.type || 'bar';
    const palette = (chart.chart ?.options ?.colors) || DEFAULTS.palette;
    const title = chart.title || chart.id || '';
    const csvOut = toCsv(rows);

    if (type === 'bar') return buildBar(chart, rows, palette, title, csvOut);
    if (type === 'line') return buildLine(chart, rows, palette, title, csvOut);
    if (type === 'pie') return buildPie(chart, rows, palette, title, csvOut);
    if (type === 'scatter') return buildScatter(chart, rows, palette, title, csvOut);
    if (type === 'combo') return buildCombo(chart, rows, palette, title, csvOut);
    if (type === 'sunburst') return buildSunburst(chart, rows, palette, title, csvOut);
    throw new Error(`Unsupported chart type: ${type}`);
  }

  function buildBar(chart, rows, palette, title, csvOut) {
    const m = chart.mapping || {};
    const xK = m.x,
      yK = m.y,
      gK = m.group;
    if (!xK || !yK) throw new Error('Bar chart requires mapping.x and mapping.y');
    let traces = [];
    if (gK) {
      const groups = groupBy(rows, r => r[gK]);
      let i = 0;
      for (const [g, arr] of groups) {
        traces.push({
          type: 'bar',
          name: String(g),
          x: arr.map(r => r[xK]),
          y: arr.map(r => toNum(r[yK])),
          marker: {
            color: palette[i++ % palette.length]
          }
        });
      }
    } else {
      traces = [{
        type: 'bar',
        x: rows.map(r => r[xK]),
        y: rows.map(r => toNum(r[yK])),
        marker: {
          color: palette[0]
        }
      }];
    }
    const layout = baseLayout(title);
    if (chart.chart ?.stacked) layout.barmode = 'stack';
    return {
      data: traces,
      layout,
      csvOut
    };
  }

  function buildLine(chart, rows, palette, title, csvOut) {
    const m = chart.mapping || {};
    const xK = m.x,
      yK = m.y,
      gK = m.group;
    if (!xK || !yK) throw new Error('Line chart requires mapping.x and mapping.y');
    let traces = [];
    if (gK) {
      const groups = groupBy(rows, r => r[gK]);
      let i = 0;
      for (const [g, arr] of groups) {
        traces.push({
          type: 'scatter',
          mode: 'lines+markers',
          name: String(g),
          x: arr.map(r => r[xK]),
          y: arr.map(r => toNum(r[yK])),
          line: {
            shape: 'spline'
          },
          marker: {
            size: 6
          },
          hovertemplate: '%{x}: %{y}<extra>' + String(g) + '</extra>',
          line: {
            color: palette[i++ % palette.length]
          }
        });
      }
    } else {
      traces = [{
        type: 'scatter',
        mode: 'lines+markers',
        x: rows.map(r => r[xK]),
        y: rows.map(r => toNum(r[yK])),
        line: {
          shape: 'spline',
          color: palette[0]
        },
        marker: {
          size: 6
        }
      }];
    }
    const layout = baseLayout(title);
    return {
      data: traces,
      layout,
      csvOut
    };
  }

  function buildScatter(chart, rows, palette, title, csvOut) {
    const m = chart.mapping || {};
    const xK = m.x,
      yK = m.y,
      gK = m.group;
    if (!xK || !yK) throw new Error('Scatter chart requires mapping.x and mapping.y');
    let traces = [];
    let i = 0;
    if (gK) {
      const groups = groupBy(rows, r => r[gK]);
      for (const [g, arr] of groups) {
        traces.push({
          type: 'scatter',
          mode: 'markers',
          name: String(g),
          x: arr.map(r => toNum(r[xK])),
          y: arr.map(r => toNum(r[yK])),
          marker: {
            size: 8,
            color: palette[i++ % palette.length]
          }
        });
      }
    } else {
      traces = [{
        type: 'scatter',
        mode: 'markers',
        x: rows.map(r => toNum(r[xK])),
        y: rows.map(r => toNum(r[yK])),
        marker: {
          size: 8,
          color: palette[0]
        }
      }];
    }
    const layout = baseLayout(title);
    return {
      data: traces,
      layout,
      csvOut
    };
  }

  function buildPie(chart, rows, palette, title, csvOut) {
    const m = chart.mapping || {};
    const lK = m.label || m.x,
      vK = m.value || m.y;
    if (!lK) throw new Error('Pie chart requires mapping.label (or mapping.x)');
    let labels = [],
      values = [];
    if (vK) {
      labels = rows.map(r => r[lK]);
      values = rows.map(r => toNum(r[vK]));
    } else {
      const counts = countBy(rows, r => r[lK]);
      for (const [k, v] of counts) {
        labels.push(String(k));
        values.push(v);
      }
    }
    const trace = {
      type: 'pie',
      labels,
      values,
      textinfo: 'label+percent',
      marker: {
        colors: palette
      }
    };
    const layout = baseLayout(title);
    layout.showlegend = false;
    return {
      data: [trace],
      layout,
      csvOut
    };
  }

  function buildCombo(chart, rows, palette, title, csvOut) {
    const m = chart.mapping || {};
    const xK = m.x,
      yBar = m.bar || m.y,
      yLine = m.line || m.y2;
    if (!xK || !yBar || !yLine) throw new Error('Combo requires mapping.x, mapping.bar, mapping.line');
    const bar = {
      type: 'bar',
      name: chart.chart ?.barName || 'Bar',
      x: rows.map(r => r[xK]),
      y: rows.map(r => toNum(r[yBar])),
      marker: {
        color: palette[0]
      }
    };
    const line = {
      type: 'scatter',
      mode: 'lines+markers',
      name: chart.chart ?.lineName || 'Line',
      x: rows.map(r => r[xK]),
      y: rows.map(r => toNum(r[yLine])),
      yaxis: 'y2',
      line: {
        shape: 'spline',
        color: palette[1]
      },
      marker: {
        size: 6
      }
    };
    const layout = baseLayout(title);
    layout.yaxis2 = {
      overlaying: 'y',
      side: 'right'
    };
    return {
      data: [bar, line],
      layout,
      csvOut
    };
  }

  function buildSunburst(chart, rows, palette, title, csvOut) {
    const m = chart.mapping || {};
    const labelsK = m.labels || m.label;
    const parentsK = m.parents || m.parent;
    const valuesK = m.values || m.value;
    const path = m.path; // optional: array of columns for hierarchical path, e.g. ["Region","Country","City"]

    let trace;

    if (Array.isArray(path) && path.length >= 2) {
      // Build (labels, parents, values) from a path of columns
      // If valuesK is provided, sum it; else count rows per leaf.
      const sep = ' / ';
      const nodeMap = new Map(); // id -> {label, parent, value}
      const getId = (parts) => parts.join(sep);

      for (const r of rows) {
        const parts = path.map(k => String(r[k] ?? ''));
        // Build nodes for each depth
        for (let d = 0; d < parts.length; d++) {
          const label = parts[d];
          const id = getId(parts.slice(0, d + 1));
          const parent = d === 0 ? '' : getId(parts.slice(0, d));

          if (!nodeMap.has(id)) nodeMap.set(id, {
            label,
            parent,
            value: 0
          });
          // Only add value at the leaf level
          if (d === parts.length - 1) {
            const inc = valuesK ? Number(r[valuesK]) || 0 : 1;
            nodeMap.get(id).value += inc;
          }
        }
      }

      const labels = [],
        parents = [],
        values = [];
      nodeMap.forEach(n => {
        labels.push(n.label);
        parents.push(n.parent || '');
        values.push(n.value);
      });

      trace = {
        type: 'sunburst',
        labels,
        parents,
        values,
        branchvalues: 'total',
        marker: {
          colors: palette
        }
      };
    } else if (labelsK && parentsK) {
      // Direct labels/parents (+ optional values) mapping
      const labels = rows.map(r => r[labelsK]);
      const parents = rows.map(r => r[parentsK] ?? '');
      const values = valuesK ? rows.map(r => Number(r[valuesK]) || 0) : undefined;

      trace = {
        type: 'sunburst',
        labels,
        parents,
        ...(values ? {
          values,
          branchvalues: 'total'
        } : {}),
        marker: {
          colors: palette
        }
      };
    } else {
      throw new Error('Sunburst requires either mapping.path (array) OR mapping.labels/parents with optional values');
    }

    const layout = baseLayout(title);
    layout.sunburstcolorway = palette;
    layout.extendtreemapcolors = true;

    return {
      data: [trace],
      layout,
      csvOut
    };
  }

  function baseLayout(title) {
    return {
      title: {
        text: title,
        font: {
          size: 18
        }
      },
      margin: {
        l: 40,
        r: 30,
        t: 40,
        b: 40
      },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: {
        color: getComputedStyle(document.body).color
      },
      xaxis: {
        gridcolor: 'rgba(255,255,255,.12)'
      },
      yaxis: {
        gridcolor: 'rgba(255,255,255,.12)'
      }
    };
  }

  // --- utils ---
  function groupBy(arr, keyFn) {
    const map = new Map();
    for (const item of arr) {
      const k = keyFn(item);
      const bucket = map.get(k) || [];
      bucket.push(item);
      map.set(k, bucket);
    }
    return map;
  }

  function countBy(arr, keyFn) {
    const map = new Map();
    for (const item of arr) {
      const k = keyFn(item);
      map.set(k, (map.get(k) || 0) + 1);
    }
    return map;
  }

  function toNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function toCsv(rows) {
    if (!rows || !rows.length) return '';
    const cols = Object.keys(rows[0]);
    const head = cols.join(',');
    const body = rows.map(r => cols.map(c => csvCell(r[c])).join(',')).join('\n');
    return head + '\n' + body;
  }

  function csvCell(v) {
    if (v == null) return '';
    const s = String(v);
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function download(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>\"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    } [c]))
  }
})();