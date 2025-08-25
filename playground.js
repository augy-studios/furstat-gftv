(function () {
    const el = (id) => document.getElementById(id);
    const themeToggle = el('themeToggle');
    initTheme();
    themeToggle ?.addEventListener('click', () => {
        document.body.classList.toggle('light');
        localStorage.setItem('fs_theme', document.body.classList.contains('light') ? 'light' : 'dark');
    });

    const state = {
        rows: [],
        columns: [],
        colors: ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#f87171']
    };

    // Data loaders
    el('csvFile').addEventListener('change', async (e) => {
        const file = e.target.files ?. [0];
        if (!file) return;
        const text = await file.text();
        parseCsvText(text);
    });

    el('loadUrl').addEventListener('click', async () => {
        const raw = el('csvUrl').value.trim();
        const a1 = (el('gsRange') ?.value || '').trim();
        const tq = (el('gsTq') ?.value || '').trim();
        if (!raw) return;
        const url = toGoogleCsvUrl(raw, {
            tq
        });
        Papa.parse(url, {
            download: true,
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: (res) => {
                let rows = res.data;
                if (a1) {
                    rows = sliceRowsByA1(rows, a1);
                }
                setRows(rows);
            },
            error: (e) => alert('Failed to fetch CSV: ' + e)
        });
    });

    el('loadText').addEventListener('click', () => {
        const a1 = (el('gsRange') ?.value || '').trim(); // optional range even for pasted CSV
        const text = el('csvText').value;
        Papa.parse(text, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: (res) => {
                let rows = res.data;
                if (a1) rows = sliceRowsByA1(rows, a1);
                setRows(rows);
            }
        });
    });

    function setRows(rows) {
        state.rows = rows || [];
        state.columns = state.rows.length ? Object.keys(state.rows[0]) : [];
        for (const id of ['xCol', 'yCol', 'y2Col', 'groupCol', 'sbValueCol', 'sbLabelsCol', 'sbParentsCol']) {
            fillSelect(id, state.columns);
        }
        fillMultiSelect('pathCols', state.columns);
        suggestMappings();
        buildColorPickers();
    }

    function fillSelect(id, options) {
        const s = el(id);
        if (!s) return;
        s.innerHTML = '<option value="">(none)</option>' + options.map(c => `<option>${escapeHtml(c)}</option>`).join('');
    }

    function fillMultiSelect(id, options) {
        const s = el(id);
        if (!s) return;
        s.innerHTML = options.map(c => `<option>${escapeHtml(c)}</option>`).join('');
    }

    function suggestMappings() {
        const cols = state.columns;
        if (!cols.length) return;
        const numericCols = cols.filter(c => isNumericColumn(state.rows, c));
        const maybeLabel = cols.find(c => /country|name|label|category|type|month|date|region|city/i.test(c)) || cols[0];
        el('xCol').value = maybeLabel;
        el('yCol').value = numericCols[0] || cols[0];
        el('y2Col').value = numericCols[1] || '';
        el('groupCol').value = cols.find(c => /group|gender|region|species|type|tier|team/i.test(c)) || '';
        // Sunburst quick guesses
        el('sbLabelsCol').value = cols.find(c => /label|node|name/i.test(c)) || '';
        el('sbParentsCol').value = cols.find(c => /parent|super|root/i.test(c)) || '';
        el('sbValueCol').value = numericCols[0] || '';
    }

    function isNumericColumn(rows, col) {
        let n = 0,
            k = 0;
        for (const r of rows) {
            const v = r[col];
            if (v == null || v === '') continue;
            k++;
            if (typeof v === 'number' || !isNaN(Number(v))) n++;
        }
        return k > 0 && (n / k) > 0.7;
    }

    // Colors UI
    function buildColorPickers() {
        const wrap = el('colorPickers');
        wrap.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const c = state.colors[i] || '#999999';
            const div = document.createElement('div');
            div.innerHTML = `<label>Colour ${i + 1}<input type="color" value="${c}" data-cidx="${i}" class="input" /></label>`;
            wrap.appendChild(div);
        }
        wrap.querySelectorAll('input[type=color]').forEach(inp => {
            inp.addEventListener('input', (e) => {
                const idx = Number(e.target.getAttribute('data-cidx'));
                state.colors[idx] = e.target.value;
            });
        });
    }

    el('render').addEventListener('click', () => render());
    el('downloadPng').addEventListener('click', () => {
        Plotly.toImage('playgroundChart', {
            format: 'png',
            height: 720,
            width: 1280
        }).then(url => download(url, 'chart.png'));
    });
    el('copyEmbed').addEventListener('click', () => {
        const code = `<div id="myChart"></div>\n<script src="https://cdn.plot.ly/plotly-2.35.2.min.js"><\/script>\n<script>Plotly.newPlot('myChart', ${JSON.stringify(currentData())}, ${JSON.stringify(currentLayout())});<\/script>`;
        copy(code);
    });
    el('copyConfig').addEventListener('click', () => copy(el('configOut').value));
    el('saveSession').addEventListener('click', () => {
        localStorage.setItem('fs_playground', JSON.stringify({
            rows: state.rows,
            colors: state.colors,
            ui: readUI()
        }));
        alert('Saved!');
    });
    el('loadSession').addEventListener('click', () => {
        const raw = localStorage.getItem('fs_playground');
        if (!raw) return alert('No saved session');
        const obj = JSON.parse(raw);
        setRows(obj.rows || []);
        state.colors = obj.colors || state.colors;
        buildColorPickers();
        writeUI(obj.ui || {});
        render();
    });

    function readUI() {
        return {
            chartType: el('chartType').value,
            stacked: el('stacked').value,
            xCol: el('xCol').value,
            yCol: el('yCol').value,
            groupCol: el('groupCol').value,
            y2Col: el('y2Col').value,
           
            sbMode: el('sbMode') ?.value || 'path',
            pathCols: Array.from(el('pathCols') ?.selectedOptions || []).map(o => o.value),
            sbValueCol: el('sbValueCol') ?.value || '',
            sbLabelsCol: el('sbLabelsCol') ?.value || '',
            sbParentsCol: el('sbParentsCol') ?.value || ''
        };
    }

    function writeUI(u) {
        for (const [k, v] of Object.entries(u)) {
            const ctrl = el(k);
            if (!ctrl) continue;
            if (ctrl instanceof HTMLSelectElement && ctrl.multiple && Array.isArray(v)) {
                for (const opt of ctrl.options) opt.selected = v.includes(opt.value);
            } else {
                ctrl.value = v ?? ctrl.value;
            }
        }
    }

    function render() {
        if (!state.rows.length) return alert('Load some data first!');
        const ui = readUI();
        const {
            data,
            layout
        } = buildFromUI(ui, state.rows, state.colors);
        Plotly.newPlot('playgroundChart', data, layout, {
            displayModeBar: false,
            responsive: true
        });

        // Exportable config snippet
        const mapping = {};
        if (ui.chartType === 'bar' || ui.chartType === 'line' || ui.chartType === 'scatter') {
            mapping.x = ui.xCol;
            mapping.y = ui.yCol;
            if (ui.groupCol) mapping.group = ui.groupCol;
        }
        if (ui.chartType === 'pie') {
            mapping.label = ui.xCol;
            if (ui.yCol) mapping.value = ui.yCol;
        }
        if (ui.chartType === 'combo') {
            mapping.x = ui.xCol;
            mapping.bar = ui.yCol;
            mapping.line = ui.y2Col;
        }
        if (ui.chartType === 'sunburst') {
            if (ui.sbMode === 'path') {
                mapping.path = ui.pathCols;
                if (ui.sbValueCol) mapping.value = ui.sbValueCol;
            } else {
                mapping.labels = ui.sbLabelsCol;
                mapping.parents = ui.sbParentsCol;
                if (ui.sbValueCol) mapping.values = ui.sbValueCol;
            }
        }

        const config = {
            id: 'my-chart',
            title: 'My Generated Chart',
            source: {
                type: 'inline',
                rows: state.rows.slice(0, 2000)
            },
            mapping,
            chart: {
                type: ui.chartType === 'combo' ? 'combo' : ui.chartType,
                stacked: ui.stacked === 'true',
                options: {
                    colors: state.colors
                }
            }
        };
        el('configOut').value = JSON.stringify({
            charts: [config]
        }, null, 2);
    }

    function buildFromUI(ui, rows, colors) {
        const type = ui.chartType;
        const layout = baseLayout('Preview');
        if (type === 'bar') return buildBar(ui, rows, colors, layout);
        if (type === 'line') return buildLine(ui, rows, colors, layout);
        if (type === 'pie') return buildPie(ui, rows, colors, layout);
        if (type === 'scatter') return buildScatter(ui, rows, colors, layout);
        if (type === 'combo') return buildCombo(ui, rows, colors, layout);
        if (type === 'sunburst') return buildSunburst(ui, rows, colors, layout); // NEW
        return {
            data: [],
            layout
        };
    }

    // ----- Chart builders (existing) -----
    function buildBar(ui, rows, colors, layout) {
        /* unchanged from your version */
        if (!ui.xCol || !ui.yCol) throw new Error('Need X and Y');
        let traces = [];
        let i = 0;
        if (ui.groupCol) {
            const groups = groupBy(rows, r => r[ui.groupCol]);
            for (const [g, arr] of groups) {
                traces.push({
                    type: 'bar',
                    name: String(g),
                    x: arr.map(r => r[ui.xCol]),
                    y: arr.map(r => toNum(r[ui.yCol])),
                    marker: {
                        color: colors[i++ % colors.length]
                    }
                });
            }
        } else {
            traces = [{
                type: 'bar',
                x: rows.map(r => r[ui.xCol]),
                y: rows.map(r => toNum(r[ui.yCol])),
                marker: {
                    color: colors[0]
                }
            }];
        }
        if (ui.stacked === 'true') layout.barmode = 'stack';
        return {
            data: traces,
            layout
        };
    }

    function buildLine(ui, rows, colors, layout) {
        /* unchanged */
        if (!ui.xCol || !ui.yCol) throw new Error('Need X and Y');
        let traces = [];
        let i = 0;
        if (ui.groupCol) {
            const groups = groupBy(rows, r => r[ui.groupCol]);
            for (const [g, arr] of groups) {
                traces.push({
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: String(g),
                    x: arr.map(r => r[ui.xCol]),
                    y: arr.map(r => toNum(r[ui.yCol])),
                    line: {
                        shape: 'spline',
                        color: colors[i++ % colors.length]
                    },
                    marker: {
                        size: 6
                    }
                });
            }
        } else {
            traces = [{
                type: 'scatter',
                mode: 'lines+markers',
                x: rows.map(r => r[ui.xCol]),
                y: rows.map(r => toNum(r[ui.yCol])),
                line: {
                    shape: 'spline',
                    color: colors[0]
                },
                marker: {
                    size: 6
                }
            }];
        }
        return {
            data: traces,
            layout
        };
    }

    function buildScatter(ui, rows, colors, layout) {
        /* unchanged */
        if (!ui.xCol || !ui.yCol) throw new Error('Need X and Y');
        let traces = [];
        let i = 0;
        if (ui.groupCol) {
            const groups = groupBy(rows, r => r[ui.groupCol]);
            for (const [g, arr] of groups) {
                traces.push({
                    type: 'scatter',
                    mode: 'markers',
                    name: String(g),
                    x: arr.map(r => toNum(r[ui.xCol])),
                    y: arr.map(r => toNum(r[ui.yCol])),
                    marker: {
                        size: 8,
                        color: colors[i++ % colors.length]
                    }
                });
            }
        } else {
            traces = [{
                type: 'scatter',
                mode: 'markers',
                x: rows.map(r => toNum(r[ui.xCol])),
                y: rows.map(r => toNum(r[ui.yCol])),
                marker: {
                    size: 8,
                    color: colors[0]
                }
            }];
        }
        return {
            data: traces,
            layout
        };
    }

    function buildPie(ui, rows, colors, layout) {
        /* unchanged */
        if (!ui.xCol) throw new Error('Need label column');
        let labels = [],
            values = [];
        if (ui.yCol) {
            labels = rows.map(r => r[ui.xCol]);
            values = rows.map(r => toNum(r[ui.yCol]));
        } else {
            const counts = countBy(rows, r => r[ui.xCol]);
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
                colors
            }
        };
        layout.showlegend = false;
        return {
            data: [trace],
            layout
        };
    }

    function buildCombo(ui, rows, colors, layout) {
        /* unchanged */
        if (!ui.xCol || !ui.yCol || !ui.y2Col) throw new Error('Need X, Y, and Y2');
        const bar = {
            type: 'bar',
            name: 'Bar',
            x: rows.map(r => r[ui.xCol]),
            y: rows.map(r => toNum(r[ui.yCol])),
            marker: {
                color: colors[0]
            }
        };
        const line = {
            type: 'scatter',
            mode: 'lines+markers',
            name: 'Line',
            x: rows.map(r => r[ui.xCol]),
            y: rows.map(r => toNum(r[ui.y2Col])),
            yaxis: 'y2',
            line: {
                shape: 'spline',
                color: colors[1]
            },
            marker: {
                size: 6
            }
        };
        layout.yaxis2 = {
            overlaying: 'y',
            side: 'right'
        };
        return {
            data: [bar, line],
            layout
        };
    }

    // ----- NEW: Sunburst builder -----
    function buildSunburst(ui, rows, colors, layout) {
        let trace;
        if (ui.sbMode === 'path') {
            const path = Array.isArray(ui.pathCols) ? ui.pathCols.filter(Boolean) : [];
            if (path.length < 2) throw new Error('Sunburst (path): select at least two path columns');
            const valuesK = ui.sbValueCol || null;
            const sep = ' / ';
            const nodeMap = new Map(); // id -> {label, parent, value}
            const getId = (parts) => parts.join(sep);

            for (const r of rows) {
                const parts = path.map(k => String(r[k] ?? ''));
                for (let d = 0; d < parts.length; d++) {
                    const label = parts[d];
                    const id = getId(parts.slice(0, d + 1));
                    const parent = d === 0 ? '' : getId(parts.slice(0, d));
                    if (!nodeMap.has(id)) nodeMap.set(id, {
                        label,
                        parent,
                        value: 0
                    });
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
                    colors
                }
            };
        } else {
            const labelsK = ui.sbLabelsCol,
                parentsK = ui.sbParentsCol,
                valuesK = ui.sbValueCol || null;
            if (!labelsK || !parentsK) throw new Error('Sunburst (labels): choose Labels and Parents columns');
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
                    colors
                }
            };
        }
        layout.sunburstcolorway = colors;
        layout.extendtreemapcolors = true;
        return {
            data: [trace],
            layout
        };
    }

    function currentData() {
        const ui = readUI();
        return buildFromUI(ui, state.rows, state.colors).data;
    }

    function currentLayout() {
        const ui = readUI();
        return buildFromUI(ui, state.rows, state.colors).layout;
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

    // utils
    function groupBy(arr, fn) {
        const m = new Map();
        for (const it of arr) {
            const k = fn(it);
            const b = m.get(k) || [];
            b.push(it);
            m.set(k, b);
        }
        return m;
    }

    function countBy(arr, fn) {
        const m = new Map();
        for (const it of arr) {
            const k = fn(it);
            m.set(k, (m.get(k) || 0) + 1);
        }
        return m;
    }

    function toNum(v) {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>\"']/g, c => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;"
        } [c]));
    }

    function download(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    function copy(text) {
        navigator.clipboard.writeText(text).then(() => {
            alert('Copied!')
        });
    }

    function initTheme() {
        const t = localStorage.getItem('fs_theme');
        if (t === 'light') document.body.classList.add('light');
    }

    // ---- Google Sheets URL helper (extended) ----
    function toGoogleCsvUrl(sheetUrl, opts = {}) {
        // If it's not a Google Sheets link, just return as-is
        try {
            const u = new URL(sheetUrl);
            const id = u.pathname.match(/\/d\/([a-zA-Z0-9-_]+)/) ?. [1];
            const gid = u.searchParams.get('gid');
            const isSheet = u.hostname.includes('docs.google.com') && !!id;
            if (!isSheet) return sheetUrl;

            // base gviz CSV export
            let url = gid ?
                `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}` :
                `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`;

            if (opts.tq) {
                url += `&tq=${encodeURIComponent(opts.tq)}`;
            }
            return url;
        } catch {
            return sheetUrl;
        }
    }

    // ---- A1 range slicer (client-side) ----
    function sliceRowsByA1(rows, a1) {
        // A1 like "A2:D20" (inclusive). We’ll interpret header row as row 1.
        const m = String(a1).trim().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
        if (!m || !rows.length) return rows;
        const [, c1, r1str, c2, r2str] = m;
        const startCol = colLettersToIndex(c1);
        const endCol = colLettersToIndex(c2);
        const startRow = parseInt(r1str, 10);
        const endRow = parseInt(r2str, 10);
        if (startCol > endCol || startRow > endRow) return rows;

        const headers = Object.keys(rows[0]); // order inferred from CSV header
        const keepCols = headers.slice(startCol, endCol + 1);

        // Data rows: header is row 1. So A2 means rows[0] is row2 → index startRow-2
        const sliceStart = Math.max(0, startRow - 2);
        const sliceEnd = Math.max(sliceStart, endRow - 2);

        const sliced = rows.slice(sliceStart, sliceEnd + 1).map(r => {
            const o = {};
            for (const k of keepCols) o[k] = r[k];
            return o;
        });
        return sliced;
    }

    function colLettersToIndex(letters) {
        // 'A'->0, 'B'->1 ... 'Z'->25, 'AA'->26 ...
        let n = 0;
        const s = letters.toUpperCase();
        for (let i = 0; i < s.length; i++) {
            n = n * 26 + (s.charCodeAt(i) - 64);
        }
        return n - 1;
    }
})();

function goBack() {
    window.history.back();
}