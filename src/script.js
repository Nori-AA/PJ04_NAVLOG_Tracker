if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW failed:', err));
    });
}

// Enter（完了）キー押下時にキーボードを即座に引っ込める機能
// ※テキストエリア（メモ欄）は改行できるように除外しました。
window.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' || event.keyCode === 13) {
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT')) {
            document.activeElement.blur();
        }
    }
});

const app = {
    version: 'v25.9.7', // ★ バージョン・復旧更新
    state: { 
        waypoints: [], altns: [{name:'', fuel:0, rsv:0}], alertThreshold: 0, destFuelThreshold: 0, headerInfo: "", flightMeta: null, fuelCalcBasis: 'CALC',
        crew: [{ id: 1, duty: 'PIC', empNo: '42482', name: 'NORIYUKI ARAI', rank: 'CAP' }, { id: 2, duty: 'COP', empNo: '', name: '', rank: 'COP' }],
        crewMemo: '', 
        takeoffPilotId: null, landingPilotId: null, crewPanelOpen: true,
        times: { bo: '', bi: '', tkof: '', ldg: '' },
        actFob: '', actFod: '',
        postFlightLog: null,
        activeInput: null 
    },

    init() {
        const titleEl = document.getElementById('defaultTitle');
        if (titleEl) {
            titleEl.textContent = `✈️ NAVLOG Tracker ${this.version}`;
        }

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
            if (!this.state.crew || this.state.crew.length === 0) {
                this.state.crew = [{ id: 1, duty: 'PIC', empNo: '42482', name: 'NORIYUKI ARAI', rank: 'CAP' }, { id: 2, duty: 'COP', empNo: '', name: '', rank: 'COP' }];
            }

            this.state.waypoints.forEach(wp => {
                if (wp.actualFuel !== undefined) { wp.actualFuelCALC = wp.actualFuel; wp.actualFuelTTL = ''; delete wp.actualFuel; }
                if (wp.isaDevNum === undefined) wp.isaDevNum = null;
                if (wp.isaTmp === undefined) wp.isaTmp = null;
                if (wp.mwtp === undefined) wp.mwtp = '---';
                if (wp.wscp === undefined) wp.wscp = '---';
            });
        }
        
        if (!this.state.postFlightLog) {
            this.state.postFlightLog = {
                domInt: 'DOM', activeDuty: 'PIC',
                day: '', type: 'B767', reg: '', dep: '', arr: '', fltNumber: '',
                depTime: '', arrTime: '', tkof: '', ldg: '', fltTime: '',
                picTime: '', sicTime: '', ngtPicSic: '', copTime: '', ngtCop: '', imc: '', apchType: ''
            };
        }

        this.renderSettings();
        if (this.state.headerInfo) {
            document.getElementById('headerInfoCard').style.display = 'block';
            document.getElementById('headerInfoContent').textContent = this.state.headerInfo;
        }
        if (this.state.flightMeta) this.renderFlightMeta();
        if (this.state.waypoints.length > 0) {
            document.getElementById('statusBar').style.display = 'flex';
            document.getElementById('bottomControls').style.display = 'block';
            document.getElementById('inputArea').style.display = 'none';
            document.getElementById('crewInfoCard').style.display = 'block';
            
            if(this.updateCrewPanelUI) this.updateCrewPanelUI();
            if(this.renderCrew) this.renderCrew();
            
            this.renderTimes();
            this.renderActualFuel();
            
            if(this.renderPostFlightLog) this.renderPostFlightLog();
            
            this.renderCrewMemo();
            
            document.getElementById('tableBody').innerHTML = ''; 
            this.render();
        }
        
        this.setupFocusScrollBehavior();
        this.updateThemeButton();
        window.addEventListener('resize', this.updateStickyHeight);

        if (!document.getElementById('app-version-display')) {
            const vDiv = document.createElement('div');
            vDiv.id = 'app-version-display';
            vDiv.className = 'no-print';
            vDiv.style.cssText = 'position: fixed; bottom: 5px; right: 10px; font-size: 10px; color: var(--text-faint); z-index: 9999; pointer-events: none; opacity: 0.5; font-family: "SF Mono", monospace;';
            vDiv.textContent = this.version;
            document.body.appendChild(vDiv);
        }
    },

    setupFocusScrollBehavior() {
        document.addEventListener('focusin', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                app.state.activeInput = e.target;
                setTimeout(() => app.adjustScrollForInput(e.target), 300);
            }
        });

        document.addEventListener('focusout', () => {
            app.state.activeInput = null;
        });

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => {
                if (app.state.activeInput) {
                    setTimeout(() => app.adjustScrollForInput(app.state.activeInput), 100);
                }
            });
        }
    },

    adjustScrollForInput(el) {
        if (!el) return;
        const sb = document.getElementById('statusBar');
        const th = document.querySelector('.table-container th');
        const sbHeight = (sb && sb.style.display !== 'none') ? sb.offsetHeight : 0;
        const thHeight = th ? th.offsetHeight : 0;
        const headerOffset = sbHeight + thHeight + 20; 
        
        const rect = el.getBoundingClientRect();
        const visualViewport = window.visualViewport;
        
        if (rect.top < headerOffset) {
            window.scrollBy({ top: rect.top - headerOffset, behavior: 'smooth' });
        } else if (visualViewport && rect.bottom > visualViewport.height) {
            window.scrollBy({ top: rect.bottom - visualViewport.height + 10, behavior: 'smooth' });
        }
    },

    toggleTheme() {
        const isDark = document.documentElement.classList.toggle('theme-dark');
        localStorage.setItem('navlog_theme', isDark ? 'dark' : 'light');
        this.updateThemeButton();
    },
    
    updateThemeButton() {
        const btn = document.getElementById('themeToggleBtn');
        if(btn) {
            const isDark = document.documentElement.classList.contains('theme-dark');
            btn.innerHTML = isDark ? '☀️ DAY' : '🌙 NGT';
        }
    },

    updateStickyHeight() {
        const sb = document.getElementById('statusBar');
        if (sb && sb.style.display !== 'none') {
            document.documentElement.style.setProperty('--sb-height', sb.offsetHeight + 'px');
        }
    },

    scrollToRow(index) {
        const row = document.getElementById(`row-${index}`);
        if (row) {
            const sbHeight = document.getElementById('statusBar').offsetHeight || 85;
            const thHeight = document.querySelector('.table-container th').offsetHeight || 30;
            const offset = sbHeight + thHeight + 15; 
            const y = row.getBoundingClientRect().top + window.scrollY - offset;
            window.scrollTo({ top: y, behavior: 'smooth' });
        }
    },

    toggleSettings() { const p = document.getElementById('settingsPanel'); p.style.display = p.style.display === 'none' ? 'block' : 'none'; },

    renderSettings() {
        const container = document.getElementById('altnSettingsContainer'); container.innerHTML = '';
        document.getElementById('alertThreshold').value = this.state.alertThreshold || 0;
        
        const destThEl = document.getElementById('destFuelThreshold');
        if (destThEl) destThEl.value = this.state.destFuelThreshold || 0;

        const basisEl = document.getElementById('fuelCalcBasis'); if(basisEl) basisEl.value = this.state.fuelCalcBasis || 'CALC';

        this.state.altns.forEach((altn, idx) => {
            const div = document.createElement('div'); div.className = 'input-group';
            div.innerHTML = `
                <label style="font-size: 10px;">ALTN ${idx + 1} (AP / Fuel / RSV)</label>
                <div style="display: flex; gap: 5px;">
                    <input type="text" id="altnName_${idx}" style="width: 55px; text-transform: uppercase;" placeholder="AP" value="${altn.name}" onchange="app.saveAltnConfig()">
                    <input type="number" id="altnFuel_${idx}" step="0.1" style="width: 65px;" placeholder="ALTN" value="${altn.fuel || ''}" onchange="app.saveAltnConfig()">
                    <input type="number" id="altnRsv_${idx}" step="0.1" style="width: 65px;" placeholder="RSV" value="${altn.rsv || ''}" onchange="app.saveAltnConfig()">
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
    changeFuelBasis() { this.state.fuelCalcBasis = document.getElementById('fuelCalcBasis').value; this.saveConfig(); this.calculate(); this.render(); },
    
    saveConfig() {
        this.state.alertThreshold = parseFloat(document.getElementById('alertThreshold').value) || 0;
        this.state.destFuelThreshold = parseFloat(document.getElementById('destFuelThreshold').value) || 0;
        try { localStorage.setItem('navlog_v25_data', JSON.stringify(this.state)); } catch(e){}
        this.renderStatusBar(); 
    },

    updateTime(field, val) {
        this.state.times[field] = val;
        if ((field === 'bo' || field === 'bi') && this.calcPflTimes) {
            this.calcPflTimes();
        }
        
        if (field === 'tkof' && this.state.waypoints.length > 0) {
            this.state.waypoints[0].actualTime = val;
            this.calculate();
            this.render();
        } else {
            this.saveConfig();
        }
    },
    renderTimes() {
        ['bo', 'bi', 'tkof', 'ldg'].forEach(f => {
            const el = document.getElementById('time_' + f);
            if (el) el.value = this.state.times[f] || '';
        });
    },

    updateActualFuel(field, val) {
        if (field === 'fob') this.state.actFob = val;
        if (field === 'fod') this.state.actFod = val;
        this.saveConfig();
    },
    renderActualFuel() {
        const fobEl = document.getElementById('actFob');
        if (fobEl) fobEl.value = this.state.actFob || '';
        const fodEl = document.getElementById('actFod');
        if (fodEl) fodEl.value = this.state.actFod || '';
    },

    renderFlightMeta() {
        document.getElementById('defaultTitle').style.display = 'none';
        const header = document.getElementById('flightHeader');
        header.style.display = 'block';
        
        document.getElementById('fh-flt').textContent = this.state.flightMeta.flt;
        document.getElementById('fh-date').textContent = this.state.flightMeta.date;
        document.getElementById('fh-reg').textContent = this.state.flightMeta.reg;
        document.getElementById('fh-route').textContent = `${this.state.flightMeta.dep} ➔ ${this.state.flightMeta.dest}`;
        document.getElementById('fh-altn').textContent = this.state.flightMeta.altn;
        document.getElementById('fh-time').textContent = this.state.flightMeta.time;
        document.getElementById('fh-bt').textContent = this.state.flightMeta.bt || "---";
        document.getElementById('fh-ft').textContent = this.state.flightMeta.ft || "---";
        document.getElementById('fh-dist').textContent = (this.state.flightMeta.dist !== "---" ? this.state.flightMeta.dist + " NM" : "---");

        const titleBar = header.querySelector('.fh-title');
        if (titleBar && !titleBar.dataset.versionSet) {
            titleBar.style.display = 'flex';
            titleBar.style.justifyContent = 'space-between';
            titleBar.style.alignItems = 'flex-end';
            titleBar.innerHTML = `
                <span>✈️ FLIGHT STATUS DASHBOARD</span>
                <span style="font-size: 9px; font-weight: normal; opacity: 0.6; font-family: 'SF Mono', monospace;">
                    NAVLOG Tracker ${this.version}
                </span>
            `;
            titleBar.dataset.versionSet = 'true';
        }
    },

    toggleHeader() {
        const c = document.getElementById('headerInfoContent'), icon = document.getElementById('drm-toggle-icon');
        if (c.style.display === 'none') { c.style.display = 'block'; icon.textContent = '▼'; } else { c.style.display = 'none'; icon.textContent = '▶'; }
    },

    renderCrewMemo() {
        const crewContent = document.getElementById('crewContentEl');
        if (!crewContent) return;
        
        let container = document.getElementById('crew_memo_container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'crew_memo_container';
            container.style.cssText = 'margin-top: 15px; border-top: 1px dashed var(--border-color); padding-top: 15px; padding-left: 15px; padding-right: 15px;';
            container.innerHTML = `
                <div style="font-size: 11px; font-weight: bold; color: var(--text-muted); margin-bottom: 5px;">📝 FLIGHT MEMO</div>
                <textarea id="crew_memo" class="memo-textarea" rows="3" placeholder="フライト全体に関するメモを入力..." onchange="app.updateCrewMemo(this.value)"></textarea>
            `;
            crewContent.appendChild(container);
        }
        
        const textarea = document.getElementById('crew_memo');
        if (textarea && document.activeElement !== textarea) {
            textarea.value = this.state.crewMemo || '';
        }
        
        if (!this.state.crewMemo || this.state.crewMemo.trim() === '') {
            container.classList.add('no-print');
        } else {
            container.classList.remove('no-print');
        }
    },

    updateCrewMemo(val) {
        this.state.crewMemo = val;
        this.saveConfig();
        
        const container = document.getElementById('crew_memo_container');
        if (container) {
            if (val && val.trim() !== '') {
                container.classList.remove('no-print');
            } else {
                container.classList.add('no-print');
            }
        }
    },

    createWP(name, alt, tmp, zwind, ctme, rtme, ztmeDisplay, ztmeMin, dist, fuel, isaDevVal = '', mwtp = '---', wscp = '---') {
        let isaDevNum = null, isaTmp = null;
        if (isaDevVal !== '' && tmp !== '---') {
            isaDevNum = parseInt(isaDevVal, 10);
            isaTmp = parseInt(tmp, 10) - isaDevNum; 
        }
        return {
            name, plannedAlt: alt, actualAlt: '', estAltDisplay: alt, plannedTmp: tmp, actualTmp: '', estTmpDisplay: tmp,
            plannedZwind: zwind, actualZwind: '', estZwindDisplay: zwind, ctme, rtme, ztmeDisplay, ztmeMin, dist, plannedFuel: fuel,
            isaDevNum, isaTmp, mwtp, wscp,
            actualTime: '', actualFuelTTL: '', actualFuelCALC: '', calcEstTimeMin: null, calcEstFuel: null, estTimeDisplay: '', estFuelDisplay: 0, timeDiff: null, fuelDiff: null,
            cumDist: 0, rdis: 0, memo: '', memoOpen: false
        };
    },

    parseLegTime(str) { if (!str || str === "---") return 0; const p = str.split('.'), h = parseInt(p[0], 10) || 0, m = parseInt(p[1], 10) || 0; return (h * 60) + m; },
    formatLegTime(m) { return String(Math.floor(m / 60)).padStart(2, '0') + '.' + String(m % 60).padStart(2, '0'); },
    toMin(s) { return parseInt(s.slice(0,2), 10)*60 + parseInt(s.slice(2,4), 10); },
    toHHMM(m) { let tm = Math.round(m); return String(Math.floor(tm/60)%24).padStart(2,'0') + String(tm%60).padStart(2,'0'); },
    diffMin(act, est) { let d = act - est; while(d > 720) d -= 1440; while(d < -720) d += 1440; return d; },

    update(i, field, val) {
        if (field === 'actualAlt' && val !== '') { let cleanVal = val.toUpperCase().replace(/^FL/, '').trim(); val = /^\d{2,3}$/.test(cleanVal) ? cleanVal + "00" : cleanVal; }
        this.state.waypoints[i][field] = val; 
        
        if(i === 0 && field === 'actualTime') {
            this.state.times.tkof = val;
            this.renderTimes();
        }
        
        this.calculate(); 
        this.render();
    },

    calculate() {
        let pTimeMin = null, pFuel = null, cAlt = null, oAlt = null;
        this.state.waypoints.forEach((wp, i) => {
            if (wp.actualAlt !== '') { wp.estAltDisplay = wp.actualAlt; cAlt = wp.actualAlt; oAlt = wp.plannedAlt; }
            else { if (cAlt !== null && wp.plannedAlt === oAlt) wp.estAltDisplay = cAlt; else { cAlt = null; oAlt = null; wp.estAltDisplay = wp.plannedAlt; } }
            wp.estZwindDisplay = wp.actualZwind !== '' ? wp.actualZwind : wp.plannedZwind;
            wp.estTmpDisplay = wp.actualTmp !== '' ? wp.actualTmp : wp.plannedTmp;
            
            let actFuelStr = this.state.fuelCalcBasis === 'TTL' ? (wp.actualFuelTTL || '') : (wp.actualFuelCALC || '');
            let actTimeStr = wp.actualTime || '';

            if (i === 0) { 
                wp.calcEstTimeMin = (actTimeStr && actTimeStr.length === 4) ? this.toMin(actTimeStr) : null; 
                wp.calcEstFuel = wp.plannedFuel; 
            } else {
                wp.calcEstTimeMin = pTimeMin !== null ? (pTimeMin + wp.ztmeMin) % 1440 : null;
                wp.calcEstFuel = pFuel !== null ? Math.max(0, pFuel - (this.state.waypoints[i-1].plannedFuel - wp.plannedFuel)) : wp.plannedFuel;
            }
            wp.estTimeDisplay = wp.calcEstTimeMin !== null ? this.toHHMM(wp.calcEstTimeMin) : '--';
            wp.estFuelDisplay = wp.calcEstFuel;
            
            wp.timeDiff = (actTimeStr && actTimeStr.length === 4 && wp.calcEstTimeMin !== null) ? this.diffMin(this.toMin(actTimeStr), wp.calcEstTimeMin) : null;
            wp.fuelDiff = (actFuelStr !== '') ? parseFloat(actFuelStr) - wp.plannedFuel : null;
            
            pTimeMin = (actTimeStr && actTimeStr.length === 4) ? this.toMin(actTimeStr) : wp.calcEstTimeMin;
            pFuel = actFuelStr !== '' ? parseFloat(actFuelStr) : wp.calcEstFuel;
        });
        this.saveConfig();
    },

    toggleMemo(i) { this.state.waypoints[i].memoOpen = !this.state.waypoints[i].memoOpen; this.saveConfig(); document.getElementById('tableBody').innerHTML = ''; this.render(); },
    
    updateMemo(i, val) { 
        this.state.waypoints[i].memo = val; 
        this.saveConfig(); 
        const tr = document.getElementById(`memo-row-${i}`);
        if(tr) {
            if(val && val.trim() !== '') tr.classList.add('has-content');
            else tr.classList.remove('has-content');
        }
    },

    render() {
        const tbody = document.getElementById('tableBody');
        if (!tbody) return;
        
        const isAlreadyRendered = tbody.children.length > 0 && tbody.children.length === this.state.waypoints.length * 2;

        if (!isAlreadyRendered) {
            tbody.innerHTML = '';
            this.state.waypoints.forEach((wp, i) => {
                let tClass = (wp.timeDiff !== null) ? (wp.timeDiff > 0 ? 'diff-behind' : (wp.timeDiff < 0 ? 'diff-ahead' : '')) : '';
                let fClass = (wp.fuelDiff !== null) ? (wp.fuelDiff > 0 ? 'diff-ahead' : (wp.fuelDiff < 0 ? 'diff-behind' : '')) : '';
                const isAlt = wp.actualAlt !== '' || wp.estAltDisplay !== wp.plannedAlt, isWind = wp.actualZwind !== '', isTmp = wp.actualTmp !== '';
                const hasMemo = wp.memo && wp.memo.trim() !== '';

                let currentIsaDevDisplay = '()';
                if (wp.isaTmp !== null) {
                    let currentTmp = parseInt(wp.estTmpDisplay, 10);
                    if (!isNaN(currentTmp)) {
                        let currentIsaDevNum = currentTmp - wp.isaTmp;
                        currentIsaDevDisplay = `(${currentIsaDevNum >= 0 ? ' ' : ''}${currentIsaDevNum})`;
                    }
                }

                const isFirstRow = (i === 0);
                const actTimeReadonly = isFirstRow ? 'readonly' : '';

                const tr = document.createElement('tr');
                tr.id = `row-${i}`;
                tr.innerHTML = `
                    <td class="log-td col-wp sticky-col-wp" style="padding: 2px;"><div class="wp-cell" onclick="app.toggleMemo(${i})"><strong>${wp.name}</strong>${hasMemo ? '<br><span style="font-size:11px;">📝</span>' : ''}</div></td>
                    <td class="log-td col-alt"><input type="text" id="wp_${i}_alt" class="input-ref ${isAlt ? 'input-modified' : ''}" value="${wp.estAltDisplay}" onchange="app.update(${i}, 'actualAlt', this.value)"></td>
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
                    <td class="log-td col-main" style="font-size:15px; font-weight:bold;" id="wp_${i}_estTime">${wp.estTimeDisplay}</td>
                    <td class="log-td col-main"><div class="fuel-primary" id="wp_${i}_estFuel">${wp.estFuelDisplay !== null ? wp.estFuelDisplay.toFixed(1) : '--'}</div><div class="fuel-secondary">(${wp.plannedFuel.toFixed(1)})</div></td>
                    <td class="log-td col-actual no-print col-main"><input type="text" id="wp_${i}_actTime" class="input-actual" inputmode="numeric" maxlength="4" value="${wp.actualTime || ''}" ${actTimeReadonly} onchange="app.update(${i}, 'actualTime', this.value)"></td>
                    <td class="log-td col-actual no-print col-main">
                        <div style="display:flex; flex-direction:column; gap:2px; align-items:center;">
                            <input type="number" id="wp_${i}_actFuelTTL" class="input-actual-half" inputmode="decimal" step="0.1" placeholder="TTL" value="${wp.actualFuelTTL || ''}" onchange="app.update(${i}, 'actualFuelCALC', this.value)">
                            <input type="number" id="wp_${i}_actFuelCALC" class="input-actual-half" inputmode="decimal" step="0.1" placeholder="CALC" value="${wp.actualFuelCALC || ''}" onchange="app.update(${i}, 'actualFuelCALC', this.value)">
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
                memoTr.innerHTML = `
                    <td colspan="12" style="padding: 6px; background-color: var(--memo-bg);">
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
                    if (wp.actualAlt !== '' || wp.estAltDisplay !== wp.plannedAlt) altEl.classList.add('input-modified'); else altEl.classList.remove('input-modified');
                }

                const windEl = document.getElementById(`wp_${i}_wind`);
                if (windEl && document.activeElement !== windEl) {
                    windEl.value = wp.estZwindDisplay;
                    if (wp.actualZwind !== '') windEl.classList.add('input-modified'); else windEl.classList.remove('input-modified');
                }

                const tmpEl = document.getElementById(`wp_${i}_tmp`);
                if (tmpEl && document.activeElement !== tmpEl) {
                    tmpEl.value = wp.estTmpDisplay;
                    if (wp.actualTmp !== '') tmpEl.classList.add('input-modified'); else tmpEl.classList.remove('input-modified');
                }

                const isaDevEl = document.getElementById(`wp_${i}_isaDev`);
                if (isaDevEl) {
                    let currentIsaDevDisplay = '()';
                    if (wp.isaTmp !== null) {
                        let currentTmp = parseInt(wp.estTmpDisplay, 10);
                        if (!isNaN(currentTmp)) {
                            let currentIsaDevNum = currentTmp - wp.isaTmp;
                            currentIsaDevDisplay = `(${currentIsaDevNum >= 0 ? ' ' : ''}${currentIsaDevNum})`;
                        }
                    }
                    isaDevEl.textContent = currentIsaDevDisplay;
                }

                const estTimeEl = document.getElementById(`wp_${i}_estTime`);
                if (estTimeEl) estTimeEl.textContent = wp.estTimeDisplay;

                const estFuelEl = document.getElementById(`wp_${i}_estFuel`);
                if (estFuelEl) estFuelEl.textContent = wp.estFuelDisplay !== null ? wp.estFuelDisplay.toFixed(1) : '--';

                const actTimeEl = document.getElementById(`wp_${i}_actTime`);
                if (actTimeEl && document.activeElement !== actTimeEl) actTimeEl.value = wp.actualTime || '';

                const actFuelTTLEl = document.getElementById(`wp_${i}_actFuelTTL`);
                if (actFuelTTLEl && document.activeElement !== actFuelTTLEl) actFuelTTLEl.value = wp.actualFuelTTL || '';

                const actFuelCALCEl = document.getElementById(`wp_${i}_actFuelCALC`);
                if (actFuelCALCEl && document.activeElement !== actFuelCALCEl) actFuelCALCEl.value = wp.actualFuelCALC || '';

                const timeDiffEl = document.getElementById(`wp_${i}_timeDiff`);
                if (timeDiffEl) {
                    timeDiffEl.textContent = wp.timeDiff !== null ? (wp.timeDiff > 0 ? '+'+wp.timeDiff : wp.timeDiff) : '';
                    let tClass = (wp.timeDiff !== null) ? (wp.timeDiff > 0 ? 'diff-behind' : (wp.timeDiff < 0 ? 'diff-ahead' : '')) : '';
                    timeDiffEl.className = `log-td col-diff ${tClass}`;
                }

                const fuelDiffEl = document.getElementById(`wp_${i}_fuelDiff`);
                if (fuelDiffEl) {
                    fuelDiffEl.textContent = wp.fuelDiff !== null ? (wp.fuelDiff > 0 ? '+'+wp.fuelDiff.toFixed(1) : wp.fuelDiff.toFixed(1)) : '';
                    let fClass = (wp.fuelDiff !== null) ? (wp.fuelDiff > 0 ? 'diff-ahead' : (wp.fuelDiff < 0 ? 'diff-behind' : '')) : '';
                    fuelDiffEl.className = `log-td col-diff ${fClass}`;
                }
            });
        }
        
        this.renderStatusBar();
        document.getElementById('tableContainer').style.display = 'block';
    },

    renderStatusBar() {
        const wps = this.state.waypoints; if (!wps || wps.length === 0) return;
        const last = wps[wps.length - 1];
        let lastTimeIdx = -1, lastFuelIdx = -1;
        for (let i = wps.length - 1; i >= 0; i--) {
            if (lastTimeIdx === -1 && wps[i].actualTime && wps[i].actualTime.length === 4) lastTimeIdx = i;
            let actFuelStr = this.state.fuelCalcBasis === 'TTL' ? (wps[i].actualFuelTTL || '') : (wps[i].actualFuelCALC || '');
            if (lastFuelIdx === -1 && actFuelStr !== '') lastFuelIdx = i;
        }

        const elEtaLast = document.getElementById('sb-eta-last');
        if (lastTimeIdx !== -1) { elEtaLast.textContent = `(Last: ${wps[lastTimeIdx].name})`; elEtaLast.style.display = 'inline'; elEtaLast.onclick = () => app.scrollToRow(lastTimeIdx); } 
        else { elEtaLast.style.display = 'none'; }

        const elFuelLast = document.getElementById('sb-fuel-last');
        if (lastFuelIdx !== -1) { elFuelLast.textContent = `(Last: ${wps[lastFuelIdx].name})`; elFuelLast.style.display = 'inline'; elFuelLast.onclick = () => app.scrollToRow(lastFuelIdx); } 
        else { elFuelLast.style.display = 'none'; }

        const finalTimeMin = last.actualTime && last.actualTime.length === 4 ? this.toMin(last.actualTime) : last.calcEstTimeMin;
        let lastActFuelStr = this.state.fuelCalcBasis === 'TTL' ? (last.actualFuelTTL || '') : (last.actualFuelCALC || '');
        const finalFuel = lastActFuelStr !== '' ? parseFloat(lastActFuelStr) : last.calcEstFuel;

        let etaDisp = '--', etaDiffDisp = '', etaClass = '';
        if (finalTimeMin !== null && this.state.flightMeta) {
            let timeOffset = 0;
            if (this.state.flightMeta.time) { const match = this.state.flightMeta.time.match(/(?:STA|ETA)\s+(\d{4})Z\/(\d{4})L/); if (match) { timeOffset = this.toMin(match[2]) - this.toMin(match[1]); } }
            let localTimeMin = (finalTimeMin + timeOffset + 2880) % 1440;
            etaDisp = this.toHHMM(finalTimeMin) + 'Z/' + this.toHHMM(localTimeMin) + 'L';
            if (this.state.flightMeta.sta) {
                const staMin = this.toMin(this.state.flightMeta.sta); let diff = finalTimeMin - staMin;
                while(diff > 720) diff -= 1440; while(diff < -720) diff += 1440;
                if (diff < 0) { etaDiffDisp = `(${diff}m)`; etaClass = 'diff-ahead'; } 
                else if (diff > 0) { etaDiffDisp = `(+${diff}m)`; etaClass = 'diff-behind'; } 
                else { etaDiffDisp = '(On Time)'; }
            }
        }
        document.getElementById('sb-eta').textContent = etaDisp;
        const elEtaDiff = document.getElementById('sb-eta-diff'); elEtaDiff.textContent = etaDiffDisp; elEtaDiff.className = etaClass ? `status-badge ${etaClass}` : 'status-badge';
        
        let destFuelDisp = finalFuel !== null ? finalFuel.toFixed(1) : '--'; let destFuelDiffDisp = '', destFuelClass = '';
        if (finalFuel !== null) {
            let diff = finalFuel - last.plannedFuel;
            if (diff > 0) { destFuelDiffDisp = `(+${diff.toFixed(1)})`; destFuelClass = 'diff-ahead'; } else if (diff < 0) { destFuelDiffDisp = `(${diff.toFixed(1)})`; destFuelClass = 'diff-behind'; } else { destFuelDiffDisp = '(±0.0)'; }
        }
        document.getElementById('sb-dest-fuel').textContent = destFuelDisp;
        const elFuelDiff = document.getElementById('sb-dest-fuel-diff'); elFuelDiff.textContent = destFuelDiffDisp; elFuelDiff.className = destFuelClass ? `status-badge ${destFuelClass}` : 'status-badge';

        const sb = document.getElementById('statusBar');
        const warningEl = document.getElementById('sb-dest-fuel-warning');
        if (finalFuel !== null && this.state.destFuelThreshold > 0 && finalFuel < this.state.destFuelThreshold) {
            sb.classList.add('status-warning');
            if (warningEl) warningEl.innerHTML = '<span class="dest-warning-badge">⚠️ LOW FUEL</span>';
        } else {
            sb.classList.remove('status-warning');
            if (warningEl) warningEl.innerHTML = '';
        }

        const container = document.getElementById('sb-avail-fuel-container'); container.innerHTML = '';
        let validAltnCount = 0;
        
        if (finalFuel !== null) {
            this.state.altns.forEach(altn => {
                if (altn.name && altn.name.trim() !== '') {
                    validAltnCount++; const totalReq = parseFloat(altn.fuel) + parseFloat(altn.rsv); const avail = finalFuel - totalReq;
                    const isLow = avail < this.state.alertThreshold; const warningBadge = isLow ? `<span class="altn-warning-badge">⚠️ LOW FUEL</span>` : '';
                    const div = document.createElement('div'); div.style.display = 'flex'; div.style.alignItems = 'center'; div.style.flexWrap = 'wrap'; div.style.marginBottom = '2px';
                    div.innerHTML = `<span style="font-size: 14px; color: ${isLow ? 'var(--alert-text)' : '#f1c40f'};">[${altn.name}] ${avail.toFixed(1)}</span>${warningBadge}<span style="font-size: 10px; font-weight: normal; margin-left: 8px; opacity: 0.7;">( [${altn.name}] ${totalReq.toFixed(1)} (= ALTN:${parseFloat(altn.fuel).toFixed(1)} + RSV:${parseFloat(altn.rsv).toFixed(1)}) )</span>`;
                    container.appendChild(div);
                }
            });
            if (validAltnCount === 0) {
                const avail = finalFuel; const isLow = avail < this.state.alertThreshold; const warningBadge = isLow ? `<span class="altn-warning-badge">⚠️ LOW FUEL</span>` : '';
                const div = document.createElement('div'); div.style.display = 'flex'; div.style.alignItems = 'center';
                div.innerHTML = `<span style="font-size: 14px; color: ${isLow ? 'var(--alert-text)' : '#f1c40f'};">${avail.toFixed(1)}</span>${warningBadge}`;
                container.appendChild(div);
            }
        }

        const etaEl = document.getElementById('sb-eta');
        if (etaEl) {
            const etaSection = etaEl.closest('.status-section');
            if (etaSection) {
                etaSection.classList.add('no-print');
            }
        }

        setTimeout(() => this.updateStickyHeight(), 50);
    },

    resetData() {
        if(confirm("フライトデータを完全に削除し、初期状態に戻しますか？")) {
            localStorage.removeItem('navlog_v25_data');
            this.state = { 
                waypoints: [], altns: [{name:'', fuel:0, rsv:0}], alertThreshold: 0, destFuelThreshold: 0, headerInfo: "", flightMeta: null, fuelCalcBasis: 'CALC',
                crew: [{ id: 1, duty: 'PIC', empNo: '42482', name: 'NORIYUKI ARAI', rank: 'CAP' }, { id: 2, duty: 'COP', empNo: '', name: '', rank: 'COP' }],
                crewMemo: '', 
                takeoffPilotId: null, landingPilotId: null, crewPanelOpen: true,
                times: { bo: '', bi: '', tkof: '', ldg: '' },
                actFob: '', actFod: '',
                postFlightLog: null
            };
            document.getElementById('flightHeader').style.display = 'none'; document.getElementById('headerInfoCard').style.display = 'none';
            document.getElementById('crewInfoCard').style.display = 'none'; document.getElementById('tableContainer').style.display = 'none';
            document.getElementById('statusBar').style.display = 'none'; document.getElementById('bottomControls').style.display = 'none';
            document.getElementById('settingsPanel').style.display = 'none'; document.getElementById('defaultTitle').style.display = 'block';
            document.getElementById('inputArea').style.display = 'block';
            this.renderSettings();
            this.renderTimes();
            this.renderActualFuel();
            this.state.postFlightLog = { domInt: 'DOM', activeDuty: 'PIC', day: '', type: 'B767', reg: '', dep: '', arr: '', fltNumber: '', depTime: '', arrTime: '', tkof: '', ldg: '', fltTime: '', picTime: '', sicTime: '', ngtPicSic: '', copTime: '', ngtCop: '', imc: '', apchType: '' };
            if(this.renderPostFlightLog) this.renderPostFlightLog();
        }
    }
};

window.onload = () => app.init();