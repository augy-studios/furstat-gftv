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
        if (!raw) return;
        const url = toGoogleCsvUrl(raw);
        Papa.parse(url, {
            download: true,
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: (res) => {
                setRows(res.data)
            },
            error: (e) => alert('Failed to fetch CSV: ' + e)
        });
    });
    el('loadText').addEventListener('click', () => {
        parseCsvText(el('csvText').value);
    });

    function parseCsvText(text) {
        Papa.parse(text, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: (res) => {
                setRows(res.data)
            }
        });
    }

    function setRows(rows) {
        state.rows = rows || [];
        state.columns = state.rows.length ? Object.keys(state.rows[0]) : [];
        for (const id of ['xCol', 'yCol', 'y2Col', 'groupCol']) fillSelect(id, state.columns);
        suggestMappings();
        buildColorPickers();
    }

    function fillSelect(id, options) {
        const s = el(id);
        s.innerHTML = '<option value="">(none)</option>' + options.map(c => `<option>${escapeHtml(c)}</option>`).join('');
    }

    function suggestMappings() {
        const cols = state.columns;
        if (!cols.length) return;
        // simple heuristics
        const numericCols = cols.filter(c => isNumericColumn(state.rows, c));
        const maybeLabel = cols.find(c => /country|name|label|category|type|month|date/i.test(c)) || cols[0];
        el('xCol').value = maybeLabel;
        el('yCol').value = numericCols[0] || cols[0];
        el('y2Col').value = numericCols[1] || '';
        el('groupCol').value = cols.find(c => /group|gender|region|species|type/i.test(c)) || '';
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
            div.innerHTML = `<label>Colour ${i+1}<input type="color" value="${c}" data-cidx="${i}" class="input" /></label>`;
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
        const code = `<div id=\"myChart\"></div>\n<script src=\"https://cdn.plot.ly/plotly-2.35.2.min.js\"><\/script>\n<script>Plotly.newPlot('myChart', ${JSON.stringify(currentData())}, ${JSON.stringify(currentLayout())});<\/script>`;
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
            y2Col: el('y2Col').value
        };
    }

    function writeUI(u) {
        for (const [k, v] of Object.entries(u)) {
            const ctrl = el(k);
            if (ctrl) ctrl.value = v ?? ctrl.value;
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

        // Exportable config snippet (inline data for portability)
        const mapping = {
            x: ui.xCol,
            y: ui.yCol
        };
        if (ui.groupCol) mapping.group = ui.groupCol;
        if (ui.chartType === 'pie') {
            mapping.label = ui.xCol;
            if (ui.yCol) mapping.value = ui.yCol;
        }
        if (ui.chartType === 'combo') {
            mapping.bar = ui.yCol;
            mapping.line = ui.y2Col;
        }

        const config = {
            id: 'my-chart',
            title: 'My Generated Chart',
            source: {
                type: 'inline',
                rows: state.rows.slice(0, 1000)
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
        return {
            data: [],
            layout
        };
    }

    function buildBar(ui, rows, colors, layout) {
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
                colors: colors
            }
        };
        layout.showlegend = false;
        return {
            data: [trace],
            layout
        };
    }

    function buildCombo(ui, rows, colors, layout) {
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
        } [c]))
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

    function toGoogleCsvUrl(sheetUrl) {
        try {
            const u = new URL(sheetUrl);
            const id = u.pathname.match(/\/d\/([a-zA-Z0-9-_]+)/) ?. [1];
            const gid = u.searchParams.get('gid');
            if (!u.hostname.includes('docs.google.com') || !id) return sheetUrl;
            return gid ? `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}` : `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`;
        } catch {
            return sheetUrl
        }
    }
})();