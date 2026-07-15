window.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' || event.keyCode === 13) {
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT')) {
            document.activeElement.blur();
        }
    }
});

const app = {
    version: 'v26.4.4', // バージョン更新（FLIGHT SUMMARY追加、UTC統一）
    state: { 
        waypoints: [], altns: [{name:'', fuel:0, rsv:0}], alertThreshold: 0, destFuelThreshold: 0, headerInfo: "", flightMeta: null, fuelCalcBasis: 'CALC',
        crew: [{ id: 1, duty: 'PIC', empNo: '', name: '', rank: 'CAP' }, { id: 2, duty: 'COP', empNo: '', name: '', rank: 'COP' }],
        crewMemo: '', takeoffPilotId: null, landingPilotId: null, crewPanelOpen: false,
        times: { bo: '', bi: '', tkof: '', ldg: '' }, actFob: '', actFod: '',
        postFlightLog: null, activeInput: null, flightHistory: [],
        rawForecastText: "",
        activeNumpadTarget: null,
        activeNumpadType: 'time'
    },

    printNavlog() {
        let out = "=========================================================================\n";
        out += "                      FLIGHT RECORD (DRM & NAVLOG)\n";
        out += "=========================================================================\n\n";

        // --- 1. DRM INFORMATION ---
        out += "[ 1. DRM INFORMATION ]\n";
        out += (this.state.headerInfo || "NO DRM DATA") + "\n\n";
        out += "-------------------------------------------------------------------------\n\n";

        // --- 2. NAVIGATION LOG ---
        out += "[ 2. NAVIGATION LOG ]\n";
        out += "WP       ALT   EST TIME / FUEL(PLAN)    ACT TIME / FUEL     DIFF (T/F)\n";
        out += "-------------------------------------------------------------------------\n";

        this.state.waypoints.forEach(wp => {
            let name = (wp.name || "").padEnd(9, " ");
            let alt = (wp.estAltDisplay || "").padEnd(6, " ");
            
            // EST
            let estTime = (wp.estTimeDisplay || "--").padStart(5, " ");
            let estFuel = wp.estFuelDisplay !== null ? wp.estFuelDisplay.toFixed(1) : "--";
            let planFuel = wp.plannedFuel !== null ? wp.plannedFuel.toFixed(1) : "--";
            let estCombo = `${estFuel}(${planFuel})`;
            let estStr = `${estTime}  / ${estCombo.padEnd(13, " ")}`.padEnd(25, " ");

            // ACT
            let actTime = (wp.actualTime && wp.actualTime.length === 4) ? wp.actualTime : "----";
            let actFuelVal = this.state.fuelCalcBasis === 'TTL' ? wp.actualFuelTTL : wp.actualFuelCALC;
            let actFuel = actFuelVal !== '' && actFuelVal !== undefined ? parseFloat(actFuelVal).toFixed(1) : "-----";
            let actStr = `${actTime.padStart(5, " ")}  / ${actFuel.padEnd(6, " ")}`.padEnd(20, " ");

            // DIFF
            let tDiff = wp.timeDiff !== null ? (wp.timeDiff > 0 ? '+'+wp.timeDiff : (wp.timeDiff === 0 ? '±0' : wp.timeDiff)) : '---';
            let fDiff = wp.fuelDiff !== null ? (wp.fuelDiff > 0 ? '+'+wp.fuelDiff.toFixed(1) : (wp.fuelDiff === 0 ? '±0.0' : wp.fuelDiff.toFixed(1))) : '----';
            let diffStr = `${String(tDiff).padStart(4, " ")} / ${String(fDiff).padStart(6, " ")}`;

            out += `${name}${alt}${estStr}${actStr}${diffStr}\n`;
        });

        out += "\n-------------------------------------------------------------------------\n";
        
        // --- 3. FLIGHT SUMMARY ---
        out += "[ 3. FLIGHT SUMMARY ]\n";
        
        // 計画時間（STD/STA）からLocal時間（/1900Lなど）を正規表現で排除してUTC(Z)のみにする
        let planTime = (this.state.flightMeta && this.state.flightMeta.time) ? this.state.flightMeta.time : "STD ----Z STA ----Z";
        planTime = planTime.replace(/\/\d{4}L/g, ''); 
        out += `${planTime}\n`;

        // 実際の時間（Zを付与）
        let tBo = (this.state.times.bo && this.state.times.bo.length >= 4) ? this.state.times.bo + "Z" : "----";
        let tTkof = (this.state.times.tkof && this.state.times.tkof.length >= 4) ? this.state.times.tkof + "Z" : "----";
        let tLdg = (this.state.times.ldg && this.state.times.ldg.length >= 4) ? this.state.times.ldg + "Z" : "----";
        let tBi = (this.state.times.bi && this.state.times.bi.length >= 4) ? this.state.times.bi + "Z" : "----";
        out += `ACTUAL TIMES:  B/O ${tBo}   TKOF ${tTkof}   LDG ${tLdg}   B/I ${tBi}\n\n`;

        // 計画燃料（DRMから抽出）
        let planFobMatch = this.state.headerInfo ? this.state.headerInfo.match(/FOB\s+\d{2}\/\d{2}\s+(\d+)/) : null;
        let planFob = planFobMatch ? planFobMatch[1] + "LB" : "------LB";
        let planFodMatch = this.state.headerInfo ? this.state.headerInfo.match(/FOD=(\d+)LB/) : null;
        let planFod = planFodMatch ? planFodMatch[1] + "LB" : "------LB";
        out += `PLAN FOB: ${planFob}   FOD ${planFod}\n`;

        // 実際の燃料（LBを付与）
        let aFob = this.state.actFob ? this.state.actFob + "LB" : "------LB";
        let aFod = this.state.actFod ? this.state.actFod + "LB" : "------LB";
        out += `ACTUAL FUEL :  FOB ${aFob}   FOD ${aFod}\n\n`;

        out += "=========================================================================\n";

        // --- CREW 情報 ---
        let picName = "---", sicName = "---", picId = "---", sicId = "---";
        const pic = this.state.crew.find(c => c.duty === 'PIC');
        if (pic) { picName = pic.name || "---"; picId = pic.empNo || "---"; }
        const sic = this.state.crew.find(c => c.duty === 'SIC' || c.duty === 'COP');
        if (sic) { sicName = sic.name || "---"; sicId = sic.empNo || "---"; }

        out += `CREW: PIC ${picId} ${picName}   /   SIC ${sicId} ${sicName}\n`;
        out += "=========================================================================\n";

        // HTMLの最下部にテキストをセットして印刷実行
        let pre = document.getElementById('print-text-area');
        if (!pre) {
            pre = document.createElement('pre');
            pre.id = 'print-text-area';
            document.body.appendChild(pre);
        }
        pre.textContent = out;

        // 同期的に印刷を呼び出してSafariのブロックを回避
        window.print();
    },
    
    // --- ★追加: Swift側のPDFファイル選択画面を開く ---
    openPDFPicker() {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.pdfPickerHandler) {
            window.webkit.messageHandlers.pdfPickerHandler.postMessage('pickPDF');
        } else {
            alert("この機能はiPad(Swift)のネイティブアプリ環境でのみ動作します。\nブラウザ環境の場合は「ファイルを選択」をご利用ください。");
        }
    },

    // --- ★追加: Swift側から抽出されたテキストを受け取って処理する ---
    loadFromSwiftPDF(text) {
        if (!text || text.trim() === '') {
            alert("PDFからテキストを抽出できませんでした。");
            return;
        }
        
        try {
            // Noriさんの環境で動いている最強の解析関数に丸投げ！
            this.processData(text);
        } catch (e) {
            console.error(e);
            alert("PDFの解析中にエラーが発生しました: " + e.message);
        }
    },
    
    init() {
        const titleEl = document.getElementById('defaultTitle');
        if (titleEl) titleEl.textContent = `✈️ NAVLOG Tracker ${this.version}`;

        const saved = localStorage.getItem('navlog_v25_data');
        if (saved) {
            const parsed = JSON.parse(saved);
            this.state = { ...this.state, ...parsed };
            if (!this.state.altns || this.state.altns.length === 0) this.state.altns = [{name:'', fuel:0, rsv:0}];
            if (!this.state.fuelCalcBasis) this.state.fuelCalcBasis = 'CALC';
            if (this.state.destFuelThreshold === undefined) this.state.destFuelThreshold = 0;
            if (!this.state.times) this.state.times = { bo: '', bi: '', tkof: '', ldg: '' };
            if (this.state.actFob === undefined) this.state.actFob = '';
            if (this.state.actFod === undefined) this.state.actFod = '';
            if (this.state.crewMemo === undefined) this.state.crewMemo = ''; 
            if (this.state.rawForecastText === undefined) this.state.rawForecastText = ''; 
            if (!this.state.crew || this.state.crew.length === 0) {
                this.state.crew = [{ id: 1, duty: 'PIC', empNo: '', name: '', rank: 'CAP' }, { id: 2, duty: 'COP', empNo: '', name: '', rank: 'COP' }];
            }
            if (!this.state.flightHistory) this.state.flightHistory = [];

            this.state.waypoints.forEach(wp => {
                if (wp.actualFuel !== undefined) { wp.actualFuelCALC = wp.actualFuel; wp.actualFuelTTL = ''; delete wp.actualFuel; }
                if (wp.isaDevNum === undefined) wp.isaDevNum = null;
                if (wp.isaTmp === undefined) wp.isaTmp = null;
                if (wp.mwtp === undefined) wp.mwtp = '---';
                if (wp.wscp === undefined) wp.wscp = '---';
                if (wp.turbulence === undefined) wp.turbulence = '';
            });
        }
        
        if (!this.state.postFlightLog) {
            this.state.postFlightLog = {
                domInt: 'DOM', activeDuty: 'PIC', day: '', type: 'B767', reg: '', dep: '', arr: '', fltNumber: '',
                depTime: '', arrTime: '', tkof: '', ldg: '', fltTime: '', picTime: '', sicTime: '', ngtPicSic: '', copTime: '', ngtCop: '', imc: '', apchType: ''
            };
        }

        this.renderSettings();
        if (this.state.headerInfo) {
            document.getElementById('headerInfoContent').textContent = this.state.headerInfo;
        }
        if (this.state.flightMeta) this.renderFlightMeta();
        
        if (this.state.waypoints.length > 0) this.showMainUI();
        else if (this.renderFlightHistory) this.renderFlightHistory(); 
        
        this.setupFocusScrollBehavior();
        this.updateThemeButton();
        window.addEventListener('resize', () => this.updateStickyHeight());

        if (!document.getElementById('app-version-display')) {
            const vDiv = document.createElement('div'); vDiv.id = 'app-version-display'; vDiv.className = 'no-print';
            vDiv.style.cssText = 'position: fixed; bottom: 5px; right: 10px; font-size: 10px; color: var(--text-faint); z-index: 9999; pointer-events: none; opacity: 0.5; font-family: "SF Mono", monospace;';
            vDiv.textContent = this.version; document.body.appendChild(vDiv);
        }
    },

    showMainUI() {
        document.getElementById('statusBar').style.display = 'flex';
        document.getElementById('bottomControls').style.display = 'block';
        document.getElementById('inputArea').style.display = 'none';
        
        ['crewInfoCard', 'headerInfoCard', 'forecastInfoCard'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
            const btn = document.getElementById('btn_' + id);
            if (btn) btn.style.background = 'rgba(255,255,255,0.1)';
        });
        
        document.body.style.overflow = '';

        this.renderForecastCard();
        this.state.crewPanelOpen = false;

        if(this.updateCrewPanelUI) this.updateCrewPanelUI();
        if(this.renderCrew) this.renderCrew();
        this.renderTimes();
        if(this.renderActualFuel) this.renderActualFuel(); 
        if(this.renderPostFlightLog) this.renderPostFlightLog();
        this.renderCrewMemo();
        document.getElementById('tableBody').innerHTML = ''; 
        this.render();
    },

    setupFocusScrollBehavior() {
        document.addEventListener('focusin', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                app.state.activeInput = e.target; setTimeout(() => app.adjustScrollForInput(e.target), 300);
            }
        });
        document.addEventListener('focusout', () => { app.state.activeInput = null; });
    },

    adjustScrollForInput(el) {
        if (!el) return;
        const header = document.getElementById('flightHeader');
        const headerHeight = (header && header.parentElement) ? header.parentElement.offsetHeight : 0;
        const th = document.querySelector('.table-container th');
        const thHeight = th ? th.offsetHeight : 0;
        const headerOffset = headerHeight + thHeight + 20;
        const rect = el.getBoundingClientRect(), visualViewport = window.visualViewport;
        if (rect.top < headerOffset) window.scrollBy({ top: rect.top - headerOffset, behavior: 'smooth' });
        else if (visualViewport && rect.bottom > visualViewport.height) window.scrollBy({ top: rect.bottom - visualViewport.height + 10, behavior: 'smooth' });
    },

    toggleTheme() {
        const isDark = document.documentElement.classList.toggle('theme-dark');
        localStorage.setItem('navlog_theme', isDark ? 'dark' : 'light'); this.updateThemeButton();
    },
    
    updateThemeButton() {
        const btn = document.getElementById('themeToggleBtn');
        if(btn) btn.innerHTML = document.documentElement.classList.contains('theme-dark') ? '☀️ DAY' : '🌙 NGT';
    },

    updateStickyHeight() {
        const header = document.getElementById('flightHeader');
        if (header && header.parentElement) {
            document.documentElement.style.setProperty('--sb-height', header.parentElement.offsetHeight + 'px');
        }
    },

    scrollToRow(index) {
        const row = document.getElementById(`row-${index}`);
        if (row) {
            const header = document.getElementById('flightHeader');
            const headerHeight = (header && header.parentElement) ? header.parentElement.offsetHeight : 85;
            const offset = headerHeight + (document.querySelector('.table-container th').offsetHeight || 30) + 15; 
            window.scrollTo({ top: row.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
        }
    },

    toggleSettings() { const p = document.getElementById('settingsPanel'); p.style.display = p.style.display === 'none' ? 'block' : 'none'; },

    togglePanel(panelId) {
        const panels = ['crewInfoCard', 'headerInfoCard', 'forecastInfoCard'];
        let anyOpen = false;

        panels.forEach(id => {
            const el = document.getElementById(id);
            const btn = document.getElementById('btn_' + id);
            if (!el) return;
            if (id === panelId) {
                const isHidden = (el.style.display === 'none');
                el.style.display = isHidden ? 'block' : 'none';
                if (btn) btn.style.background = isHidden ? 'var(--accent-color)' : 'rgba(255,255,255,0.1)';
                
                if (id === 'crewInfoCard' && isHidden) {
                    const contentEl = document.getElementById('crewContentEl');
                    if (contentEl) contentEl.style.display = 'block';
                }
                if (isHidden) anyOpen = true;

            } else {
                el.style.display = 'none';
                const otherBtn = document.getElementById('btn_' + id);
                if (otherBtn) otherBtn.style.background = 'rgba(255,255,255,0.1)';
            }
        });

        if (anyOpen) {
            app.lockedScrollY = window.scrollY; 
            document.body.style.position = 'fixed';
            document.body.style.top = `-${app.lockedScrollY}px`;
            document.body.style.width = '100%';
        } else {
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
            window.scrollTo(0, app.lockedScrollY || 0); 
        }
    },

    renderSettings() {
        const container = document.getElementById('altnSettingsContainer'); container.innerHTML = '';
        document.getElementById('alertThreshold').value = this.state.alertThreshold || 0;
        const destThEl = document.getElementById('destFuelThreshold'); if (destThEl) destThEl.value = this.state.destFuelThreshold || 0;
        const basisEl = document.getElementById('fuelCalcBasis'); if(basisEl) basisEl.value = this.state.fuelCalcBasis || 'CALC';

        this.state.altns.forEach((altn, idx) => {
            const div = document.createElement('div'); div.className = 'input-group';
            div.innerHTML = `
                <label style="font-size: 10px;">ALTN ${idx + 1} (AP / Fuel / RSV)</label>
                <div style="display: flex; gap: 5px;">
                    <input type="text" id="altnName_${idx}" style="width: 55px; text-transform: uppercase;" placeholder="AP" value="${altn.name}" onchange="app.saveAltnConfig()">
                    <input type="text" id="altnFuel_${idx}" style="width: 65px;" placeholder="ALTN" value="${altn.fuel || ''}" readonly onclick="app.showNumpad(this, 'ALTN FUEL', 'fuel')" onchange="app.saveAltnConfig()">
                    <input type="text" id="altnRsv_${idx}" style="width: 65px;" placeholder="RSV" value="${altn.rsv || ''}" readonly onclick="app.showNumpad(this, 'ALTN RSV', 'fuel')" onchange="app.saveAltnConfig()">
                    <button class="btn-danger btn-small" onclick="app.removeAltn(${idx})">✖</button>
                </div>`;
            container.appendChild(div);
        });
    },

    addAltn() { this.state.altns.push({name:'', fuel:0, rsv:0}); this.renderSettings(); this.saveConfig(); },
    removeAltn(idx) { this.state.altns.splice(idx, 1); this.renderSettings(); this.saveConfig(); },
    saveAltnConfig() {
        this.state.altns.forEach((altn, idx) => {
            const nameEl = document.getElementById(`altnName_${idx}`);
            if(nameEl) {
                altn.name = nameEl.value.toUpperCase(); 
                altn.fuel = parseFloat(document.getElementById(`altnFuel_${idx}`).value) || 0; 
                altn.rsv = parseFloat(document.getElementById(`altnRsv_${idx}`).value) || 0;
            }
        });
        this.saveConfig();
    },
    changeFuelBasis() { this.state.fuelCalcBasis = document.getElementById('fuelCalcBasis').value; this.saveConfig(); if(this.calculate) this.calculate(); this.render(); },
    
    saveConfig() {
        this.state.alertThreshold = parseFloat(document.getElementById('alertThreshold').value) || 0;
        this.state.destFuelThreshold = parseFloat(document.getElementById('destFuelThreshold').value) || 0;
        if(this.syncCrewToHistory) this.syncCrewToHistory();
        try { localStorage.setItem('navlog_v25_data', JSON.stringify(this.state)); } catch(e){}
        if(this.renderStatusBar) this.renderStatusBar(); 
    },

    updateTime(field, val) {
        if (this.sanitizeTimeInput) val = this.sanitizeTimeInput(val);
        this.state.times[field] = val;
        
        if ((field === 'bo' || field === 'bi') && this.calcPflTimes) this.calcPflTimes();
        if (field === 'tkof' && this.state.waypoints.length > 0) { this.state.waypoints[0].actualTime = val; if(this.calculate) this.calculate(); this.render(); }
        else this.saveConfig();
        
        this.renderTimes();
    },
    
    renderTimes() { ['bo', 'bi', 'tkof', 'ldg'].forEach(f => { const el = document.getElementById('time_' + f); if (el && document.activeElement !== el) el.value = this.state.times[f] || ''; }); },

    renderFlightMeta() {
        document.getElementById('defaultTitle').style.display = 'none';
        document.getElementById('flightHeader').style.display = 'block';
        document.getElementById('fh-flt').textContent = this.state.flightMeta.flt;
        document.getElementById('fh-date').textContent = this.state.flightMeta.date;
        document.getElementById('fh-reg').textContent = this.state.flightMeta.reg;
        document.getElementById('fh-route').textContent = `${this.state.flightMeta.dep} ➔ ${this.state.flightMeta.dest}`;
        document.getElementById('fh-altn').textContent = this.state.flightMeta.altn;
        document.getElementById('fh-time').textContent = this.state.flightMeta.time;
        document.getElementById('fh-bt').textContent = this.state.flightMeta.bt || "---";
        document.getElementById('fh-ft').textContent = this.state.flightMeta.ft || "---";
        document.getElementById('fh-dist').textContent = (this.state.flightMeta.dist !== "---" ? this.state.flightMeta.dist + " NM" : "---");
    },

    renderForecastCard() {
        const headerCard = document.getElementById('headerInfoCard');
        if (!headerCard) return; 
        
        let card = document.getElementById('forecastInfoCard');
        if (!card) {
            card = document.createElement('div');
            card.id = 'forecastInfoCard';
            card.className = 'card-drm no-print';
            card.style.display = 'none';
            card.style.margin = '0';
            card.style.border = 'none';
            card.style.borderRadius = '0';
            card.innerHTML = `<div id="forecastInfoContent" class="drm-content" style="font-size: 15px; font-family: 'SF Mono', monospace; white-space: pre; overflow-x: auto; padding: 20px;"></div>`;
            headerCard.parentNode.insertBefore(card, headerCard.nextSibling);
        }
        
        const btn = document.getElementById('btn_forecastInfoCard');
        if (this.state.rawForecastText && this.state.rawForecastText.trim() !== '') {
            card.style.display = 'none';
            document.getElementById('forecastInfoContent').textContent = this.state.rawForecastText;
            if(btn) btn.style.display = 'block';
        } else {
            card.style.display = 'none';
            if(btn) btn.style.display = 'none';
        }
    },

    renderCrewMemo() {
        const crewContent = document.getElementById('crewContentEl'); if (!crewContent) return;
        let container = document.getElementById('crew_memo_container');
        if (!container) {
            container = document.createElement('div'); container.id = 'crew_memo_container';
            container.style.cssText = 'margin-top: 15px; border-top: 1px dashed var(--border-color); padding-top: 15px; padding-left: 15px; padding-right: 15px;';
            container.innerHTML = `<div style="font-size: 11px; font-weight: bold; color: var(--text-muted); margin-bottom: 5px;">📝 FLIGHT MEMO</div><textarea id="crew_memo" class="memo-textarea" rows="3" placeholder="フライト全体に関するメモを入力..." onchange="app.updateCrewMemo(this.value)"></textarea>`;
            crewContent.appendChild(container);
        }
        const textarea = document.getElementById('crew_memo');
        if (textarea && document.activeElement !== textarea) textarea.value = this.state.crewMemo || '';
        if (!this.state.crewMemo || this.state.crewMemo.trim() === '') container.classList.add('no-print'); else container.classList.remove('no-print');
    },

    updateCrewMemo(val) { this.state.crewMemo = val; this.saveConfig(); this.renderCrewMemo(); },

    createWP(name, alt, tmp, zwind, ctme, rtme, ztmeDisplay, ztmeMin, dist, fuel, isaDevVal = '', mwtp = '---', wscp = '---') {
        let isaDevNum = null, isaTmp = null;
        if (isaDevVal !== '' && tmp !== '---') { isaDevNum = parseInt(isaDevVal, 10); isaTmp = parseInt(tmp, 10) - isaDevNum; }
        return {
            name, plannedAlt: alt, actualAlt: '', estAltDisplay: alt, plannedTmp: tmp, actualTmp: '', estTmpDisplay: tmp,
            plannedZwind: zwind, actualZwind: '', estZwindDisplay: zwind, ctme, rtme, ztmeDisplay, ztmeMin, dist, plannedFuel: fuel,
            isaDevNum, isaTmp, mwtp, wscp, calcIsaDev: null, 
            actualTime: '', actualFuelTTL: '', actualFuelCALC: '', calcEstTimeMin: null, calcEstFuel: null, estTimeDisplay: '', estFuelDisplay: 0, timeDiff: null, fuelDiff: null,
            cumDist: 0, rdis: 0, memo: '', memoOpen: false, turbulence: '', forecast: null
        };
    },

    update(i, field, val) {
        if (field === 'actualAlt' && val !== '') { 
            let cleanVal = val.toUpperCase().replace(/^FL/, '').trim(); 
            val = /^\d{2,3}$/.test(cleanVal) ? cleanVal + "00" : cleanVal; 
        }
        
        if (field === 'actualTime' && this.sanitizeTimeInput) val = this.sanitizeTimeInput(val);
        if ((field === 'actualFuelTTL' || field === 'actualFuelCALC') && this.sanitizeFuelInput) val = this.sanitizeFuelInput(val);

        this.state.waypoints[i][field] = val; 
        if(i === 0 && field === 'actualTime') { this.state.times.tkof = val; this.renderTimes(); }
        if(this.calculate) this.calculate(); 
        this.render();
    },

    toggleMemo(i) { this.state.waypoints[i].memoOpen = !this.state.waypoints[i].memoOpen; this.saveConfig(); document.getElementById('tableBody').innerHTML = ''; this.render(); },
    
    updateMemo(i, val) { 
        this.state.waypoints[i].memo = val; this.saveConfig(); 
        const tr = document.getElementById(`memo-row-${i}`);
        if(tr) { if(val && val.trim() !== '') tr.classList.add('has-content'); else tr.classList.remove('has-content'); }
    },

    setTurb(i, val) {
        const memoEl = document.getElementById(`wp_${i}_memo`); if (memoEl) { this.state.waypoints[i].memo = memoEl.value; }
        if (this.state.waypoints[i].turbulence === val) { this.state.waypoints[i].turbulence = ''; } else { this.state.waypoints[i].turbulence = val; }
        this.saveConfig(); document.getElementById('tableBody').innerHTML = ''; this.render();
    },

    render() {
        const tbody = document.getElementById('tableBody'); if (!tbody) return;
        const isAlreadyRendered = tbody.children.length > 0 && tbody.children.length === this.state.waypoints.length * 2;

        if (!isAlreadyRendered) {
            tbody.innerHTML = '';
            this.state.waypoints.forEach((wp, i) => {
                let tClass = (wp.timeDiff !== null) ? (wp.timeDiff > 0 ? 'diff-behind' : (wp.timeDiff < 0 ? 'diff-ahead' : '')) : '';
                let fClass = (wp.fuelDiff !== null) ? (wp.fuelDiff > 0 ? 'diff-ahead' : (wp.fuelDiff < 0 ? 'diff-behind' : '')) : '';
                
                const isAlt = wp.actualAlt !== '' || wp.estAltDisplay !== wp.plannedAlt;
                const isWind = wp.actualZwind !== '' || wp.estZwindDisplay !== wp.plannedZwind;
                const isTmp = wp.actualTmp !== '' || wp.estTmpDisplay !== wp.plannedTmp;
                
                const hasMemo = wp.memo && wp.memo.trim() !== '';
                const hasTurb = wp.turbulence && wp.turbulence !== '';
                let turbBadge = hasTurb ? `<br><span class="turb-indicator turb-${wp.turbulence} no-print">〰️ ${wp.turbulence}</span><span class="turb-indicator-print" style="display:none;">[〰️${wp.turbulence}]</span>` : '';

                let currentIsaDevDisplay = '()';
                if (wp.calcIsaDev !== undefined && wp.calcIsaDev !== null) {
                    currentIsaDevDisplay = `(${wp.calcIsaDev >= 0 ? '+' : ''}${wp.calcIsaDev})`;
                }

                const timeStrikeClass = (wp.actualTime && wp.actualTime.length === 4) ? 'strikethrough-est' : '';
                let actFuelStr = app.state.fuelCalcBasis === 'TTL' ? (wp.actualFuelTTL || '') : (wp.actualFuelCALC || '');
                const fuelStrikeClass = (actFuelStr !== '') ? 'strikethrough-est' : '';

                const tr = document.createElement('tr'); tr.id = `row-${i}`;
                
                tr.innerHTML = `
                        <td class="log-td col-wp sticky-col-wp" style="padding: 2px;"><div class="wp-cell" onclick="app.toggleMemo(${i})"><strong>${wp.name}</strong>${turbBadge}${hasMemo ? '<br><span style="font-size:11px;">📝</span>' : ''}</div></td>
                        <td class="log-td col-alt">
                            <div style="display:flex; flex-direction:column; align-items:center;">
                                <input type="text" id="wp_${i}_alt" class="input-ref ${isAlt ? 'input-modified' : ''}" style="width: 100%; text-align: center;" value="${wp.estAltDisplay}" onchange="app.update(${i}, 'actualAlt', this.value)">
                                <span id="wp_${i}_alt_orig" style="font-size: 9px; color: var(--text-faint); text-decoration: line-through; line-height: 1; margin-top: 1px; ${isAlt ? '' : 'display: none;'}">${wp.plannedAlt}</span>
                            </div>
                        </td>
                        <td class="log-td col-wind"><div class="input-stacked">
                            <input type="text" id="wp_${i}_wind" class="input-ref input-wind ${isWind ? 'input-modified' : ''}" value="${wp.estZwindDisplay}" onchange="app.update(${i}, 'actualZwind', this.value)">
                            <div style="display: flex; align-items: center; justify-content: center; width: 100%;">
                                <input type="text" id="wp_${i}_tmp" class="input-ref input-tmp ${isTmp ? 'input-modified' : ''}" value="${wp.estTmpDisplay}" onchange="app.update(${i}, 'actualTmp', this.value)">
                                <span id="wp_${i}_isaDev" class="isa-dev-text">${currentIsaDevDisplay}</span>
                            </div>
                        </div></td>
                        <td class="log-td col-mwtp">
                            <div style="font-size: 13px; font-weight: normal; white-space: nowrap;">${wp.mwtp}</div>
                            <div style="font-size: 11px; color: var(--text-faint);">${wp.wscp}</div>
                        </td>
                        <td class="log-td col-ctme" style="white-space: nowrap;">${wp.ctme} / ${wp.cumDist}<br><span style="color: var(--text-faint); font-size:10px;">${wp.rtme} / ${wp.rdis}</span></td>
                        <td class="log-td col-ztme" style="white-space: nowrap;">${wp.ztmeDisplay}<br><span style="color: var(--text-faint); font-size:10px;">(${wp.dist})</span></td>
                        <td class="log-td col-main ${timeStrikeClass}" style="font-size:15px; font-weight:bold;" id="wp_${i}_estTime">${wp.estTimeDisplay}</td>
                        <td class="log-td col-main" id="wp_${i}_estFuel_td"><div class="fuel-primary ${fuelStrikeClass}" id="wp_${i}_estFuel">${wp.estFuelDisplay !== null ? wp.estFuelDisplay.toFixed(1) : '--'}</div><div class="fuel-secondary">(${wp.plannedFuel.toFixed(1)})</div></td>
                        <td class="log-td col-actual no-print col-main"><input type="text" id="wp_${i}_actTime" class="input-actual" maxlength="4" value="${wp.actualTime || ''}" ${(i === 0) ? 'readonly' : `readonly onclick="app.showNumpad(this, 'ACT TIME', 'time')"`} onchange="app.update(${i}, 'actualTime', this.value)"></td>
                        <td class="log-td col-actual no-print col-main">
                        <div style="display:flex; flex-direction:column; gap:2px; align-items:center;">
                            <input type="text" id="wp_${i}_actFuelTTL" class="input-actual-half" placeholder="TTL" value="${wp.actualFuelTTL || ''}" readonly onclick="app.showNumpad(this, 'TTL FUEL', 'fuel')" onchange="app.update(${i}, 'actualFuelCALC', this.value)">
                            <input type="text" id="wp_${i}_actFuelCALC" class="input-actual-half" placeholder="CALC" value="${wp.actualFuelCALC || ''}" readonly onclick="app.showNumpad(this, 'CALC FUEL', 'fuel')" onchange="app.update(${i}, 'actualFuelCALC', this.value)">
                        </div>
                    </td>
                    <td class="log-td col-diff ${tClass}" id="wp_${i}_timeDiff">${wp.timeDiff !== null ? (wp.timeDiff > 0 ? '+'+wp.timeDiff : wp.timeDiff) : ''}</td>
                    <td class="log-td col-diff ${fClass}" id="wp_${i}_fuelDiff">${wp.fuelDiff !== null ? (wp.fuelDiff > 0 ? '+'+wp.fuelDiff.toFixed(1) : wp.fuelDiff.toFixed(1)) : ''}</td>
                `;
                tbody.appendChild(tr);

                const memoTr = document.createElement('tr');
                memoTr.id = `memo-row-${i}`;
                memoTr.style.display = wp.memoOpen ? 'table-row' : 'none';
                memoTr.className = hasMemo ? 'memo-row has-content' : 'memo-row';
                
                const turbOptions = ['S', 'LM', 'L', 'LP', 'M'];
                const turbButtonsHtml = turbOptions.map(t => `<button class="turb-btn turb-btn-${t} ${wp.turbulence === t ? 'active' : ''}" onclick="app.setTurb(${i}, '${t}')">${t}</button>`).join('');

                let fcstHtml = '';
                if (wp.forecast && Object.keys(wp.forecast).length > 0) {
                    fcstHtml = '<div class="forecast-container no-print">';
                    const sortedAlts = Object.keys(wp.forecast).sort((a, b) => parseInt(a) - parseInt(b));
                    
                    const currentAltStr = wp.estAltDisplay;
                    const closestAlt = (this.getClosestAlt) ? this.getClosestAlt(wp.forecast, currentAltStr) : sortedAlts[0];

                    sortedAlts.forEach(alt => {
                        const flStr = 'FL' + String(parseInt(alt) / 100).padStart(3, '0');
                        const displayVal = (this.formatWindTemp) ? this.formatWindTemp(wp.forecast[alt]) : wp.forecast[alt];
                        const isCurrent = (alt === closestAlt);

                        fcstHtml += `
                            <div class="wind-entry ${isCurrent ? 'highlight-alt' : ''}">
                                <div class="wind-badge">${flStr}</div>
                                <div class="wind-data">${displayVal}</div>
                            </div>`;
                    });
                    fcstHtml += '</div>';
                } else {
                    fcstHtml = '<div class="no-print" style="font-size: 10px; color: var(--text-faint); margin-bottom: 8px; font-style: italic;">(No forecast data available for this point)</div>';
                }

                memoTr.innerHTML = `
                    <td colspan="12" style="padding: 8px; background-color: var(--memo-bg);">
                        ${fcstHtml}
                        <div class="no-print" style="display: flex; gap: 5px; align-items: center; margin-bottom: 8px;">
                            <span style="font-size: 11px; font-weight: bold; color: var(--text-muted); margin-right: 5px;">〰️ TURB</span>
                            ${turbButtonsHtml}
                        </div>
                        <textarea id="wp_${i}_memo" class="memo-textarea" rows="2" placeholder="${wp.name} に関するメモを入力..." onchange="app.updateMemo(${i}, this.value)">${wp.memo || ''}</textarea>
                    </td>
                `;
                tbody.appendChild(memoTr);
            });
        } else {
            this.state.waypoints.forEach((wp, i) => {
                const altEl = document.getElementById(`wp_${i}_alt`);
                if (altEl && document.activeElement !== altEl) { 
                    altEl.value = wp.estAltDisplay; 
                    if (wp.actualAlt !== '' || wp.estAltDisplay !== wp.plannedAlt) {
                        altEl.classList.add('input-modified'); 
                    } else {
                        altEl.classList.remove('input-modified');
                    }
                }
                const altOrigEl = document.getElementById(`wp_${i}_alt_orig`);
                if (altOrigEl) {
                    if (wp.actualAlt !== '' || wp.estAltDisplay !== wp.plannedAlt) {
                        altOrigEl.style.display = 'block';
                    } else {
                        altOrigEl.style.display = 'none';
                    }
                }
                
                const windEl = document.getElementById(`wp_${i}_wind`);
                if (windEl && document.activeElement !== windEl) { 
                    windEl.value = wp.estZwindDisplay; 
                    if (wp.actualZwind !== '' || wp.estZwindDisplay !== wp.plannedZwind) {
                        windEl.classList.add('input-modified'); 
                    } else {
                        windEl.classList.remove('input-modified');
                    }
                }
                
                const tmpEl = document.getElementById(`wp_${i}_tmp`);
                if (tmpEl && document.activeElement !== tmpEl) { 
                    tmpEl.value = wp.estTmpDisplay; 
                    if (wp.actualTmp !== '' || wp.estTmpDisplay !== wp.plannedTmp) {
                        tmpEl.classList.add('input-modified'); 
                    } else {
                        tmpEl.classList.remove('input-modified');
                    }
                }

                const isaDevEl = document.getElementById(`wp_${i}_isaDev`);
                if (isaDevEl) {
                    let currentIsaDevDisplay = '()';
                    if (wp.calcIsaDev !== undefined && wp.calcIsaDev !== null) {
                        currentIsaDevDisplay = `(${wp.calcIsaDev >= 0 ? '+' : ''}${wp.calcIsaDev})`;
                    }
                    isaDevEl.textContent = currentIsaDevDisplay;
                }

                const estTimeEl = document.getElementById(`wp_${i}_estTime`);
                if (estTimeEl) { estTimeEl.textContent = wp.estTimeDisplay; if (wp.actualTime && wp.actualTime.length === 4) estTimeEl.classList.add('strikethrough-est'); else estTimeEl.classList.remove('strikethrough-est'); }
                const estFuelEl = document.getElementById(`wp_${i}_estFuel`);
                if (estFuelEl) {
                    estFuelEl.textContent = wp.estFuelDisplay !== null ? wp.estFuelDisplay.toFixed(1) : '--';
                    let actFuelStr = app.state.fuelCalcBasis === 'TTL' ? (wp.actualFuelTTL || '') : (wp.actualFuelCALC || '');
                    if (actFuelStr !== '') estFuelEl.classList.add('strikethrough-est'); else estFuelEl.classList.remove('strikethrough-est');
                }

                const actTimeEl = document.getElementById(`wp_${i}_actTime`); if (actTimeEl && document.activeElement !== actTimeEl) actTimeEl.value = wp.actualTime || '';
                const actFuelTTLEl = document.getElementById(`wp_${i}_actFuelTTL`); if (actFuelTTLEl && document.activeElement !== actFuelTTLEl) actFuelTTLEl.value = wp.actualFuelTTL || '';
                const actFuelCALCEl = document.getElementById(`wp_${i}_actFuelCALC`); if (actFuelCALCEl && document.activeElement !== actFuelCALCEl) actFuelCALCEl.value = wp.actualFuelCALC || '';

                const timeDiffEl = document.getElementById(`wp_${i}_timeDiff`);
                if (timeDiffEl) { timeDiffEl.textContent = wp.timeDiff !== null ? (wp.timeDiff > 0 ? '+'+wp.timeDiff : wp.timeDiff) : ''; timeDiffEl.className = `log-td col-diff ${(wp.timeDiff !== null) ? (wp.timeDiff > 0 ? 'diff-behind' : (wp.timeDiff < 0 ? 'diff-ahead' : '')) : ''}`; }
                const fuelDiffEl = document.getElementById(`wp_${i}_fuelDiff`);
                if (fuelDiffEl) { fuelDiffEl.textContent = wp.fuelDiff !== null ? (wp.fuelDiff > 0 ? '+'+wp.fuelDiff.toFixed(1) : wp.fuelDiff.toFixed(1)) : ''; fuelDiffEl.className = `log-td col-diff ${(wp.fuelDiff !== null) ? (wp.fuelDiff > 0 ? 'diff-ahead' : (wp.fuelDiff < 0 ? 'diff-behind' : '')) : ''}`; }
            });
        }
        
        if(this.renderStatusBar) this.renderStatusBar();
        document.getElementById('tableContainer').style.display = 'block';
    },

    resetData() {
        if (!confirm("フライトデータをリセットして初期画面に戻りますか？\n（※Crew情報を引き継ぎたい場合は、初期画面の履歴から選択してください）")) return;
        const oldHistory = JSON.parse(JSON.stringify(this.state.flightHistory));
        this.state = { 
            waypoints: [], altns: [{name:'', fuel:0, rsv:0}], alertThreshold: 0, destFuelThreshold: 0, headerInfo: "", flightMeta: null, fuelCalcBasis: 'CALC',
            crew: [{ id: 1, duty: 'PIC', empNo: '', name: '', rank: 'CAP' }, { id: 2, duty: 'COP', empNo: '', name: '', rank: 'COP' }],
            crewMemo: '', takeoffPilotId: null, landingPilotId: null, crewPanelOpen: true,
            times: { bo: '', bi: '', tkof: '', ldg: '' }, actFob: '', actFod: '', postFlightLog: null, activeInput: null, flightHistory: oldHistory, rawForecastText: "",
            activeNumpadTarget: null, activeNumpadType: 'time'
        };
        document.getElementById('flightHeader').style.display = 'none'; document.getElementById('headerInfoCard').style.display = 'none';
        if (document.getElementById('forecastInfoCard')) document.getElementById('forecastInfoCard').style.display = 'none';
        document.getElementById('crewInfoCard').style.display = 'none'; document.getElementById('tableContainer').style.display = 'none';
        document.getElementById('statusBar').style.display = 'none'; document.getElementById('bottomControls').style.display = 'none';
        document.getElementById('settingsPanel').style.display = 'none'; document.getElementById('defaultTitle').style.display = 'block';
        document.getElementById('inputArea').style.display = 'block';
        
        document.body.style.overflow = '';

        this.saveConfig(); this.renderSettings(); this.renderTimes(); 
        if(this.renderActualFuel) this.renderActualFuel(); 
        if(this.renderFlightHistory) this.renderFlightHistory(); 
        if (this.renderPostFlightLog) this.renderPostFlightLog();
    },

    showNumpad(el, title, type) {
        if (this.state.activeNumpadTarget) {
            this.state.activeNumpadTarget.classList.remove('numpad-active');
        }
        
        this.state.activeNumpadTarget = el;
        this.state.activeNumpadType = type;
        el.classList.add('numpad-active');
        
        document.getElementById('numpadOverlay').style.display = 'block';
        const pad = document.getElementById('numpadContainer');
        pad.style.visibility = 'hidden';
        pad.style.display = 'grid';
        
        const rect = el.getBoundingClientRect();
        const padWidth = pad.offsetWidth || 220; 
        const padHeight = pad.offsetHeight || 220;
        
        let top = rect.bottom + window.scrollY + 5; 
        let left = rect.left + window.scrollX;
        
        if (left + padWidth > window.innerWidth + window.scrollX) {
            left = window.innerWidth + window.scrollX - padWidth - 5;
        }
        
        if (rect.bottom + padHeight + 10 > window.innerHeight) {
            top = rect.top + window.scrollY - padHeight - 5;
            if (top < window.scrollY) {
                top = rect.bottom + window.scrollY + 5;
                window.scrollBy({ top: (rect.bottom + padHeight + 15) - window.innerHeight, behavior: 'smooth' });
            }
        }
        
        pad.style.position = 'absolute';
        pad.style.top = top + 'px';
        pad.style.left = left + 'px';
        pad.style.transform = 'none'; 
        pad.style.visibility = 'visible';
        
        el.blur(); 
    },

    closeNumpad() {
        document.getElementById('numpadOverlay').style.display = 'none';
        document.getElementById('numpadContainer').style.display = 'none';
        if (this.state.activeNumpadTarget) {
            this.state.activeNumpadTarget.classList.remove('numpad-active');
            this.state.activeNumpadTarget.dispatchEvent(new Event('change'));
        }
        this.state.activeNumpadTarget = null;
    },

    numpadInput(val) {
        const el = this.state.activeNumpadTarget;
        if (!el) return;
        if (val === 'DEL') { el.value = el.value.slice(0, -1); } else { el.value += val; }
        
        if (this.sanitizeTimeInput && this.state.activeNumpadType === 'time') {
            el.value = this.sanitizeTimeInput(el.value);
        } else if (this.sanitizeFuelInput && this.state.activeNumpadType === 'fuel') {
            el.value = this.sanitizeFuelInput(el.value);
        }
    }
};

window.onload = () => app.init();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Offline SW registered:', reg.scope))
            .catch(err => console.log('SW registration failed:', err));
    });
}