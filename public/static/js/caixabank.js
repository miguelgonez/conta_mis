/**
 * CaixaBank Integration & Norma 43 Suite for Slowbooks Pro
 * Supports:
 * - Norma 43 (Cuaderno 43 / AEB 43) official Spanish bank statement parser & importer
 * - CaixaBank CSV / Excel extract importer
 * - Open Banking PSD2 sync (CaixaBank API Market & GoCardless/Redsys Hub)
 * - SEPA XML Remittance generator (Cuaderno 34 / pain.001) for CaixaBankNow
 * - Interactive step-by-step connection guide for CaixaBankNow Empresas & Particulares
 */
const CaixaBankPage = {
    _activeTab: 'norma43',
    _previewData: null,
    _selectedAccount: '',

    async render() {
        let status = { connected_accounts: [], total_balance: 0, open_banking: { is_connected: false } };
        let accounts = [];
        try {
            [status, accounts] = await Promise.all([
                API.get('/caixabank/status'),
                API.get('/banking/accounts')
            ]);
        } catch (e) {
            console.warn('Error loading CaixaBank status:', e);
        }

        const isConnected = status.open_banking?.is_connected || status.connected_accounts.length > 0;
        const totalCaixaBalance = status.total_balance || 0;

        return `
            <div class="page-header" style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
                <div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px; border-radius:6px; background:#0079c2; color:#fff; font-weight:900; font-size:18px;">
                            &#10038;
                        </span>
                        <div>
                            <h2 style="margin:0; font-size:20px; font-weight:700; color:var(--text);">Conexión con CaixaBank</h2>
                            <div style="font-size:12px; color:var(--text-muted);">
                                Integración bancaria oficial: Cuaderno 43 (Norma 43), Open Banking PSD2, CSV y Remesas SEPA
                            </div>
                        </div>
                    </div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-secondary" onclick="CaixaBankPage.loadSampleNorma43()">
                        &#9889; Cargar Extracto Demo (N43)
                    </button>
                    <button class="btn btn-primary" onclick="CaixaBankPage.syncOpenBanking()" style="background:#0079c2; border-color:#00629e;">
                        &#8634; Sincronizar CaixaBank
                    </button>
                </div>
            </div>

            <!-- Summary Cards -->
            <div class="card-grid" style="margin-bottom:16px;">
                <div class="card" style="border-top:3px solid #0079c2;">
                    <div class="card-header" style="font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted);">
                        Cuentas CaixaBank Vinculadas
                    </div>
                    <div class="card-value" style="color:#0079c2;">
                        ${status.connected_accounts.length}
                    </div>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">
                        ${status.connected_accounts.map(a => escapeHtml(a.name)).join(', ') || 'Ninguna cuenta vinculada todavía'}
                    </div>
                </div>

                <div class="card" style="border-top:3px solid var(--success);">
                    <div class="card-header" style="font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted);">
                        Saldo en CaixaBank
                    </div>
                    <div class="card-value" style="color:var(--success);">
                        ${formatCurrency(totalCaixaBalance)}
                    </div>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">
                        ${status.connected_accounts.length > 0 ? 'Actualizado según extractos e ingresos' : 'Sin saldo sincronizado'}
                    </div>
                </div>

                <div class="card" style="border-top:3px solid #f59e0b;">
                    <div class="card-header" style="font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted);">
                        Conexión Open Banking PSD2
                    </div>
                    <div class="card-value" style="font-size:16px; display:flex; align-items:center; gap:6px; margin-top:4px;">
                        <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${isConnected ? 'var(--success)' : '#9ca3af'};"></span>
                        <span style="font-size:15px; font-weight:600;">${isConnected ? 'Operativa' : 'Disponible / Lista'}</span>
                    </div>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">
                        ${status.open_banking?.last_sync ? 'Última sinc.: ' + formatDate(status.open_banking.last_sync) : 'Cuaderno 43 y API listos'}
                    </div>
                </div>
            </div>

            <!-- Tab Navigation -->
            <div style="display:flex; border-bottom:1px solid var(--border); margin-bottom:16px; gap:4px;">
                <button class="btn ${CaixaBankPage._activeTab === 'norma43' ? 'btn-primary' : 'btn-secondary'}" 
                        style="${CaixaBankPage._activeTab === 'norma43' ? 'background:#0079c2; border-color:#00629e;' : ''}"
                        onclick="CaixaBankPage.switchTab('norma43')">
                    &#128196; Norma 43 / Cuaderno 43
                </button>
                <button class="btn ${CaixaBankPage._activeTab === 'openbanking' ? 'btn-primary' : 'btn-secondary'}"
                        style="${CaixaBankPage._activeTab === 'openbanking' ? 'background:#0079c2; border-color:#00629e;' : ''}"
                        onclick="CaixaBankPage.switchTab('openbanking')">
                    &#128279; Open Banking PSD2
                </button>
                <button class="btn ${CaixaBankPage._activeTab === 'sepa' ? 'btn-primary' : 'btn-secondary'}"
                        style="${CaixaBankPage._activeTab === 'sepa' ? 'background:#0079c2; border-color:#00629e;' : ''}"
                        onclick="CaixaBankPage.switchTab('sepa')">
                    &#128179; Remesas SEPA (Cuaderno 34)
                </button>
                <button class="btn ${CaixaBankPage._activeTab === 'guide' ? 'btn-primary' : 'btn-secondary'}"
                        style="${CaixaBankPage._activeTab === 'guide' ? 'background:#0079c2; border-color:#00629e;' : ''}"
                        onclick="CaixaBankPage.switchTab('guide')">
                    &#128214; Guía Paso a Paso CaixaBankNow
                </button>
            </div>

            <!-- Active Tab Content -->
            <div id="caixabank-tab-content">
                ${CaixaBankPage._renderActiveTab(accounts)}
            </div>
        `;
    },

    switchTab(tabName) {
        CaixaBankPage._activeTab = tabName;
        App.navigate('/caixabank');
    },

    _renderActiveTab(accounts) {
        switch (CaixaBankPage._activeTab) {
            case 'norma43':
                return CaixaBankPage._renderNorma43Tab(accounts);
            case 'openbanking':
                return CaixaBankPage._renderOpenBankingTab(accounts);
            case 'sepa':
                return CaixaBankPage._renderSepaTab();
            case 'guide':
                return CaixaBankPage._renderGuideTab();
            default:
                return CaixaBankPage._renderNorma43Tab(accounts);
        }
    },

    _renderNorma43Tab(accounts) {
        const accountOpts = accounts.map(a => `
            <option value="${a.id}" ${a.bank_name?.toLowerCase().includes('caixa') ? 'selected' : ''}>
                ${escapeHtml(a.name)} (${escapeHtml(a.bank_name || 'Banco')} - Saldo: ${formatCurrency(a.balance)})
            </option>
        `).join('');

        return `
            <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:6px; padding:18px; margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                    <div>
                        <h3 style="margin:0 0 4px; font-size:15px; font-weight:700;">Importar Extracto Norma 43 (Cuaderno 43) o CSV</h3>
                        <p style="margin:0; font-size:12px; color:var(--text-muted);">
                            Sube el fichero <code>.n43</code>, <code>.c43</code> o <code>.csv</code> descargado desde CaixaBankNow (Empresas o Particulares).
                            El sistema detectará automáticamente la cuenta, calculará saldos e identificará transferencias, recibos y nóminas.
                        </p>
                    </div>
                    <span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:600; padding:4px 8px; border-radius:4px; font-size:11px;">
                        Estándar AEB / CSB 43
                    </span>
                </div>

                <!-- Dropzone Area -->
                <div id="caixa-dropzone" 
                     style="border:2px dashed #0079c2; background:rgba(0,121,194,0.03); border-radius:8px; padding:28px 20px; text-align:center; cursor:pointer; margin-bottom:16px;"
                     onclick="$('#caixa-file-input').click()"
                     ondragover="event.preventDefault(); this.style.borderColor='var(--success)';"
                     ondragleave="this.style.borderColor='#0079c2';"
                     ondrop="CaixaBankPage.handleFileDrop(event)">
                    <div style="font-size:32px; color:#0079c2; margin-bottom:8px;">&#128194;</div>
                    <div style="font-size:14px; font-weight:600; color:var(--text);">
                        Haz clic aquí para seleccionar o arrastra tu extracto de CaixaBank
                    </div>
                    <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">
                        Formatos compatibles: Norma 43 (<code>.n43</code>, <code>.c43</code>, <code>.txt</code>) y CSV de CaixaBank
                    </div>
                    <input type="file" id="caixa-file-input" style="display:none;" accept=".n43,.c43,.txt,.csv" onchange="CaixaBankPage.handleFileSelect(event)">
                </div>

                <!-- Target Account Selection -->
                <div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap; background:var(--bg); padding:12px; border-radius:6px; border:1px solid var(--border);">
                    <div style="flex:1; min-width:240px;">
                        <label style="display:block; font-size:11px; font-weight:600; margin-bottom:4px;">Cuenta bancaria de destino en Slowbooks:</label>
                        <select id="caixa-target-account" style="width:100%; padding:6px 10px; border-radius:4px; border:1px solid var(--border);">
                            <option value="__NEW__">&#10010; Crear automáticamente nueva cuenta "CaixaBank Cuenta Corriente"</option>
                            ${accountOpts}
                        </select>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; margin-top:16px;">
                        <button class="btn btn-secondary" onclick="CaixaBankPage.loadSampleNorma43()">
                            &#128229; Probar con fichero Demo CaixaBank
                        </button>
                    </div>
                </div>
            </div>

            <!-- Preview Container (Populated dynamically) -->
            <div id="caixa-preview-area"></div>
        `;
    },

    _renderOpenBankingTab(accounts) {
        return `
            <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:6px; padding:18px; margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                    <div>
                        <h3 style="margin:0 0 4px; font-size:15px; font-weight:700;">Conexión Automática Open Banking (PSD2)</h3>
                        <p style="margin:0; font-size:12px; color:var(--text-muted);">
                            Conecta Slowbooks Pro directamente con la API de CaixaBank mediante el estándar europeo PSD2 regulado por el Banco de España.
                        </p>
                    </div>
                    <span class="badge" style="background:#fef3c7; color:#92400e; font-weight:600; padding:4px 8px; border-radius:4px; font-size:11px;">
                        Directiva Europea PSD2
                    </span>
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px; margin:16px 0;">
                    <div style="border:1px solid var(--border); border-radius:6px; padding:14px; background:var(--bg);">
                        <div style="font-weight:700; font-size:13px; color:#0079c2; margin-bottom:4px;">1. Pasarela GoCardless / Nordigen PSD2</div>
                        <p style="font-size:11px; color:var(--text-muted); margin-bottom:10px;">
                            Acceso oficial y gratuito a la API de CaixaBank para consultar saldo y extractos automáticos diarios.
                        </p>
                        <span class="badge" style="background:#dcfce7; color:#166534; font-size:10px;">Recomendado para PYMES</span>
                    </div>

                    <div style="border:1px solid var(--border); border-radius:6px; padding:14px; background:var(--bg);">
                        <div style="font-weight:700; font-size:13px; color:var(--text); margin-bottom:4px;">2. CaixaBank API Market (Directo)</div>
                        <p style="font-size:11px; color:var(--text-muted); margin-bottom:10px;">
                            Conexión corporativa directa a <code>api.caixabank.com</code> con credenciales OAuth2 y certificado eIDAS QWAC.
                        </p>
                        <span class="badge" style="background:#e0f2fe; color:#0369a1; font-size:10px;">Para Grandes Empresas</span>
                    </div>

                    <div style="border:1px solid var(--border); border-radius:6px; padding:14px; background:var(--bg);">
                        <div style="font-weight:700; font-size:13px; color:var(--text); margin-bottom:4px;">3. Redsys PSD2 Interbancario</div>
                        <p style="font-size:11px; color:var(--text-muted); margin-bottom:10px;">
                            Conexión al Hub PSD2 español de Redsys para la agregación centralizada de cuentas de CaixaBank.
                        </p>
                        <span class="badge" style="background:#f3f4f6; color:#4b5563; font-size:10px;">Entorno Interbancario</span>
                    </div>
                </div>

                <form id="caixa-openbanking-form" onsubmit="CaixaBankPage.saveOpenBankingConfig(event)" style="background:var(--bg); border:1px solid var(--border); border-radius:6px; padding:16px;">
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Proveedor PSD2 *</label>
                            <select id="ob-provider" name="provider">
                                <option value="gocardless_nordigen">GoCardless / Nordigen PSD2 Hub (CaixaBank España)</option>
                                <option value="caixabank_direct">CaixaBank API Market Directo (OAuth2)</option>
                                <option value="redsys_hub">Redsys PSD2 Hub España</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>IBAN de la cuenta CaixaBank *</label>
                            <input id="ob-iban" name="account_iban" value="ES21210000010200194821" placeholder="ESxx 2100 xxxx xxxx xxxx" required>
                        </div>
                        <div class="form-group">
                            <label>Token de Conexión / Client ID</label>
                            <input id="ob-client-id" name="client_id" placeholder="eyJhbGciOi... o Client ID de CaixaBank">
                        </div>
                        <div class="form-group">
                            <label>Client Secret / Consent Key</label>
                            <input id="ob-secret" name="client_secret" type="password" placeholder="••••••••••••••••">
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:14px; flex-wrap:wrap; gap:8px;">
                        <div style="font-size:11px; color:var(--text-muted);">
                            &#128274; Todas las credenciales se procesan de forma segura según el estándar PSD2.
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button type="submit" class="btn btn-secondary">Guardar Configuración</button>
                            <button type="button" class="btn btn-primary" onclick="CaixaBankPage.syncOpenBanking()" style="background:#0079c2; border-color:#00629e;">
                                &#8634; Probar Conexión y Sincronizar
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        `;
    },

    _renderSepaTab() {
        return `
            <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:6px; padding:18px; margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                    <div>
                        <h3 style="margin:0 0 4px; font-size:15px; font-weight:700;">Generador de Remesas SEPA para CaixaBank</h3>
                        <p style="margin:0; font-size:12px; color:var(--text-muted);">
                            Genera ficheros normalizados SEPA ISO 20022 (<code>pain.001</code> / Cuaderno 34) listos para subir a CaixaBankNow Empresas para emitir pagos masivos a proveedores o nóminas.
                        </p>
                    </div>
                    <span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:600; padding:4px 8px; border-radius:4px; font-size:11px;">
                        Cuaderno 34 / ISO 20022
                    </span>
                </div>

                <div style="background:var(--bg); border:1px solid var(--border); border-radius:6px; padding:16px; margin-bottom:16px;">
                    <div style="font-size:13px; font-weight:600; margin-bottom:8px;">Opciones de Emisión SEPA:</div>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
                        <div class="form-group" style="margin:0;">
                            <label>Tipo de Remesa</label>
                            <select id="sepa-type">
                                <option value="pain001">Cuaderno 34 - Transferencias y Pagos a Proveedores (pain.001)</option>
                                <option value="payroll">Cuaderno 34 - Transferencias de Nóminas</option>
                                <option value="pain008">Cuaderno 19 - Domiciliación de Recibos de Clientes (pain.008)</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label>Cuenta Emisora (CaixaBank)</label>
                            <input value="ES21 2100 0001 02 00194821" readonly style="background:var(--bg-card); font-family:monospace;">
                        </div>
                        <div class="form-group" style="margin:0;">
                            <label>Código BIC/SWIFT</label>
                            <input value="CAIXESBBXXX" readonly style="background:var(--bg-card); font-family:monospace;">
                        </div>
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <div style="font-size:11px; color:var(--text-muted);">
                        El fichero generado se descarga directamente en tu equipo y se sube en <strong>CaixaBankNow &gt; Ficheros &gt; Enviar Ficheros</strong>.
                    </div>
                    <button class="btn btn-primary" onclick="CaixaBankPage.downloadSepaXml()" style="background:#0079c2; border-color:#00629e;">
                        &#128229; Descargar Fichero SEPA XML (pain.001)
                    </button>
                </div>
            </div>
        `;
    },

    _renderGuideTab() {
        return `
            <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:6px; padding:18px;">
                <h3 style="margin:0 0 8px; font-size:16px; font-weight:700; color:var(--text);">
                    Guía: Cómo descargar tus movimientos de CaixaBank
                </h3>
                <p style="font-size:12px; color:var(--text-muted); margin-bottom:20px;">
                    Sigue estos sencillos pasos para obtener tu fichero oficial de movimientos desde la banca electrónica de CaixaBank.
                </p>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:20px;">
                    <!-- Option 1: Empresas -->
                    <div style="border:1px solid var(--border); border-radius:8px; padding:16px; background:var(--bg);">
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                            <span style="background:#0079c2; color:#fff; font-weight:700; border-radius:4px; padding:2px 8px; font-size:11px;">EMPRESAS</span>
                            <h4 style="margin:0; font-size:14px; font-weight:700;">CaixaBankNow Empresas (Línea Abierta)</h4>
                        </div>
                        <ol style="margin:0; padding-left:18px; font-size:12px; line-height:1.8; color:var(--text);">
                            <li>Accede a <strong>CaixaBankNow Empresas</strong> con tu usuario y contraseña.</li>
                            <li>En el menú superior, navega a <strong>Cuentas</strong> &gt; <strong>Ficheros</strong> &gt; <strong>Recepción de ficheros</strong>.</li>
                            <li>Selecciona <strong>Cuaderno 43 (Norma 43)</strong>.</li>
                            <li>Indica la cuenta corriente y el rango de fechas (ej. último mes o trimestre).</li>
                            <li>Haz clic en <strong>Descargar</strong> (se guardará un archivo <code>.n43</code> o <code>.txt</code>).</li>
                            <li>Regresa a Slowbooks Pro y arrástralo en la pestaña <strong>Norma 43</strong>.</li>
                        </ol>
                    </div>

                    <!-- Option 2: Particulares y Autónomos -->
                    <div style="border:1px solid var(--border); border-radius:8px; padding:16px; background:var(--bg);">
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                            <span style="background:#0369a1; color:#fff; font-weight:700; border-radius:4px; padding:2px 8px; font-size:11px;">PARTICULARES / AUTÓNOMOS</span>
                            <h4 style="margin:0; font-size:14px; font-weight:700;">CaixaBankNow Web o App</h4>
                        </div>
                        <ol style="margin:0; padding-left:18px; font-size:12px; line-height:1.8; color:var(--text);">
                            <li>Inicia sesión en <strong>CaixaBankNow</strong>.</li>
                            <li>Entra en el detalle de tu <strong>Cuenta Corriente</strong>.</li>
                            <li>Pulsa sobre <strong>Movimientos</strong> y filtra por las fechas deseadas.</li>
                            <li>Pulsa el botón de opciones <strong>Descargar / Exportar</strong>.</li>
                            <li>Elige <strong>Norma 43</strong> o <strong>Excel / CSV</strong>.</li>
                            <li>Sube el fichero descargado en Slowbooks Pro para su importación instantánea.</li>
                        </ol>
                    </div>
                </div>

                <div style="margin-top:20px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:14px; font-size:12px; color:#1e40af;">
                    <strong>&#128161; ¿Por qué Norma 43 es la mejor opción?</strong><br>
                    El formato Norma 43 es el estándar de oro de la banca en España: incluye saldos de apertura y cierre certificados, fechas valor exactas, referencias completas de transferencias e identificadores únicos que evitan duplicar movimientos.
                </div>
            </div>
        `;
    },

    async handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;
        await CaixaBankPage.processFile(file);
    },

    async handleFileDrop(e) {
        e.preventDefault();
        $('#caixa-dropzone').style.borderColor = '#0079c2';
        const file = e.dataTransfer.files[0];
        if (!file) return;
        await CaixaBankPage.processFile(file);
    },

    async processFile(file) {
        try {
            showToast('Leyendo extracto de CaixaBank...', 'info');
            const text = await file.text();
            const format = file.name.endsWith('.csv') ? 'csv' : 'n43';

            const resp = await fetch('/api/caixabank/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: text, filename: file.name, format })
            });

            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Error al procesar el archivo');

            CaixaBankPage._previewData = {
                rawContent: text,
                filename: file.name,
                format: data.format,
                statements: data.statements
            };

            CaixaBankPage.renderPreview();
            showToast(`Extracto de CaixaBank cargado: ${data.total_transactions || data.statements[0]?.transactions.length || 0} movimientos encontrados`, 'success');
        } catch (err) {
            showToast(err.message, 'danger');
        }
    },

    async loadSampleNorma43() {
        try {
            showToast('Cargando extracto de muestra de CaixaBank...', 'info');
            const resp = await API.get('/caixabank/sample-n43');
            CaixaBankPage._previewData = {
                rawContent: resp.raw,
                filename: resp.filename,
                format: 'norma43',
                statements: resp.statements
            };
            CaixaBankPage.renderPreview();
            showToast(`Extracto Demo CaixaBank cargado: ${resp.transaction_count} movimientos`, 'success');
        } catch (err) {
            showToast(err.message, 'danger');
        }
    },

    renderPreview() {
        const container = $('#caixa-preview-area');
        if (!container || !CaixaBankPage._previewData) return;

        const { statements, filename, format } = CaixaBankPage._previewData;
        const stmt = statements[0];
        if (!stmt) return;

        const txs = stmt.transactions || [];
        const rows = txs.map((tx, idx) => `
            <tr>
                <td style="white-space:nowrap; font-size:11px;">${formatDate(tx.date)}</td>
                <td style="white-space:nowrap; font-size:11px; color:var(--text-muted);">${formatDate(tx.value_date)}</td>
                <td style="font-size:12px; font-weight:600;">
                    ${escapeHtml(tx.payee || tx.description)}
                    ${tx.reference ? `<div style="font-size:10px; color:var(--text-muted); font-weight:normal;">Ref: ${escapeHtml(tx.reference)}</div>` : ''}
                </td>
                <td style="font-size:11px; color:var(--text-muted);">${escapeHtml(tx.description || tx.common_concept || 'Movimiento')}</td>
                <td class="col-amount" style="font-size:12px; font-weight:700; color:${tx.credit > 0 ? 'var(--success)' : 'var(--danger)'};">
                    ${tx.credit > 0 ? '+' : '-'}${formatCurrency(tx.credit > 0 ? tx.credit : tx.debit)}
                </td>
            </tr>
        `).join('');

        container.innerHTML = `
            <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:6px; padding:18px; margin-top:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
                    <div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="badge" style="background:#0079c2; color:#fff; font-weight:700; font-size:11px;">
                                ${escapeHtml(stmt.bank_name || 'CaixaBank')}
                            </span>
                            <span style="font-weight:700; font-size:14px;">
                                Cuenta: ${escapeHtml(stmt.iban || stmt.account_number)}
                            </span>
                        </div>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">
                            Fichero: <strong>${escapeHtml(filename)}</strong> &bull; Período: ${formatDate(stmt.start_date)} al ${formatDate(stmt.end_date)} &bull; Formato: ${format.toUpperCase()}
                        </div>
                    </div>
                    <div style="display:flex; gap:8px;">
                        <button class="btn btn-secondary" onclick="CaixaBankPage.clearPreview()">Cancelar</button>
                        <button class="btn btn-primary" onclick="CaixaBankPage.confirmImport()" style="background:var(--success); border-color:var(--success);">
                            &#10003; Confirmar e Importar ${txs.length} Movimientos
                        </button>
                    </div>
                </div>

                <!-- Financial Balance Recap -->
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:10px; background:var(--bg); padding:12px; border-radius:6px; margin-bottom:14px; border:1px solid var(--border);">
                    <div>
                        <div style="font-size:10px; text-transform:uppercase; color:var(--text-muted);">Saldo Inicial</div>
                        <div style="font-size:13px; font-weight:700;">${formatCurrency(stmt.initial_balance)}</div>
                    </div>
                    <div>
                        <div style="font-size:10px; text-transform:uppercase; color:var(--text-muted);">Total Cargos (Gastos)</div>
                        <div style="font-size:13px; font-weight:700; color:var(--danger);">-${formatCurrency(stmt.debit_total)}</div>
                    </div>
                    <div>
                        <div style="font-size:10px; text-transform:uppercase; color:var(--text-muted);">Total Abonos (Ingresos)</div>
                        <div style="font-size:13px; font-weight:700; color:var(--success);">+${formatCurrency(stmt.credit_total)}</div>
                    </div>
                    <div>
                        <div style="font-size:10px; text-transform:uppercase; color:var(--text-muted);">Saldo Final Resultante</div>
                        <div style="font-size:13px; font-weight:700; color:#0079c2;">${formatCurrency(stmt.final_balance || (stmt.initial_balance + stmt.credit_total - stmt.debit_total))}</div>
                    </div>
                </div>

                <!-- Table Preview -->
                <div style="max-height:400px; overflow-y:auto; border:1px solid var(--border); border-radius:4px;">
                    <table class="data-table" style="margin:0;">
                        <thead>
                            <tr>
                                <th>Fecha Op.</th>
                                <th>Fecha Valor</th>
                                <th>Beneficiario / Concepto Ampliado</th>
                                <th>Tipo Operación</th>
                                <th class="col-amount">Importe (€)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    clearPreview() {
        CaixaBankPage._previewData = null;
        $('#caixa-preview-area').innerHTML = '';
    },

    async confirmImport() {
        if (!CaixaBankPage._previewData) return;
        try {
            showToast('Importando movimientos a Slowbooks Pro...', 'info');
            const targetAcctVal = $('#caixa-target-account')?.value || '__NEW__';
            const createNew = targetAcctVal === '__NEW__';
            const bankAccountId = createNew ? null : targetAcctVal;

            const resp = await fetch('/api/caixabank/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: CaixaBankPage._previewData.rawContent,
                    format: CaixaBankPage._previewData.format,
                    bank_account_id: bankAccountId,
                    create_account: createNew,
                    account_name: 'CaixaBank Cuenta Corriente'
                })
            });

            const result = await resp.json();
            if (!resp.ok) throw new Error(result.error || 'Error al importar los movimientos');

            showToast(result.message || 'Movimientos importados correctamente', 'success');
            CaixaBankPage.clearPreview();

            // Refresh view
            setTimeout(() => {
                App.navigate('/caixabank');
            }, 800);
        } catch (err) {
            showToast(err.message, 'danger');
        }
    },

    async saveOpenBankingConfig(e) {
        e.preventDefault();
        try {
            const form = e.target;
            const payload = {
                provider: form.provider.value,
                account_iban: form.account_iban.value,
                client_id: form.client_id.value,
                client_secret: form.client_secret.value,
                environment: 'production'
            };

            showToast('Guardando configuración de Open Banking...', 'info');
            const resp = await fetch('/api/caixabank/open-banking/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const res = await resp.json();
            if (!resp.ok) throw new Error(res.error || 'Error al guardar');

            showToast(res.message, 'success');
        } catch (err) {
            showToast(err.message, 'danger');
        }
    },

    async syncOpenBanking() {
        try {
            showToast('Sincronizando con CaixaBank Open Banking PSD2...', 'info');
            const resp = await fetch('/api/caixabank/open-banking/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            const res = await resp.json();
            if (!resp.ok) throw new Error(res.error || 'Error en sincronización');

            showToast(res.message, 'success');
            setTimeout(() => {
                App.navigate('/caixabank');
            }, 800);
        } catch (err) {
            showToast(err.message, 'danger');
        }
    },

    async downloadSepaXml() {
        try {
            showToast('Generando remesa SEPA XML (Cuaderno 34)...', 'info');
            const resp = await fetch('/api/caixabank/sepa/pain001', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            if (!resp.ok) throw new Error('Error al generar remesa SEPA');

            const blob = await resp.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `remesa_sepa_caixabank_${Date.now()}.xml`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            showToast('Remesa SEPA descargada. Lista para subir a CaixaBankNow.', 'success');
        } catch (err) {
            showToast(err.message, 'danger');
        }
    },

    // Modal view for quick access from Banking page
    async showModal() {
        const accounts = await API.get('/banking/accounts');
        const modalBody = `
            <div style="margin-bottom:12px;">
                <p style="font-size:12px; color:var(--text-muted); margin:0 0 10px;">
                    Selecciona cómo deseas conectar o importar los datos de tu cuenta CaixaBank:
                </p>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:16px;">
                    <div style="border:1px solid var(--border); border-radius:6px; padding:12px; cursor:pointer; background:var(--bg);" 
                         onclick="closeModal(); App.navigate('/caixabank');">
                        <div style="font-weight:700; font-size:13px; color:#0079c2;">&#128196; Subir Norma 43 / CSV</div>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Importación de extractos oficiales de CaixaBankNow</div>
                    </div>
                    <div style="border:1px solid var(--border); border-radius:6px; padding:12px; cursor:pointer; background:var(--bg);" 
                         onclick="closeModal(); CaixaBankPage.loadSampleNorma43(); App.navigate('/caixabank');">
                        <div style="font-weight:700; font-size:13px; color:var(--success);">&#9889; Cargar Demo CaixaBank</div>
                        <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Probar al instante con extracto de ejemplo</div>
                    </div>
                </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px;">
                <button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
                <button class="btn btn-primary" onclick="closeModal(); App.navigate('/caixabank');" style="background:#0079c2; border-color:#00629e;">
                    Abrir Centro CaixaBank
                </button>
            </div>
        `;
        showModal('Conectar con CaixaBank', modalBody);
    }
};
