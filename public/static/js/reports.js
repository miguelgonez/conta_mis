/**
 * Reports — every report is plain SQL on the backend; this viewer
 * renders the tables, print/PDF is WeasyPrint server-side.
 */
const ReportsPage = {
    // Map of report_type → opener method, for re-opening saved reports.
    // Keys here MUST match the report_type strings the openers pass to
    // openPeriodModal so save-then-reload roundtrips cleanly.
    _OPENERS: {
        profit_loss:          (params) => ReportsPage.profitLoss(params),
        profit_loss_by_class: (params) => ReportsPage.profitLossByClass(params),
        balance_sheet:        (params) => ReportsPage.balanceSheet(params),
        ar_aging:             (params) => ReportsPage.arAging(params),
        ap_aging:             (params) => ReportsPage.apAging(params),
        sales_tax:            (params) => ReportsPage.salesTax(params),
        general_ledger:       (params) => ReportsPage.generalLedger(params),
        income_by_customer:   (params) => ReportsPage.incomeByCustomer(params),
        cash_flow:            (params) => ReportsPage.cashFlow(params),
        trial_balance:        (params) => ReportsPage.trialBalance(params),
        report_1099:          (params) => ReportsPage.report1099(params),
        job_profitability:    (params) => ReportsPage.jobProfitability(params),
        job_budget_vs_actual: (params) => ReportsPage.jobBudgetVsActual(params),
        fixed_assets:         (params) => ReportsPage.fixedAssetReconciliation(params),
    },

    _currentReport: null,

    async render() {
        // Fetch saved reports separately so the page still renders if the
        // call fails (network blip, table missing, etc.).
        let savedHtml = '';
        try {
            const saved = await API.get('/saved-reports');
            if (saved && saved.length) {
                const items = saved.map(s => `
                    <div class="card" style="cursor:pointer; position:relative; border-left:3px solid var(--qb-blue,#0066cc);"
                         onclick="ReportsPage.openSaved(${s.id})">
                        <div class="card-header">${escapeHtml(s.name)}</div>
                        <p style="font-size:11px; color:var(--text-muted);">
                            ${escapeHtml(s.report_type.replace(/_/g, ' '))}
                            ${s.parameters && s.parameters.start_date ? '· ' + escapeHtml(s.parameters.start_date) + ' → ' + escapeHtml(s.parameters.end_date || '') : ''}
                        </p>
                        <div style="position:absolute; top:8px; right:8px; display:flex; gap:4px;">
                            <button class="btn btn-sm btn-secondary"
                                    onclick="event.stopPropagation(); ReportsPage.quickExportCsv('${s.report_type}')"
                                    title="Export this saved report to CSV">CSV</button>
                            <button class="btn btn-sm btn-secondary"
                                    onclick="event.stopPropagation(); ReportsPage.deleteSaved(${s.id})"
                                    title="Delete saved report">×</button>
                        </div>
                    </div>`).join('');
                savedHtml = `
                    <h3 style="font-size:13px; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); margin:0 0 8px;">
                        Saved Reports
                    </h3>
                    <div class="card-grid" style="margin-bottom:24px;">${items}</div>`;
            }
        } catch (e) { /* render anyway */ }

        const card = (type, title, desc, clickFn) => `
            <div class="card" style="cursor:pointer; display:flex; flex-direction:column; justify-content:space-between;" onclick="${clickFn}">
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                        <div class="card-header" style="margin-bottom:4px;">${title}</div>
                        <button class="btn btn-sm btn-secondary"
                                onclick="event.stopPropagation(); ReportsPage.quickExportCsv('${type}')"
                                title="Download ${title} as CSV"
                                style="padding:2px 8px; font-size:11px; flex-shrink:0; display:inline-flex; align-items:center; gap:4px;">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            CSV
                        </button>
                    </div>
                    <p style="font-size:13px; color:var(--gray-500); margin:0;">${desc}</p>
                </div>
            </div>`;

        return `
            <div class="page-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                <div>
                    <h2>Reports</h2>
                    <p style="font-size:13px; color:var(--text-muted); margin:4px 0 0 0;">Financial statements, general ledger, tax and job accounting</p>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-primary" id="btn-reports-download-csv" onclick="ReportsPage.openExportCsvModal()" style="display:inline-flex; align-items:center; gap:6px;">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        Download as CSV
                    </button>
                </div>
            </div>
            ${savedHtml}
            <div class="card-grid">
                ${card('profit_loss', 'Profit & Loss', 'Income vs expenses for a period', 'ReportsPage.profitLoss()')}
                ${card('profit_loss_by_class', 'P&L by Class', 'Income vs expenses split by class', 'ReportsPage.profitLossByClass()')}
                ${card('job_budget_vs_actual', 'Job Budget vs Actual', 'Budget, committed, actual, projected, variance per job', 'ReportsPage.jobBudgetVsActual()')}
                ${card('job_profitability', 'Job Profitability', 'Income, costs and margin per job', 'ReportsPage.jobProfitability()')}
                ${card('financial_pack', 'Financial Statements Pack (PDF)', 'P&L + Balance Sheet + Trial Balance, one audit-ready PDF', 'ReportsPage.financialStatementsPdf()')}
                ${card('fixed_assets', 'Fixed Asset Reconciliation', 'Register totals vs GL by asset type', 'ReportsPage.fixedAssetReconciliation()')}
                ${card('balance_sheet', 'Balance Sheet', 'Assets, liabilities, and equity', 'ReportsPage.balanceSheet()')}
                ${card('ar_aging', 'A/R Aging', 'Outstanding receivables by age', 'ReportsPage.arAging()')}
                ${card('ap_aging', 'A/P Aging', 'Outstanding payables by age', 'ReportsPage.apAging()')}
                ${card('sales_tax', 'Sales Tax', 'Tax collected by invoice', 'ReportsPage.salesTax()')}
                ${card('general_ledger', 'General Ledger', 'All journal entries by account', 'ReportsPage.generalLedger()')}
                ${card('income_by_customer', 'Income by Customer', 'Sales totals per customer', 'ReportsPage.incomeByCustomer()')}
                ${card('customer_statement', 'Customer Statement', 'Invoice/payment history PDF', 'ReportsPage.customerStatementPicker()')}
                ${card('trial_balance', 'Trial Balance', 'Debits and credits by account', 'ReportsPage.trialBalance()')}
                ${card('cash_flow', 'Cash Flow', 'Operating, investing, financing', 'ReportsPage.cashFlow()')}
                ${card('report_1099', '1099 Summary', 'Vendor payments for 1099 filing', 'ReportsPage.report1099()')}
                ${card('budget_variance', 'Budget vs Actual', 'Monthly budget variance analysis', 'BudgetsPage.showVariance()')}
            </div>`;
    },

    // ----- Saved Reports (Phase 11) -----

    async openSaved(id) {
        try {
            const all = await API.get('/saved-reports');
            const saved = all.find(s => s.id === id);
            if (!saved) { toast('Saved report not found', 'error'); return; }
            const opener = ReportsPage._OPENERS[saved.report_type];
            if (!opener) {
                toast(`No opener registered for "${saved.report_type}"`, 'error');
                return;
            }
            await opener(saved.parameters || {});
        } catch (err) { toast(err.message || 'Failed to open', 'error'); }
    },

    async saveCurrent(reportType, params) {
        const name = prompt('Save report as:');
        if (!name || !name.trim()) return;
        try {
            await API.post('/saved-reports', {
                name: name.trim(),
                report_type: reportType,
                parameters: params || {},
            });
            toast('Saved');
            // Refresh the page so the new one shows in the Saved section
            App.navigate(location.hash);
        } catch (err) { toast(err.message || 'Save failed', 'error'); }
    },

    async deleteSaved(id) {
        if (!confirm('Delete this saved report?')) return;
        try {
            await API.del(`/saved-reports/${id}`);
            toast('Deleted');
            App.navigate(location.hash);
        } catch (err) { toast(err.message || 'Delete failed', 'error'); }
    },

    // ----- Drill-down (Phase 11) -----
    // Hits /api/reports/account-transactions for one account in the date
    // range and shows the journal entries that rolled up into the row the
    // user clicked. Each entry's source_link routes to the originating
    // invoice / bill / payment / journal entry.
    async openDrillDown(accountId, accountName, startDate, endDate) {
        if (!accountId) { toast('No account_id on this row', 'error'); return; }
        const params = new URLSearchParams();
        params.set('account_id', accountId);
        if (startDate) params.set('start_date', startDate);
        if (endDate) params.set('end_date', endDate);

        ReportsPage._currentReport = {
            title: `Account Drilldown - ${accountName}`,
            reportType: 'drilldown',
            useAsOfOnly: false,
            getParams: () => ({ account_id: accountId, start_date: startDate, end_date: endDate }),
        };

        openModal(`Drill-down — ${accountName}`, `
            <div id="drilldown-body" style="font-size:11px; color:var(--gray-500);">Loading…</div>
            <div class="form-actions" style="display:flex; justify-content:space-between; align-items:center;">
                <button class="btn btn-primary" onclick="ReportsPage.downloadCurrentCsv()" style="display:inline-flex; align-items:center; gap:6px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Download as CSV
                </button>
                <button class="btn btn-secondary" onclick="closeModal()">Close</button>
            </div>
        `);

        try {
            const data = await API.get(`/reports/account-transactions?${params.toString()}`);
            const rows = (data.entries || []).map(e => {
                const src = e.source_link
                    ? `<a href="${escapeHtml(e.source_link)}" style="color:var(--qb-blue,#0066cc); text-decoration:none;">${escapeHtml(e.source_type || '')} #${e.source_id}</a>`
                    : escapeHtml(e.source_type || '');
                return `<tr>
                    <td>${formatDate(e.date)}</td>
                    <td>${escapeHtml(e.reference || '')}</td>
                    <td>${escapeHtml(e.description || '')}</td>
                    <td>${src}</td>
                    <td class="amount">${e.debit > 0 ? formatCurrency(e.debit) : ''}</td>
                    <td class="amount">${e.credit > 0 ? formatCurrency(e.credit) : ''}</td>
                    <td class="amount">${formatCurrency(e.running_balance)}</td>
                </tr>`;
            }).join('');

            $('#drilldown-body').innerHTML = `
                <p style="margin-bottom:8px; color:var(--gray-500); font-size:12px;">
                    ${escapeHtml(data.account.number || '')} · ${escapeHtml(data.account.name)}
                    &middot; ${formatDate(data.start_date)} → ${formatDate(data.end_date)}
                    &middot; Net: <strong>${formatCurrency(data.period_net)}</strong>
                </p>
                <div class="table-container"><table>
                    <thead><tr>
                        <th>Date</th><th>Ref</th><th>Description</th><th>Source</th>
                        <th class="amount">Debit</th><th class="amount">Credit</th><th class="amount">Running</th>
                    </tr></thead>
                    <tbody>${rows || '<tr><td colspan="7" style="text-align:center; color:var(--gray-400);">No entries in range</td></tr>'}</tbody>
                </table></div>`;
        } catch (err) {
            $('#drilldown-body').innerHTML =
                `<div class="empty-state"><p>${escapeHtml(err.message || 'Failed to load drill-down')}</p></div>`;
        }
    },

    periodOptions(selected) {
        const options = [
            ["this_month", "This Month"],
            ["this_quarter", "This Quarter"],
            ["this_year", "This Year"],
            ["this_year_to_date", "This Year to Date"],
            ["last_month", "Last Month"],
            ["last_quarter", "Last Quarter"],
            ["last_year", "Last Year"],
            ["last_year_to_date", "Last Year to Date"],
            ["custom", "Custom Date"],
        ];
        return options.map(([value, label]) =>
            `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`
        ).join("");
    },

    _pad(value) {
        return String(value).padStart(2, "0");
    },

    _isoDate(dateObj) {
        return `${dateObj.getFullYear()}-${ReportsPage._pad(dateObj.getMonth() + 1)}-${ReportsPage._pad(dateObj.getDate())}`;
    },

    _quarterStart(monthIndex) {
        return Math.floor(monthIndex / 3) * 3;
    },

    getDateRange(period, customStart = null, customEnd = null) {
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();
        const day = today.getDate();
        let start;
        let end;

        switch (period) {
            case "this_month":
                start = new Date(year, month, 1);
                end = new Date(year, month + 1, 0);
                break;
            case "this_quarter": {
                const qStart = ReportsPage._quarterStart(month);
                start = new Date(year, qStart, 1);
                end = new Date(year, qStart + 3, 0);
                break;
            }
            case "this_year":
                start = new Date(year, 0, 1);
                end = new Date(year, 11, 31);
                break;
            case "this_year_to_date":
                start = new Date(year, 0, 1);
                end = today;
                break;
            case "last_month":
                start = new Date(year, month - 1, 1);
                end = new Date(year, month, 0);
                break;
            case "last_quarter": {
                const thisQuarterStart = ReportsPage._quarterStart(month);
                start = new Date(year, thisQuarterStart - 3, 1);
                end = new Date(year, thisQuarterStart, 0);
                break;
            }
            case "last_year":
                start = new Date(year - 1, 0, 1);
                end = new Date(year - 1, 11, 31);
                break;
            case "last_year_to_date":
                start = new Date(year - 1, 0, 1);
                end = new Date(year - 1, month, Math.min(day, new Date(year - 1, month + 1, 0).getDate()));
                break;
            case "custom":
                return {
                    start: customStart || ReportsPage._isoDate(new Date(year, 0, 1)),
                    end: customEnd || ReportsPage._isoDate(today),
                };
            default:
                start = new Date(year, 0, 1);
                end = today;
                break;
        }

        return {
            start: ReportsPage._isoDate(start),
            end: ReportsPage._isoDate(end),
        };
    },

    getAsOfDate(period, customEnd = null) {
        if (period === "custom") return customEnd || todayISO();
        return ReportsPage.getDateRange(period).end;
    },

    customRangeHtml(initialStart, initialEnd) {
        return `
            <div id="report-custom-range" style="display:none; margin:4px 0 12px 0; font-size:11px; align-items:center; gap:8px;">
                <label for="report-custom-start">From:</label>
                <input id="report-custom-start" type="date" value="${initialStart}">
                <label for="report-custom-end">To:</label>
                <input id="report-custom-end" type="date" value="${initialEnd}">
            </div>`;
    },

    toggleCustomRange() {
        const select = $("#report-period-select");
        const row = $("#report-custom-range");
        if (!select || !row) return;
        row.style.display = select.value === "custom" ? "flex" : "none";
    },

    async openPeriodModal(title, initialPeriod, loadContent, label = "Dates", useAsOfOnly = false, opts = {}) {
        // opts.reportType (string) — when set, adds a "Save Report" button
        // that captures the current period/range as parameters.
        // opts.prefill ({period?, start_date?, end_date?, as_of_date?}) —
        // used when reopening a saved report; overrides initialPeriod and
        // pre-populates the date inputs.
        const reportType = opts.reportType || null;
        const prefill = opts.prefill || {};

        const currentYear = new Date().getFullYear();
        const defaultCustomStart = prefill.start_date || `${currentYear}-01-01`;
        const defaultCustomEnd = prefill.end_date || prefill.as_of_date || todayISO();
        const startingPeriod = prefill.period || initialPeriod;

        const saveBtn = reportType
            ? `<button class="btn btn-secondary" id="report-save-btn">Save Report…</button>`
            : '';

        openModal(title, `
            <div class="form-grid" style="margin-bottom:4px;">
                <div class="form-group">
                    <label>${label}</label>
                    <select id="report-period-select">${ReportsPage.periodOptions(startingPeriod)}</select>
                </div>
            </div>
            ${ReportsPage.customRangeHtml(defaultCustomStart, defaultCustomEnd)}
            <div id="report-content">
                <div style="font-size:11px; color:var(--gray-500);">Loading report...</div>
            </div>
            <div class="form-actions" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <button class="btn btn-primary" id="report-modal-download-csv" onclick="ReportsPage.downloadCurrentCsv()" style="display:inline-flex; align-items:center; gap:6px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Download as CSV
                </button>
                <div style="display:flex; gap:8px;">
                    ${saveBtn}
                    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
                </div>
            </div>`);

        const select = $("#report-period-select");
        const startInput = $("#report-custom-start");
        const endInput = $("#report-custom-end");
        const content = $("#report-content");

        // Track current params so the Save button captures fresh values.
        let currentParams = {};

        const render = async () => {
            ReportsPage.toggleCustomRange();
            content.innerHTML = `<div style="font-size:11px; color:var(--gray-500);">Loading report...</div>`;
            try {
                if (useAsOfOnly) {
                    const asOfDate = ReportsPage.getAsOfDate(select.value, endInput.value || todayISO());
                    currentParams = { period: select.value, as_of_date: asOfDate };
                    ReportsPage._currentReport = {
                        title,
                        reportType,
                        useAsOfOnly: true,
                        getParams: () => ({ ...currentParams }),
                    };
                    content.innerHTML = await loadContent(select.value, { as_of_date: asOfDate });
                } else {
                    const range = ReportsPage.getDateRange(select.value, startInput.value, endInput.value);
                    currentParams = { period: select.value, start_date: range.start, end_date: range.end };
                    ReportsPage._currentReport = {
                        title,
                        reportType,
                        useAsOfOnly: false,
                        getParams: () => ({ ...currentParams }),
                    };
                    content.innerHTML = await loadContent(select.value, range);
                }
            } catch (err) {
                content.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
            }
        };

        select.addEventListener("change", render);
        startInput.addEventListener("change", () => { if (select.value === "custom" && !useAsOfOnly) render(); });
        endInput.addEventListener("change", () => { if (select.value === "custom") render(); });

        if (reportType) {
            const sb = $("#report-save-btn");
            if (sb) sb.addEventListener("click", () => {
                ReportsPage.saveCurrent(reportType, currentParams);
            });
        }

        await render();
    },

    async profitLoss(prefill) {
        await ReportsPage.openPeriodModal("Profit & Loss", "this_year_to_date", async (_period, range) => {
            const data = await API.get(`/reports/profit-loss?start_date=${range.start}&end_date=${range.end}`);
            const pdfBtn = `<div style="text-align:right; margin-bottom:6px;"><button class="btn btn-sm btn-secondary" onclick="window.open('/api/reports/profit-loss/pdf?start_date=${range.start}&end_date=${range.end}','_blank')">Save PDF</button></div>`;
            // Build the onclick payload outside the template so we can
            // HTML-escape the embedded double quotes from JSON.stringify().
            // Otherwise the inner " breaks the outer onclick="…" attribute.
            const drillCall = (i) => escapeHtml(
                `ReportsPage.openDrillDown(${i.account_id},${JSON.stringify(i.account_name)},${JSON.stringify(range.start)},${JSON.stringify(range.end)})`
            );
            const section = (items) => {
                if (!items.length) return `<tr><td colspan="2" style="color:var(--gray-400);">None</td></tr>`;
                return items.map(i =>
                    `<tr><td style="padding-left:24px;">
                        <a href="javascript:void(0)" style="color:var(--qb-blue,#0066cc); text-decoration:none;"
                           onclick="${drillCall(i)}">${escapeHtml(i.account_name)}</a>
                        </td><td class="amount">${formatCurrency(i.amount)}</td></tr>`
                ).join("");
            };
            return `${pdfBtn}
                <p style="margin-bottom:12px; color:var(--gray-500);">${formatDate(data.start_date)} &mdash; ${formatDate(data.end_date)}</p>
                <div class="table-container"><table>
                    <thead><tr><th>Account</th><th class="amount">Amount</th></tr></thead>
                    <tbody>
                        <tr><td><strong>Income</strong></td><td></td></tr>
                        ${section(data.income)}
                        <tr style="font-weight:600; background:var(--gray-50);"><td>Total Income</td><td class="amount">${formatCurrency(data.total_income)}</td></tr>
                        <tr><td><strong>Cost of Goods Sold</strong></td><td></td></tr>
                        ${section(data.cogs)}
                        <tr style="font-weight:600; background:var(--gray-50);"><td>Gross Profit</td><td class="amount">${formatCurrency(data.gross_profit)}</td></tr>
                        <tr><td><strong>Expenses</strong></td><td></td></tr>
                        ${section(data.expenses)}
                        <tr style="font-weight:600; background:var(--gray-50);"><td>Total Expenses</td><td class="amount">${formatCurrency(data.total_expenses)}</td></tr>
                        <tr style="font-weight:700; font-size:15px; background:var(--primary-light);"><td>Net Income</td><td class="amount">${formatCurrency(data.net_income)}</td></tr>
                    </tbody>
                </table></div>`;
        }, "Dates", false, { reportType: 'profit_loss', prefill });
    },

    async balanceSheet(prefill) {
        await ReportsPage.openPeriodModal("Balance Sheet", "this_year_to_date", async (_period, params) => {
            const data = await API.get(`/reports/balance-sheet?as_of_date=${params.as_of_date}`);
            const pdfBtn = `<div style="text-align:right; margin-bottom:6px;"><button class="btn btn-sm btn-secondary" onclick="window.open('/api/reports/balance-sheet/pdf?as_of_date=${params.as_of_date}','_blank')">Save PDF</button></div>`;
            const drillCall = (i) => escapeHtml(
                `ReportsPage.openDrillDown(${i.account_id},${JSON.stringify(i.account_name)},null,${JSON.stringify(params.as_of_date)})`
            );
            const section = (items) => items.map(i =>
                `<tr><td style="padding-left:24px;">
                    <a href="javascript:void(0)" style="color:var(--qb-blue,#0066cc); text-decoration:none;"
                       onclick="${drillCall(i)}">${escapeHtml(i.account_name)}</a>
                    </td><td class="amount">${formatCurrency(i.amount)}</td></tr>`
            ).join("") || `<tr><td colspan="2" style="color:var(--gray-400);">None</td></tr>`;
            return `${pdfBtn}
                <p style="margin-bottom:12px; color:var(--gray-500);">As of ${formatDate(data.as_of_date)}</p>
                <div class="table-container"><table>
                    <thead><tr><th>Account</th><th class="amount">Amount</th></tr></thead>
                    <tbody>
                        <tr><td><strong>Assets</strong></td><td></td></tr>
                        ${section(data.assets)}
                        <tr style="font-weight:600; background:var(--gray-50);"><td>Total Assets</td><td class="amount">${formatCurrency(data.total_assets)}</td></tr>
                        <tr><td><strong>Liabilities</strong></td><td></td></tr>
                        ${section(data.liabilities)}
                        <tr style="font-weight:600; background:var(--gray-50);"><td>Total Liabilities</td><td class="amount">${formatCurrency(data.total_liabilities)}</td></tr>
                        <tr><td><strong>Equity</strong></td><td></td></tr>
                        ${section(data.equity)}
                        <tr style="font-weight:600; background:var(--gray-50);"><td>Total Equity</td><td class="amount">${formatCurrency(data.total_equity)}</td></tr>
                    </tbody>
                </table></div>`;
        }, "As Of", true, { reportType: 'balance_sheet', prefill });
    },

    async salesTax(prefill) {
        await ReportsPage.openPeriodModal("Sales Tax Report", "this_year_to_date", async (_period, range) => {
            const data = await API.get(`/reports/sales-tax?start_date=${range.start}&end_date=${range.end}`);
            const rows = data.items.map(i =>
                `<tr>
                    <td>${formatDate(i.date)}</td>
                    <td>${escapeHtml(i.invoice_number)}</td>
                    <td>${escapeHtml(i.customer_name)}</td>
                    <td class="amount">${formatCurrency(i.subtotal)}</td>
                    <td class="amount">${(i.tax_rate * 100).toFixed(2)}%</td>
                    <td class="amount">${formatCurrency(i.tax_amount)}</td>
                </tr>`
            ).join("");
            return `
                <p style="margin-bottom:12px; color:var(--gray-500);">${formatDate(data.start_date)} &mdash; ${formatDate(data.end_date)}</p>
                <div class="table-container"><table>
                    <thead><tr><th>Date</th><th>Invoice</th><th>Customer</th><th class="amount">Sales</th><th class="amount">Rate</th><th class="amount">Tax</th></tr></thead>
                    <tbody>${rows || '<tr><td colspan="6" style="text-align:center; color:var(--gray-400);">No taxable sales</td></tr>'}</tbody>
                </table></div>
                <div style="margin-top:12px; padding:8px; background:var(--gray-50); border:1px solid var(--gray-200);">
                    <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
                        <span>Total Sales: <strong>${formatCurrency(data.total_sales)}</strong></span>
                        <span>Taxable: <strong>${formatCurrency(data.total_taxable)}</strong></span>
                        <span>Non-Taxable: <strong>${formatCurrency(data.total_non_taxable)}</strong></span>
                    </div>
                    <div style="font-size:14px; font-weight:700; color:var(--qb-navy);">Tax Collected: ${formatCurrency(data.total_tax)}</div>
                </div>`;
        }, "Dates", false, { reportType: 'sales_tax', prefill });
    },

    async generalLedger(prefill) {
        await ReportsPage.openPeriodModal("General Ledger", "this_year_to_date", async (_period, range) => {
            const data = await API.get(`/reports/general-ledger?start_date=${range.start}&end_date=${range.end}`);
            let html = `<p style="margin-bottom:12px; color:var(--gray-500);">${formatDate(data.start_date)} &mdash; ${formatDate(data.end_date)}</p>`;
            if (data.accounts.length === 0) {
                html += `<div class="empty-state"><p>No journal entries found</p></div>`;
            } else {
                for (const acct of data.accounts) {
                    html += `<h3 style="margin:12px 0 4px; font-size:12px; color:var(--qb-navy);">${escapeHtml(acct.account_number)} &mdash; ${escapeHtml(acct.account_name)}</h3>`;
                    html += `<div class="table-container"><table>
                        <thead><tr><th>Date</th><th>Description</th><th>Reference</th><th class="amount">Debit</th><th class="amount">Credit</th></tr></thead><tbody>`;
                    for (const e of acct.entries) {
                        html += `<tr>
                            <td>${formatDate(e.date)}</td>
                            <td>${escapeHtml(e.description)}</td>
                            <td>${escapeHtml(e.reference)}</td>
                            <td class="amount">${e.debit > 0 ? formatCurrency(e.debit) : ""}</td>
                            <td class="amount">${e.credit > 0 ? formatCurrency(e.credit) : ""}</td>
                        </tr>`;
                    }
                    html += `<tr style="font-weight:600; background:var(--gray-50);">
                        <td colspan="3">Total</td>
                        <td class="amount">${formatCurrency(acct.total_debit)}</td>
                        <td class="amount">${formatCurrency(acct.total_credit)}</td>
                    </tr></tbody></table></div>`;
                }
            }
            return html;
        }, "Dates", false, { reportType: 'general_ledger', prefill });
    },

    async incomeByCustomer(prefill) {
        await ReportsPage.openPeriodModal("Income by Customer", "this_year_to_date", async (_period, range) => {
            const data = await API.get(`/reports/income-by-customer?start_date=${range.start}&end_date=${range.end}`);
            let rows = data.items.map(i =>
                `<tr>
                    <td>${escapeHtml(i.customer_name)}</td>
                    <td class="amount">${i.invoice_count}</td>
                    <td class="amount">${formatCurrency(i.total_sales)}</td>
                    <td class="amount">${formatCurrency(i.total_paid)}</td>
                    <td class="amount">${formatCurrency(i.total_balance)}</td>
                </tr>`
            ).join("");
            rows += `<tr style="font-weight:700; background:var(--gray-50);">
                <td>TOTAL</td>
                <td class="amount">${data.items.reduce((sum, item) => sum + item.invoice_count, 0)}</td>
                <td class="amount">${formatCurrency(data.total_sales)}</td>
                <td class="amount">${formatCurrency(data.total_paid)}</td>
                <td class="amount">${formatCurrency(data.total_balance)}</td>
            </tr>`;
            return `
                <p style="margin-bottom:12px; color:var(--gray-500);">${formatDate(data.start_date)} &mdash; ${formatDate(data.end_date)}</p>
                <div class="table-container"><table>
                    <thead><tr><th>Customer</th><th class="amount">Invoices</th><th class="amount">Sales</th><th class="amount">Paid</th><th class="amount">Balance</th></tr></thead>
                    <tbody>${rows || '<tr><td colspan="5" style="text-align:center; color:var(--gray-400);">No sales data</td></tr>'}</tbody>
                </table></div>`;
        }, "Dates", false, { reportType: 'income_by_customer', prefill });
    },

    async customerStatementPicker() {
        const customers = await API.get("/customers?active_only=true");
        const custOpts = customers.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
        openModal("Customer Statement", `
            <form onsubmit="ReportsPage.openStatement(event)">
                <div class="form-grid">
                    <div class="form-group"><label>Customer *</label>
                        <select name="customer_id" required><option value="">Select...</option>${custOpts}</select></div>
                    <div class="form-group"><label>As of Date</label>
                        <input name="as_of_date" type="date" value="${todayISO()}"></div>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                    <button type="submit" class="btn btn-primary">Generate PDF</button>
                </div>
            </form>`);
    },

    openStatement(e) {
        e.preventDefault();
        const form = e.target;
        const cid = form.customer_id.value;
        const asOf = form.as_of_date.value || todayISO();
        window.open(`/api/reports/customer-statement/${cid}/pdf?as_of_date=${asOf}`, "_blank");
        closeModal();
    },

    async arAging(prefill) {
        await ReportsPage.openPeriodModal("Accounts Receivable Aging", "this_year_to_date", async (_period, params) => {
            const data = await API.get(`/reports/ar-aging?as_of_date=${params.as_of_date}`);
            let rows = data.items.map(i =>
                `<tr>
                    <td>${escapeHtml(i.customer_name)}</td>
                    <td class="amount">${formatCurrency(i.current)}</td>
                    <td class="amount">${formatCurrency(i.over_30)}</td>
                    <td class="amount">${formatCurrency(i.over_60)}</td>
                    <td class="amount">${formatCurrency(i.over_90)}</td>
                    <td class="amount" style="font-weight:600;">${formatCurrency(i.total)}</td>
                </tr>`
            ).join("");
            const t = data.totals;
            rows += `<tr style="font-weight:700; background:var(--gray-50);">
                <td>TOTAL</td>
                <td class="amount">${formatCurrency(t.current)}</td>
                <td class="amount">${formatCurrency(t.over_30)}</td>
                <td class="amount">${formatCurrency(t.over_60)}</td>
                <td class="amount">${formatCurrency(t.over_90)}</td>
                <td class="amount">${formatCurrency(t.total)}</td>
            </tr>`;
            return `
                <p style="margin-bottom:12px; color:var(--gray-500);">As of ${formatDate(data.as_of_date)}</p>
                <div style="margin-bottom:12px; display:flex; gap:8px;">
                    <button class="btn btn-sm btn-secondary" onclick="ReportsPage.applyLateFees()">Apply Late Fees</button>
                    <button class="btn btn-sm btn-secondary" onclick="ReportsPage.batchEmailStatements()">Email All Overdue</button>
                    <select id="collection-letter-type" style="font-size:11px; padding:2px 6px;">
                        <option value="30">30-Day Letter</option>
                        <option value="60">60-Day Letter</option>
                        <option value="90">90-Day Letter</option>
                    </select>
                    <button class="btn btn-sm btn-secondary" onclick="ReportsPage.sendCollectionLetters()">Send Collection Letters</button>
                </div>
                <div class="table-container"><table>
                    <thead><tr>
                        <th>Customer</th><th class="amount">Current</th><th class="amount">1-30</th>
                        <th class="amount">31-60</th><th class="amount">61-90+</th><th class="amount">Total</th>
                    </tr></thead>
                    <tbody>${rows || '<tr><td colspan="6" style="text-align:center; color:var(--gray-400);">No outstanding receivables</td></tr>'}</tbody>
                </table></div>`;
        }, "As Of", true, { reportType: 'ar_aging', prefill });
    },

    async apAging(prefill) {
        await ReportsPage.openPeriodModal("Accounts Payable Aging", "this_year_to_date", async (_period, params) => {
            const data = await API.get(`/reports/ap-aging?as_of_date=${params.as_of_date}`);
            let rows = data.items.map(i =>
                `<tr>
                    <td>${escapeHtml(i.vendor_name)}</td>
                    <td class="amount">${formatCurrency(i.current)}</td>
                    <td class="amount">${formatCurrency(i.over_30)}</td>
                    <td class="amount">${formatCurrency(i.over_60)}</td>
                    <td class="amount">${formatCurrency(i.over_90)}</td>
                    <td class="amount" style="font-weight:600;">${formatCurrency(i.total)}</td>
                </tr>`
            ).join("");
            const t = data.totals;
            rows += `<tr style="font-weight:700; background:var(--gray-50);">
                <td>TOTAL</td>
                <td class="amount">${formatCurrency(t.current)}</td>
                <td class="amount">${formatCurrency(t.over_30)}</td>
                <td class="amount">${formatCurrency(t.over_60)}</td>
                <td class="amount">${formatCurrency(t.over_90)}</td>
                <td class="amount">${formatCurrency(t.total)}</td>
            </tr>`;
            return `
                <p style="margin-bottom:12px; color:var(--gray-500);">As of ${formatDate(data.as_of_date)}</p>
                <div class="table-container"><table>
                    <thead><tr>
                        <th>Vendor</th><th class="amount">Current</th><th class="amount">1-30</th>
                        <th class="amount">31-60</th><th class="amount">61-90+</th><th class="amount">Total</th>
                    </tr></thead>
                    <tbody>${rows || '<tr><td colspan="6" style="text-align:center; color:var(--gray-400);">No outstanding payables</td></tr>'}</tbody>
                </table></div>`;
        }, "As Of", true, { reportType: 'ap_aging', prefill });
    },

    async trialBalance() {
        await ReportsPage.openPeriodModal("Trial Balance", "this_year_to_date", async (_period, range) => {
            const data = await API.get(`/reports/trial-balance?start_date=${range.start}&end_date=${range.end}`);
            let rows = data.items.map(i =>
                `<tr>
                    <td>${escapeHtml(i.account_number)}</td>
                    <td>${escapeHtml(i.account_name)}</td>
                    <td style="font-size:10px; color:var(--gray-400);">${i.account_type}</td>
                    <td class="amount">${i.total_debit > 0 ? formatCurrency(i.total_debit) : ''}</td>
                    <td class="amount">${i.total_credit > 0 ? formatCurrency(i.total_credit) : ''}</td>
                    <td class="amount">${formatCurrency(i.net_balance)}</td>
                </tr>`
            ).join('');
            const diffColor = Math.abs(data.difference) < 0.01 ? 'var(--success)' : 'var(--danger)';
            rows += `<tr style="font-weight:700; background:var(--gray-50);">
                <td colspan="3">TOTALS</td>
                <td class="amount">${formatCurrency(data.total_debit)}</td>
                <td class="amount">${formatCurrency(data.total_credit)}</td>
                <td class="amount" style="color:${diffColor}">${formatCurrency(data.difference)}</td>
            </tr>`;
            return `
                <p style="margin-bottom:12px; color:var(--gray-500);">${formatDate(data.start_date)} &mdash; ${formatDate(data.end_date)}</p>
                <div class="table-container"><table>
                    <thead><tr><th>Number</th><th>Account</th><th>Type</th><th class="amount">Debit</th><th class="amount">Credit</th><th class="amount">Net</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table></div>`;
        });
    },

    async cashFlow(prefill) {
        await ReportsPage.openPeriodModal("Cash Flow Statement", "this_year_to_date", async (_period, range) => {
            const data = await API.get(`/reports/cash-flow?start_date=${range.start}&end_date=${range.end}`);
            const section = (title, items, total) => {
                let html = `<tr><td><strong>${title}</strong></td><td></td></tr>`;
                if (items.length === 0) {
                    html += `<tr><td style="padding-left:24px; color:var(--gray-400);">None</td><td></td></tr>`;
                } else {
                    html += items.map(i =>
                        `<tr><td style="padding-left:24px;">${escapeHtml(i.account_name)}</td><td class="amount">${formatCurrency(i.amount)}</td></tr>`
                    ).join('');
                }
                html += `<tr style="font-weight:600; background:var(--gray-50);"><td>Total ${title}</td><td class="amount">${formatCurrency(total)}</td></tr>`;
                return html;
            };
            return `
                <p style="margin-bottom:12px; color:var(--gray-500);">${formatDate(data.start_date)} &mdash; ${formatDate(data.end_date)}</p>
                <div class="table-container"><table>
                    <thead><tr><th>Account</th><th class="amount">Amount</th></tr></thead>
                    <tbody>
                        ${section('Operating Activities', data.operating, data.total_operating)}
                        ${section('Investing Activities', data.investing, data.total_investing)}
                        ${section('Financing Activities', data.financing, data.total_financing)}
                        <tr style="font-weight:700; font-size:15px; background:var(--primary-light);">
                            <td>Net Change in Cash</td><td class="amount">${formatCurrency(data.net_change)}</td>
                        </tr>
                    </tbody>
                </table></div>`;
        }, "Dates", false, { reportType: 'cash_flow', prefill });
    },

    async report1099() {
        const currentYear = new Date().getFullYear();
        ReportsPage._currentReport = {
            title: '1099 Summary',
            reportType: '1099_summary',
            useAsOfOnly: false,
            getParams: () => ({ year: $('#report-1099-year')?.value || currentYear }),
        };
        openModal('1099 Summary', `
            <div class="form-grid" style="margin-bottom:12px;">
                <div class="form-group"><label>Year</label>
                    <input id="report-1099-year" type="number" value="${currentYear}" style="width:100px;"></div>
                <div class="form-group" style="align-self:end;">
                    <button class="btn btn-primary" onclick="ReportsPage.load1099()">Generate</button></div>
            </div>
            <div id="report-1099-content"><div style="font-size:11px; color:var(--gray-500);">Select year and click Generate</div></div>
            <div class="form-actions" style="display:flex; justify-content:space-between; align-items:center;">
                <button class="btn btn-primary" onclick="ReportsPage.downloadCurrentCsv()" style="display:inline-flex; align-items:center; gap:6px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Download as CSV
                </button>
                <button class="btn btn-secondary" onclick="closeModal()">Close</button>
            </div>`);
    },

    async load1099() {
        const year = $('#report-1099-year').value;
        const content = $('#report-1099-content');
        content.innerHTML = '<div style="font-size:11px; color:var(--gray-500);">Loading...</div>';
        try {
            const data = await API.get(`/reports/1099-summary?year=${year}`);
            if (data.items.length === 0) {
                content.innerHTML = '<div class="empty-state"><p>No 1099 vendors found. Flag vendors as 1099 in the Vendors page.</p></div>';
                return;
            }
            let rows = data.items.map(i =>
                `<tr${i.above_threshold ? ' style="background:var(--primary-light);"' : ''}>
                    <td>${escapeHtml(i.vendor_name)}</td>
                    <td>${escapeHtml(i.tax_id)}</td>
                    <td>${escapeHtml(i.vendor_1099_type)}</td>
                    <td class="amount">${formatCurrency(i.total_paid)}</td>
                    <td>${i.above_threshold ? '<span style="color:var(--danger); font-weight:700;">REPORT</span>' : ''}</td>
                </tr>`
            ).join('');
            rows += `<tr style="font-weight:700; background:var(--gray-50);">
                <td colspan="3">TOTAL</td><td class="amount">${formatCurrency(data.total)}</td>
                <td>${data.vendors_above_threshold} vendor(s) above $${data.threshold}</td></tr>`;
            content.innerHTML = `
                <div class="table-container"><table>
                    <thead><tr><th>Vendor</th><th>Tax ID</th><th>Type</th><th class="amount">Total Paid</th><th>Status</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table></div>`;
        } catch (err) { content.innerHTML = `<div style="color:var(--danger);">${escapeHtml(err.message)}</div>`; }
    },

    async applyLateFees() {
        if (!confirm('Apply late fees to all overdue invoices past the grace period?')) return;
        try {
            const result = await API.post('/invoices/apply-late-fees');
            toast(`Late fees applied to ${result.applied} of ${result.total_overdue} overdue invoices`);
        } catch (err) { toast(err.message, 'error'); }
    },

    async batchEmailStatements() {
        if (!confirm('Email statements to all customers with overdue invoices?')) return;
        try {
            const result = await API.post('/reports/batch-email-statements');
            let msg = `Sent ${result.sent} statements`;
            if (result.failed > 0) msg += `, ${result.failed} failed`;
            toast(msg);
        } catch (err) { toast(err.message, 'error'); }
    },

    async sendCollectionLetters() {
        const letterType = $('#collection-letter-type')?.value || '30';
        if (!confirm(`Send ${letterType}-day collection letters to all qualifying customers?`)) return;
        try {
            const result = await API.post('/reports/collection-letters', {
                letter_type: letterType,
                send_email: true,
            });
            toast(`Generated ${result.generated} letters, emailed ${result.emailed}`);
        } catch (err) { toast(err.message, 'error'); }
    },
};

// Class tracking: Profit & Loss split by the class dimension.
ReportsPage.profitLossByClass = async function () {
    await ReportsPage.openPeriodModal("P&L by Class", "this_year_to_date", async (_period, range) => {
        const data = await API.get(`/reports/profit-loss-by-class?start_date=${range.start}&end_date=${range.end}`);
        const rows = data.classes.map(c => `<tr>
            <td>${escapeHtml(c.class_name)}</td>
            <td class="amount">${formatCurrency(c.income)}</td>
            <td class="amount">${formatCurrency(c.cogs)}</td>
            <td class="amount">${formatCurrency(c.gross_profit)}</td>
            <td class="amount">${formatCurrency(c.expenses)}</td>
            <td class="amount" style="font-weight:700;">${formatCurrency(c.net_income)}</td>
        </tr>`).join('');
        return `
            <div style="font-size:11px; color:var(--gray-500); margin-bottom:8px;">
                ${escapeHtml(data.start_date)} — ${escapeHtml(data.end_date)}
            </div>
            <div class="table-container"><table>
                <thead><tr><th>Class</th><th class="amount">Income</th><th class="amount">COGS</th>
                <th class="amount">Gross Profit</th><th class="amount">Expenses</th><th class="amount">Net Income</th></tr></thead>
                <tbody>${rows.length ? rows : '<tr><td colspan="6">No activity in this period</td></tr>'}</tbody>
                <tfoot><tr style="font-weight:700; background:var(--gray-50);">
                    <td>Total</td>
                    <td class="amount">${formatCurrency(data.total_income)}</td>
                    <td></td><td></td>
                    <td class="amount">${formatCurrency(data.total_expenses)}</td>
                    <td class="amount">${formatCurrency(data.total_net_income)}</td>
                </tr></tfoot>
            </table></div>`;
    });
};

// Fixed assets: register totals per type for GL reconciliation.
ReportsPage.fixedAssetReconciliation = async function () {
    ReportsPage._currentReport = {
        title: 'Fixed Asset Reconciliation',
        reportType: 'fixed_assets',
        useAsOfOnly: true,
        getParams: () => ({ as_of_date: todayISO() }),
    };
    const data = await API.get('/fixed-assets/reports/reconciliation');
    const rows = data.types.map(t => `<tr>
        <td>${escapeHtml(t.asset_type)}</td>
        <td class="amount">${t.asset_count}</td>
        <td class="amount">${formatCurrency(t.cost)}</td>
        <td class="amount">${formatCurrency(t.accumulated_depreciation)}</td>
        <td class="amount">${formatCurrency(t.book_value)}</td>
    </tr>`).join('');
    openModal('Fixed Asset Reconciliation', `
        <div class="table-container"><table>
            <thead><tr><th>Asset Type</th><th class="amount">Assets</th><th class="amount">Cost</th>
            <th class="amount">Accum. Depr.</th><th class="amount">Book Value</th></tr></thead>
            <tbody>${rows.length ? rows : '<tr><td colspan="5">No registered assets</td></tr>'}</tbody>
            <tfoot><tr style="font-weight:700; background:var(--gray-50);">
                <td>Total</td><td></td>
                <td class="amount">${formatCurrency(data.total_cost)}</td>
                <td class="amount">${formatCurrency(data.total_accumulated)}</td>
                <td class="amount">${formatCurrency(data.total_book_value)}</td>
            </tr></tfoot>
        </table></div>
        <div style="font-size:11px; color:var(--gray-500); margin-top:8px;">
            Compare against the mapped fixed-asset and accumulated-depreciation
            GL accounts — differences mean unposted acquisitions or manual GL edits.
        </div>
        <div class="form-actions" style="display:flex; justify-content:space-between; align-items:center; margin-top:16px;">
            <button class="btn btn-primary" onclick="ReportsPage.downloadCurrentCsv()" style="display:inline-flex; align-items:center; gap:6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Download as CSV
            </button>
            <button class="btn btn-secondary" onclick="closeModal()">Close</button>
        </div>`);
};

// Financial statements pack — one PDF with P&L, Balance Sheet, Trial Balance.
ReportsPage.financialStatementsPdf = async function () {
    await ReportsPage.openPeriodModal("Financial Statements Pack", "this_year_to_date", async (_period, range) => {
        window.open(`/api/reports/financial-statements/pdf?start_date=${range.start}&end_date=${range.end}`, '_blank');
        return `<div style="font-size:12px;">The statements pack opened in a new tab —
            P&L and Trial Balance for ${escapeHtml(range.start)} — ${escapeHtml(range.end)},
            Balance Sheet as of ${escapeHtml(range.end)}. Paper size follows
            Settings → Report PDF Paper Size.</div>`;
    });
};

ReportsPage.jobProfitability = async function () {
    await ReportsPage.openPeriodModal("Job Profitability", "this_year_to_date", async (_period, range) => {
        const data = await API.get(`/reports/job-profitability?start_date=${range.start}&end_date=${range.end}`);
        const pct = v => v === null || v === undefined ? '—' : `${v.toFixed(1)}%`;
        const rows = data.jobs.map(j => `<tr ${j.job_id ? `style="cursor:pointer" onclick="closeModal();App.navigate('#/jobs');JobsPage.showDetails(${j.job_id})"` : ''}>
            <td>${escapeHtml(j.customer_name || '')}</td>
            <td>${escapeHtml(j.job_name)}</td>
            <td class="amount">${j.contract_amount !== null && j.contract_amount !== undefined ? formatCurrency(j.contract_amount) : ''}</td>
            <td class="amount">${formatCurrency(j.income)}</td>
            <td class="amount">${formatCurrency(j.total_costs)}</td>
            <td class="amount" style="font-weight:700;">${formatCurrency(j.net_income)}</td>
            <td class="amount">${pct(j.margin_pct)}</td>
        </tr>`).join('');
        return `
            <div style="font-size:11px; color:var(--gray-500); margin-bottom:8px;">
                ${escapeHtml(data.start_date)} — ${escapeHtml(data.end_date)} · "No job" holds untagged activity <em>and</em> the applied-cost credits behind Job Cost Entries (labor, equipment, overhead applied to jobs), so its costs can be negative and the totals still match the P&L
            </div>
            <div class="table-container"><table>
                <thead><tr><th>Customer</th><th>Job</th><th class="amount">Contract</th><th class="amount">Income</th>
                <th class="amount">Costs</th><th class="amount">Net</th><th class="amount">Margin</th></tr></thead>
                <tbody>${rows.length ? rows : '<tr><td colspan="7">No activity in this period</td></tr>'}</tbody>
                <tfoot><tr style="font-weight:700; background:var(--gray-50);">
                    <td colspan="3">Total</td>
                    <td class="amount">${formatCurrency(data.total_income)}</td>
                    <td class="amount">${formatCurrency(data.total_costs)}</td>
                    <td class="amount">${formatCurrency(data.total_net_income)}</td>
                    <td></td>
                </tr></tfoot>
            </table></div>`;
    });
};

ReportsPage.jobBudgetVsActual = async function () {
    await ReportsPage.openPeriodModal("Job Budget vs Actual", "this_year_to_date", async (_period, range) => {
        const data = await API.get(`/jobs/budget-vs-actual?start_date=${range.start}&end_date=${range.end}`);
        const pct = v => v === null || v === undefined ? '—' : `${v.toFixed(1)}%`;
        const t = { revised: 0, committed: 0, actual: 0, projected: 0, variance: 0, act_revenue: 0 };
        const rows = data.map(j => {
            for (const k of Object.keys(t)) t[k] += j[k] || 0;
            return `<tr style="cursor:pointer" onclick="closeModal();App.navigate('#/jobs/${j.job_id}')">
            <td>${escapeHtml(j.customer_name || '')}</td>
            <td>${escapeHtml(j.job_name)}</td>
            <td class="amount">${formatCurrency(j.revised)}</td>
            <td class="amount">${formatCurrency(j.committed)}</td>
            <td class="amount">${formatCurrency(j.actual)}</td>
            <td class="amount">${formatCurrency(j.projected)}</td>
            <td class="amount" style="font-weight:700;color:${j.revised && j.variance < 0 ? '#a4242b' : 'inherit'}">${formatCurrency(j.variance)}</td>
            <td class="amount">${pct(j.pct_used)}</td>
            <td class="amount">${formatCurrency(j.act_revenue)}</td>
        </tr>`; }).join('');
        return `
            <div style="font-size:11px; color:var(--gray-500); margin-bottom:8px;">
                Actuals for ${escapeHtml(range.start)} — ${escapeHtml(range.end)}; budgets and committed cost are job-to-date. Click a job to drill down.
            </div>
            <div class="table-container"><table>
                <thead><tr><th>Customer</th><th>Job</th><th class="amount">Budget</th><th class="amount">Committed</th>
                <th class="amount">Actual</th><th class="amount">Projected</th><th class="amount">Variance</th><th class="amount">% Used</th><th class="amount">Revenue</th></tr></thead>
                <tbody>${rows.length ? rows : '<tr><td colspan="9">No jobs</td></tr>'}</tbody>
                <tfoot><tr style="font-weight:700; background:var(--gray-50);">
                    <td colspan="2">Total</td>
                    <td class="amount">${formatCurrency(t.revised)}</td><td class="amount">${formatCurrency(t.committed)}</td>
                    <td class="amount">${formatCurrency(t.actual)}</td><td class="amount">${formatCurrency(t.projected)}</td>
                    <td class="amount">${formatCurrency(t.variance)}</td><td></td><td class="amount">${formatCurrency(t.act_revenue)}</td>
                </tr></tfoot>
            </table></div>`;
    });
};

// ============================================================================
// CSV Export Suite for Reports View
// ============================================================================

ReportsPage.escapeCsvValue = function (val) {
    if (val === null || val === undefined) return '';
    let str = String(val).trim();
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

ReportsPage.downloadCsvFile = function (filename, csvContent) {
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast(`Downloaded CSV: ${filename}`, 'success');
};

ReportsPage.tableToCsv = function (tableEl, title = '', subtitle = '') {
    const lines = [];
    if (title) lines.push(`"${title.replace(/"/g, '""')}"`);
    if (subtitle) lines.push(`"${subtitle.replace(/"/g, '""')}"`);
    lines.push(`"Exported: ${new Date().toLocaleString()}"`);
    lines.push(`"Currency: USD"`);
    lines.push('');

    const trs = tableEl.querySelectorAll('tr');
    trs.forEach(tr => {
        const cells = Array.from(tr.children);
        if (cells.length === 0) return;
        if (cells.length === 1 && cells[0].colSpan > 1 && /no activity|no entries|none|loading/i.test(cells[0].textContent)) {
            lines.push(`"${cells[0].textContent.trim().replace(/"/g, '""')}"`);
            return;
        }

        const rowValues = cells.map(cell => {
            let txt = (cell.innerText || cell.textContent || '').trim();
            // Clean up currency amounts for spreadsheet formulas
            if (cell.classList.contains('amount') || /^\$?-?[\d,]+(\.\d+)?$/.test(txt) || /^\(\$?[\d,]+(\.\d+)?\)$/.test(txt)) {
                const isNegative = txt.includes('(') || txt.includes('-');
                const clean = txt.replace(/[\$,\(\)]/g, '').trim();
                if (clean && !isNaN(Number(clean))) {
                    return isNegative ? `-${Number(clean).toFixed(2)}` : Number(clean).toFixed(2);
                }
            }
            if (txt.includes(',') || txt.includes('"') || txt.includes('\n') || txt.includes('\r')) {
                return `"${txt.replace(/"/g, '""')}"`;
            }
            return txt;
        });

        lines.push(rowValues.join(','));
    });

    return lines.join('\r\n');
};

ReportsPage.downloadReportCsvDirect = async function (reportType, params = {}, customTitle = '') {
    const range = ReportsPage.getDateRange(params.period || 'this_year_to_date', params.start_date, params.end_date);
    const asOf = params.as_of_date || range.end || todayISO();
    let url = '';
    let filename = `${reportType}_${asOf}.csv`;

    switch (reportType) {
        case 'profit_loss':
            url = `/api/reports/profit-loss/csv?start_date=${range.start}&end_date=${range.end}`;
            filename = `Profit_and_Loss_${range.start}_to_${range.end}.csv`;
            break;
        case 'profit_loss_by_class':
            url = `/api/reports/profit-loss-by-class/csv?start_date=${range.start}&end_date=${range.end}`;
            filename = `Profit_and_Loss_by_Class_${range.start}_to_${range.end}.csv`;
            break;
        case 'balance_sheet':
            url = `/api/reports/balance-sheet/csv?as_of_date=${asOf}`;
            filename = `Balance_Sheet_as_of_${asOf}.csv`;
            break;
        case 'ar_aging':
            url = `/api/reports/ar-aging/csv?as_of_date=${asOf}`;
            filename = `AR_Aging_as_of_${asOf}.csv`;
            break;
        case 'ap_aging':
            url = `/api/reports/ap-aging/csv?as_of_date=${asOf}`;
            filename = `AP_Aging_as_of_${asOf}.csv`;
            break;
        case 'sales_tax':
            url = `/api/reports/sales-tax/csv?start_date=${range.start}&end_date=${range.end}`;
            filename = `Sales_Tax_${range.start}_to_${range.end}.csv`;
            break;
        case 'general_ledger':
            url = `/api/reports/general-ledger/csv?start_date=${range.start}&end_date=${range.end}`;
            filename = `General_Ledger_${range.start}_to_${range.end}.csv`;
            break;
        case 'income_by_customer':
            url = `/api/reports/income-by-customer/csv?start_date=${range.start}&end_date=${range.end}`;
            filename = `Income_by_Customer_${range.start}_to_${range.end}.csv`;
            break;
        case 'cash_flow':
            url = `/api/reports/cash-flow/csv?start_date=${range.start}&end_date=${range.end}`;
            filename = `Cash_Flow_${range.start}_to_${range.end}.csv`;
            break;
        case 'trial_balance':
            url = `/api/reports/trial-balance/csv?start_date=${range.start}&end_date=${range.end}`;
            filename = `Trial_Balance_${range.start}_to_${range.end}.csv`;
            break;
        case 'report_1099':
        case '1099_summary': {
            const year = params.year || new Date().getFullYear();
            url = `/api/reports/1099-summary/csv?year=${year}`;
            filename = `1099_Summary_${year}.csv`;
            break;
        }
        case 'job_profitability':
            url = `/api/reports/job-profitability/csv?start_date=${range.start}&end_date=${range.end}`;
            filename = `Job_Profitability_${range.start}_to_${range.end}.csv`;
            break;
        case 'job_budget_vs_actual':
            url = `/api/reports/job-budget-vs-actual/csv?start_date=${range.start}&end_date=${range.end}`;
            filename = `Job_Budget_vs_Actual_${range.start}_to_${range.end}.csv`;
            break;
        case 'fixed_assets':
            url = `/api/reports/fixed-asset-reconciliation/csv`;
            filename = `Fixed_Asset_Reconciliation_${todayISO()}.csv`;
            break;
        case 'accounts':
            url = `/api/csv/export/accounts`;
            filename = `Chart_of_Accounts_${todayISO()}.csv`;
            break;
        case 'invoices':
            url = `/api/csv/export/invoices`;
            filename = `Invoices_Register_${todayISO()}.csv`;
            break;
        case 'bills':
            url = `/api/csv/export/bills`;
            filename = `Bills_Register_${todayISO()}.csv`;
            break;
        case 'customers':
            url = `/api/csv/export/customers`;
            filename = `Customers_List_${todayISO()}.csv`;
            break;
        case 'vendors':
            url = `/api/csv/export/vendors`;
            filename = `Vendors_List_${todayISO()}.csv`;
            break;
        case 'items':
            url = `/api/csv/export/items`;
            filename = `Items_and_Services_${todayISO()}.csv`;
            break;
        case 'jobs':
            url = `/api/csv/export/jobs`;
            filename = `Jobs_List_${todayISO()}.csv`;
            break;
        default:
            return false;
    }

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const csvText = await res.text();
        ReportsPage.downloadCsvFile(filename, csvText);
        return true;
    } catch (err) {
        console.warn('Direct CSV API fetch fallback:', err);
        return false;
    }
};

ReportsPage.downloadCurrentCsv = async function () {
    const current = ReportsPage._currentReport;
    const params = (current && typeof current.getParams === 'function') ? current.getParams() : {};
    const reportType = current?.reportType;
    const title = current?.title || 'Report';

    // If active modal has a known reportType, download directly from server route
    if (reportType && reportType !== 'drilldown') {
        const ok = await ReportsPage.downloadReportCsvDirect(reportType, params, title);
        if (ok) return;
    }

    // Fallback: convert whatever table is currently rendered in the open modal
    const table = document.querySelector('#report-content table, #drilldown-body table, #report-1099-content table, .modal-body table');
    if (!table) {
        toast('No active report table found to export', 'error');
        return;
    }

    const rangeStr = params.start_date && params.end_date
        ? `Period: ${params.start_date} to ${params.end_date}`
        : (params.as_of_date ? `As of: ${params.as_of_date}` : (params.year ? `Year: ${params.year}` : ''));

    const csvContent = ReportsPage.tableToCsv(table, title, rangeStr);
    const dateSuffix = params.end_date || params.as_of_date || params.year || todayISO();
    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const filename = `${safeTitle}_${dateSuffix}.csv`;

    ReportsPage.downloadCsvFile(filename, csvContent);
};

ReportsPage.quickExportCsv = async function (reportType) {
    const range = ReportsPage.getDateRange('this_year_to_date');
    const params = {
        period: 'this_year_to_date',
        start_date: range.start,
        end_date: range.end,
        as_of_date: range.end,
        year: new Date().getFullYear(),
    };

    const ok = await ReportsPage.downloadReportCsvDirect(reportType, params);
    if (!ok) {
        // If not a direct endpoint, open the modal for that report so user can view/export
        const opener = ReportsPage._OPENERS[reportType];
        if (opener) {
            await opener(params);
        } else {
            ReportsPage.openExportCsvModal(reportType);
        }
    }
};

ReportsPage.openExportCsvModal = function (preselectedType = 'profit_loss') {
    const currentYear = new Date().getFullYear();
    const defaultStart = `${currentYear}-01-01`;
    const defaultEnd = todayISO();

    const reportOptions = [
        { group: 'Financial Statements', items: [
            ['profit_loss', 'Profit & Loss (Income Statement)'],
            ['profit_loss_by_class', 'P&L by Class'],
            ['balance_sheet', 'Balance Sheet (Assets, Liabilities, Equity)'],
            ['trial_balance', 'Trial Balance (Debits & Credits)'],
            ['cash_flow', 'Cash Flow Statement'],
        ]},
        { group: 'Receivables & Payables', items: [
            ['ar_aging', 'A/R Aging (Accounts Receivable)'],
            ['ap_aging', 'A/P Aging (Accounts Payable)'],
            ['income_by_customer', 'Income by Customer'],
            ['sales_tax', 'Sales Tax Collected Report'],
        ]},
        { group: 'General Ledger & Tax', items: [
            ['general_ledger', 'General Ledger Transactions'],
            ['report_1099', '1099 Vendor Payment Summary'],
            ['fixed_assets', 'Fixed Asset Reconciliation'],
        ]},
        { group: 'Job Costing', items: [
            ['job_profitability', 'Job Profitability & Margins'],
            ['job_budget_vs_actual', 'Job Budget vs Actual & Variance'],
        ]},
        { group: 'Master Data & Registers', items: [
            ['invoices', 'All Invoices (Sales Register)'],
            ['bills', 'All Bills (Payables Register)'],
            ['customers', 'Customer Directory'],
            ['vendors', 'Vendor Directory'],
            ['accounts', 'Chart of Accounts'],
            ['items', 'Items and Services Price List'],
            ['jobs', 'Job Directory'],
        ]}
    ];

    let optHtml = '';
    reportOptions.forEach(grp => {
        optHtml += `<optgroup label="${grp.group}">`;
        grp.items.forEach(([val, label]) => {
            optHtml += `<option value="${val}" ${val === preselectedType ? 'selected' : ''}>${label}</option>`;
        });
        optHtml += `</optgroup>`;
    });

    openModal('Download Financial Report as CSV', `
        <div style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">
            Export financial statements and accounting data directly to CSV for spreadsheet modeling, audit preparation, or external analysis.
        </div>
        <form id="export-csv-form" onsubmit="ReportsPage.handleExportCsvSubmit(event)">
            <div class="form-grid" style="grid-template-columns: 1fr; gap:12px;">
                <div class="form-group">
                    <label for="csv-report-type" style="font-weight:600;">Report or Dataset *</label>
                    <select id="csv-report-type" name="report_type" style="width:100%; padding:8px 10px; font-size:13px;">
                        ${optHtml}
                    </select>
                </div>
                <div class="form-group">
                    <label for="csv-period-select" style="font-weight:600;">Reporting Period</label>
                    <select id="csv-period-select" name="period" style="width:100%; padding:8px 10px; font-size:13px;" onchange="ReportsPage.toggleExportCsvCustomRange()">
                        ${ReportsPage.periodOptions('this_year_to_date')}
                    </select>
                </div>
                <div id="csv-custom-range" style="display:none; grid-template-columns: 1fr 1fr; gap:12px;">
                    <div class="form-group">
                        <label for="csv-custom-start">From Date</label>
                        <input id="csv-custom-start" type="date" name="start_date" value="${defaultStart}">
                    </div>
                    <div class="form-group">
                        <label for="csv-custom-end">To Date / As of</label>
                        <input id="csv-custom-end" type="date" name="end_date" value="${defaultEnd}">
                    </div>
                </div>
            </div>

            <div style="background:var(--gray-50); border:1px solid var(--gray-200); border-radius:6px; padding:12px; margin-top:16px; font-size:12px; color:var(--gray-600); display:flex; align-items:flex-start; gap:8px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0; color:var(--qb-blue,#0066cc); margin-top:1px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                <div>
                    <strong>Format Details:</strong> Generated files include UTF-8 BOM encoding for seamless opening in Microsoft Excel, Apple Numbers, and Google Sheets, with sanitized numerical columns ready for formulas.
                </div>
            </div>

            <div class="form-actions" style="margin-top:20px; display:flex; justify-content:flex-end; gap:8px;">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary" id="btn-do-export-csv" style="display:inline-flex; align-items:center; gap:6px;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Download as CSV
                </button>
            </div>
        </form>
    `);
};

ReportsPage.toggleExportCsvCustomRange = function () {
    const select = document.getElementById('csv-period-select');
    const rangeBox = document.getElementById('csv-custom-range');
    if (!select || !rangeBox) return;
    rangeBox.style.display = select.value === 'custom' ? 'grid' : 'none';
};

ReportsPage.handleExportCsvSubmit = async function (e) {
    e.preventDefault();
    const btn = document.getElementById('btn-do-export-csv');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = 'Downloading...';
    }

    try {
        const form = e.target;
        const reportType = form.report_type.value;
        const period = form.period.value;
        const customStart = form.start_date ? form.start_date.value : null;
        const customEnd = form.end_date ? form.end_date.value : null;

        const range = ReportsPage.getDateRange(period, customStart, customEnd);
        const params = {
            period,
            start_date: range.start,
            end_date: range.end,
            as_of_date: range.end,
            year: (range.end ? new Date(range.end).getFullYear() : new Date().getFullYear()),
        };

        const ok = await ReportsPage.downloadReportCsvDirect(reportType, params);
        if (ok) {
            closeModal();
        } else {
            toast('Failed to download CSV for the selected report', 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Download as CSV`;
            }
        }
    } catch (err) {
        toast(err.message || 'Export failed', 'error');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Download as CSV`;
        }
    }
};

