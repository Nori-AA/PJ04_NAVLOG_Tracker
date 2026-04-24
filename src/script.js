/**
 * NAVLOG Tracker V25.5.0
 * Logic for Post-Flight Log integration and Auto-Sync
 */

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW failed:', err));
    });
}

// Enterキー押下時にキーボードを閉じる
window.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' || event.keyCode === 13) {
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'SELECT')) {
            document.activeElement.blur();
        }
    }
});

const app = {
    state: { 
        waypoints: [], altns: [{name:'', fuel:0, rsv:0}], alertThreshold: 0, destFuelThreshold: 0, headerInfo: "", flightMeta: null, fuelCalcBasis: 'CALC',
        crew: [{ id: 1, duty: 'PIC', empNo: '', name: '', rank: 'CAP' }, { id: 2, duty: 'COP', empNo: '', name: '', rank: 'COP' }],
        takeoffPilotId: null, landingPilotId: null, crewPanelOpen: true,
        times: { bo: '', bi: '', tkof: '', ldg: '' },
        actFob: '', actFod: '',
        activeInput: null,
        // Post-Flight Log State
        postFlight: {
            mode: 'DOM', // 'DOM' or 'INT'
            syncDuty: 'PIC', // 'PIC', 'SIC', 'COP'
            day: '', type: 'B767', reg: '', dep: '', arr: '', 
            depTime: '', arrTime: '', tkof: '', ldg: '', 
            fltNo: '', fltTime: '', picTime: '', sicTime: '', 
            ngtPicSic: '', copTime: '', ngtCop: '', imc: '', apchType: ''
        }
    },

    init() {
        const saved = localStorage.getItem('navlog_v25_data');
        if (saved) {
            const parsed = JSON.parse(saved);
            this.state = { ...this.state, ...parsed };
            
            // 旧バージョンからのマイグレーション・初期化
            if (!this.state.postFlight) this.initPostFlight();
            if (!this.state.altns || this.state.altns.length === 0) this.state.altns = [{name:'', fuel:0, rsv:0}];
            if (!this.state.crew || this.state.crew.length === 0) {
                this.state.crew = [{ id: 1, duty: 'PIC', empNo: '', name: '', rank: 'CAP' }, { id: 2, duty: 'COP', empNo: '', name: '', rank: 'COP' }];
            }

            this.renderSettings();
            if (this.state.headerInfo) {
                document.getElementById('headerInfoCard').style.display = 'block';
                document.getElementById('headerInfoContent').textContent = this.state.headerInfo;
            }
            if (this.state.flightMeta) this.renderFlightMeta();
            if (this.state.waypoints.length > 0) {
                this.showMainUI();
                this.renderCrew();
                this.renderTimes();
                this.renderActualFuel();
                this.renderPostFlight();
                this.render();
            }
        } else {
            this.initPostFlight();
            this.renderSettings();
        }
        
        this.setupFocusScrollBehavior();
        this.updateThemeButton();
        window.addEventListener('resize', () => this.updateStickyHeight());
    },

    initPostFlight() {
        this.state.postFlight = {
            mode: 'DOM', syncDuty: 'PIC',
            day: '', type: 'B767', reg: '', dep: '', arr: '', 
            depTime: '', arrTime: '', tkof: '', ldg: '', 
            fltNo: '', fltTime: '', picTime: '', sicTime: '', 
            ngtPicSic: '', copTime: '', ngtCop: '', imc: '', apchType: ''
        };
    },

    showMainUI() {
        document.getElementById('statusBar').style.display = 'flex';
        document.getElementById('bottomControls').style.display = 'block';
        document.getElementById('inputArea').style.display = 'none';
        document.getElementById('crewInfoCard').style.display = 'block';
        document.getElementById('tableContainer').style.display = 'block';
        this.updateCrewPanelUI();
    },

    // ---------------------------------------------------------
    // POST-FLIGHT LOG LOGIC
    // ---------------------------------------------------------

    updatePf(field, val) {
        this.state.postFlight[field] = val.toUpperCase();
        this.saveConfig();
    },

    // 時間入力（130 -> 1+30）のハンドリング
    updatePfTime(field, val) {
        if (!val) {
            this.state.postFlight[field] = '';
        } else {
            this.state.postFlight[field] = this.formatHourPlusMin(val);
        }
        this.renderPostFlight();
        this.saveConfig();
    },

    formatHourPlusMin(val) {
        // すでに + が含まれている場合はそのまま
        if (val.includes('+')) return val;
        // 数字のみ抽出
        let digits = val.replace(/\D/g, '');
        if (digits.length === 0) return '';
        if (digits.length <= 2) return '0+' + digits.padStart(2, '0');
        
        let h = digits.slice(0, -2);
        let m = digits.slice(-2);
        return parseInt(h, 10) + '+' + m;
    },

    setPfMode(mode) {
        this.state.postFlight.mode = mode;
        this.calculatePostFlight();
        this.renderPostFlight();
        this.saveConfig();
    },

    setPfDuty(duty) {
        this.state.postFlight.syncDuty = duty;
        this.calculatePostFlight();
        this.renderPostFlight();
        this.saveConfig();
    },

    calculatePostFlight() {
        const pf = this.state.postFlight;
        const st = this.state.times;

        // 1. DEP/ARR TIME 自動連動 (B/O, B/Iから)
        if (st.bo && st.bo.length === 4) {
            pf.depTime = this.convertUtcToModeTime(st.bo, pf.mode);
        }
        if (st.bi && st.bi.length === 4) {
            pf.arrTime = this.convertUtcToModeTime(st.bi, pf.mode);
        }

        // 2. FLT TIME 計算 (B/I - B/O)
        if (st.bo.length === 4 && st.bi.length === 4) {
            let mBo = this.toMin(st.bo);
            let mBi = this.toMin(st.bi);
            let diff = mBi - mBo;
            if (diff < 0) diff += 1440; // 24時間跨ぎ
            
            let h = Math.floor(diff / 60);
            let m = diff % 60;
            pf.fltTime = `${h}+${String(m).padStart(2, '0')}`;

            // 3. Dutyへの自動転記
            const timeVal = pf.fltTime;
            if (pf.syncDuty === 'PIC') {
                pf.picTime = timeVal;
                pf.ngtPicSic = timeVal; // Nightも暫定フル
            } else if (pf.syncDuty === 'SIC') {
                pf.sicTime = timeVal;
                pf.ngtPicSic = timeVal;
            } else if (pf.syncDuty === 'COP') {
                pf.copTime = timeVal;
                pf.ngtCop = timeVal;
            }
        }
    },

    convertUtcToModeTime(utcHhmm, mode) {
        if (mode === 'INT') return utcHhmm;
        // DOM (+9h)
        let totalMin = this.toMin(utcHhmm) + 540;
        return this.toHHMM(totalMin % 1440);
    },

    renderPostFlight() {
        const pf = this.state.postFlight;
        const fields = [
            'day', 'type', 'reg', 'dep', 'arr', 'dep-time', 'arr-time', 
            'tkof', 'ldg', 'flt-no', 'flt-time', 'pic-time', 'sic-time', 
            'ngt-picsic', 'cop-time', 'ngt-cop', 'imc', 'apch-type'
        ];
        
        fields.forEach(f => {
            const el = document.getElementById('pf-' + f);
            if (!el) return;
            // キャメルケース変換
            const key = f.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
            el.value = pf[key] || '';
        });

        // ボタンのActive状態
        document.getElementById('pf-dom-btn').classList.toggle('active', pf.mode === 'DOM');
        document.getElementById('pf-int-btn').classList.toggle('active', pf.mode === 'INT');
        document.getElementById('pf-duty-pic').classList.toggle('active', pf.syncDuty === 'PIC');
        document.getElementById('pf-duty-sic').classList.toggle('active', pf.syncDuty === 'SIC');
        document.getElementById('pf-duty-cop').classList.toggle('active', pf.syncDuty === 'COP');
    },

    // ---------------------------------------------------------
    // CORE LOGIC & NAVLOG PROCESSOR
    // ---------------------------------------------------------

    async loadFromClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            if (!text || text.trim() === '') return alert("クリップボードが空です。");
            this.processData(text);
        } catch (err) {
            alert("読み込みに失敗しました。ファイルを選択してください。");
        }
    },

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => { this.processData(e.target.result); };
        reader.readAsText(file);
    },

    processData(text) {
        this.extractFlightMeta(text);
        this.extractAndFormatHeaderInfo(text);
        
        const waypoints = [];
        const rdisMatch = text.match(/([A-Z]{4})\s+\(RDIS\)\s+(\d{3,4}\.\d)/);
        if (rdisMatch) { waypoints.push(this.createWP(rdisMatch[1], "---", "---", "---", "00.00", "---", "0.00", 0, 0, parseFloat(rdisMatch[2]), "", "---", "---")); }
        
        const regex = /(?:\(\s*\d+\s*\)\s+(?:-\s*){4,6}(?:\(\s*(-?\d+)\s*\))?[\s\S]{1,150}?)?(\d{2}\.\d{2})\s+[NS]\d{5}[EW]\d{5,6}[\s\.]+(\d+\.\d{2})\s+(CLM|DEC|\d{5})?\s*(\d{3}\.\d)\s*([+-]\d{2}|\.{1,2})?\s*(\d{6}|\.{1,2})?\s*([\d\/]{5}|\.{1,2})?[\s\S]{1,150}?(\d{2}\.\d{2})\s+([A-Z0-9\-]{3,})\s+\.\s+(\d{3})\s+FL.*?(?:\s+|\/)(\d{2}|\.{1,2})\s*$/gm;
        
        let match;
        while ((match = regex.exec(text)) !== null) {
            const isaDevVal = match[1] ? match[1].replace(/\s+/g, '') : '';
            const ctme = match[2];
            const ztmeDisplay = match[3];
            const ztmeMin = this.parseLegTime(ztmeDisplay);
            const alt = match[4] || '---';
            const plannedFuel = parseFloat(match[5]);
            const tmp = (match[6] && !match[6].includes('.')) ? match[6] : '---';
            let zwind = '---'; 
            if (match[7] && !match[7].includes('.')) zwind = match[7].substring(0,3) + '/' + match[7].substring(3,6);
            const mwtp = (match[8] && !match[8].includes('.')) ? match[8] : '---';
            const rtme = match[9];
            const name = match[10];
            const dist = parseInt(match[11], 10);
            const wscp = (match[12] && !match[12].includes('.')) ? match[12] : '---';
            waypoints.push(this.createWP(name, alt, tmp, zwind, ctme, rtme, ztmeDisplay, ztmeMin, dist, plannedFuel, isaDevVal, mwtp, wscp));
        }
        
        if (waypoints.length <= 1) return alert("データを抽出できませんでした。");

        // Distance & Metadata Sync
        let cumDist = 0;
        waypoints.forEach(wp => { cumDist += wp.dist; wp.cumDist = cumDist; });
        if (this.state.flightMeta) {
            this.state.flightMeta.dist = cumDist;
            // Post-Flight 自動入力
            const pf = this.state.postFlight;
            const meta = this.state.flightMeta;
            pf.day = meta.date.substring(0, 2);
            pf.reg = meta.reg;
            pf.dep = meta.dep;
            pf.arr = meta.dest;
            pf.fltNo = meta.flt;
        }

        this.state.waypoints = waypoints;
        this.showMainUI();
        this.calculate();
        this.renderCrew();
        this.renderTimes();
        this.renderActualFuel();
        this.renderPostFlight();
        this.render();
        this.renderFlightMeta();
    },

    extractFlightMeta(text) {
        let meta = { flt: "---", date: "---", reg: "---", dep: "---", dest: "---", altn: "---", time: "---", sta: null, altns: [], bt: "---", ft: "---", dist: "---" };
        const regMatch = text.match(/COMPUTED\s+\d{4}Z\s+([A-Z0-9\-]+)/); if (regMatch) meta.reg = regMatch[1];
        const dateMatch = text.match(/\b(\d{2}[A-Z]{3}\d{2,4})\b/); if (dateMatch) meta.date = dateMatch[1];
        const routeMatch = text.match(/^([A-Z0-9]+)\/\d{1,3}\/\d{1,3}\s+([A-Z0-9]{4})-([A-Z0-9]{4})\s+([A-Z0-9\/\s]+?)\s+((?:STD|ETD)\s+\d{4}Z\/\d{4}L\s+(?:STA|ETA)\s+\d{4}Z\/\d{4}L)/m);
        if (routeMatch) {
            meta.flt = routeMatch[1]; meta.dep = routeMatch[2]; meta.dest = routeMatch[3]; meta.altn = routeMatch[4].trim(); meta.time = routeMatch[5];
            const staMatch = meta.time.match(/(?:STA|ETA)\s+(\d{4})Z/); if (staMatch) meta.sta = staMatch[1];
        }
        const btFtMatch = text.match(/B\/T\s+(\d{2}HR\d{2}MIN)\s+F\/T\s+(\d{2}HR\d{2}MIN)/); if (btFtMatch) { meta.bt = btFtMatch[1]; meta.ft = btFtMatch[2]; }
        this.state.flightMeta = meta;
    },

    // ---------------------------------------------------------
    // UTILS & SHARED LOGIC
    // ---------------------------------------------------------

    updateTime(field, val) {
        this.state.times[field] = val;
        if (field === 'tkof' && this.state.waypoints.length > 0) {
            this.state.waypoints[0].actualTime = val;
            this.calculate();
            this.render();
        }
        // Post-Flight 連動
        this.calculatePostFlight();
        this.renderPostFlight();
        this.saveConfig();
    },

    toMin(s) { if(!s || s.length<4) return 0; return parseInt(s.slice(0,2), 10)*60 + parseInt(s.slice(2,4), 10); },
    toHHMM(m) { let tm = Math.round(m); return String(Math.floor(tm/60)%24).padStart(2,'0') + String(tm%60).padStart(2,'0'); },
    parseLegTime(str) { if (!str || str === "---") return 0; const p = str.split('.'), h = parseInt(p[0], 10) || 0, m = parseInt(p[1], 10) || 0; return (h * 60) + m; },

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

    diffMin(act, est) { let d = act - est; while(d > 720) d -= 1440; while(d < -720) d += 1440; return d; },

    // ---------------------------------------------------------
    // UI RENDERING & EVENT HANDLERS
    // ---------------------------------------------------------

    render() {
        const tbody = document.getElementById('tableBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        this.state.waypoints.forEach((wp, i) => {
            let tClass = (wp.timeDiff !== null) ? (wp.timeDiff > 0 ? 'diff-behind' : (wp.timeDiff < 0 ? 'diff-ahead' : '')) : '';
            let fClass = (wp.fuelDiff !== null) ? (wp.fuelDiff > 0 ? 'diff-ahead' : (wp.fuelDiff < 0 ? 'diff-behind' : '')) : '';
            const isFirstRow = (i === 0);
            
            const tr = document.createElement('tr');
            tr.id = `row-${i}`;
            tr.innerHTML = `
                <td class="log-td col-wp sticky-col-wp"><div class="wp-cell" onclick="app.toggleMemo(${i})"><strong>${wp.name}</strong>${wp.memo ? '<br>📝' : ''}</div></td>
                <td class="log-td col-alt"><input type="text" class="input-ref ${wp.actualAlt ? 'input-modified' : ''}" value="${wp.estAltDisplay}" onchange="app.update(${i}, 'actualAlt', this.value)"></td>
                <td class="log-td col-wind"><div class="input-stacked">
                    <input type="text" class="input-ref input-wind ${wp.actualZwind ? 'input-modified' : ''}" value="${wp.estZwindDisplay}" onchange="app.update(${i}, 'actualZwind', this.value)">
                    <input type="text" class="input-ref input-tmp ${wp.actualTmp ? 'input-modified' : ''}" value="${wp.estTmpDisplay}" onchange="app.update(${i}, 'actualTmp', this.value)">
                </div></td>
                <td class="log-td col-mwtp">${wp.mwtp}<br><small>${wp.wscp}</small></td>
                <td class="log-td col-ctme">${wp.ctme}/${wp.cumDist}<br><small>${wp.rtme}/${wp.rdis}</small></td>
                <td class="log-td col-ztme">${wp.ztmeDisplay}<br><small>(${wp.dist})</small></td>
                <td class="log-td col-main" style="font-weight:bold;">${wp.estTimeDisplay}</td>
                <td class="log-td col-main">${wp.estFuelDisplay.toFixed(1)}<br><small>(${wp.plannedFuel.toFixed(1)})</small></td>
                <td class="log-td col-actual no-print col-main"><input type="text" class="input-actual" value="${wp.actualTime || ''}" ${isFirstRow?'readonly':''} onchange="app.update(${i}, 'actualTime', this.value)"></td>
                <td class="log-td col-actual no-print col-main">
                    <input type="number" class="input-actual-half" placeholder="TTL" value="${wp.actualFuelTTL || ''}" onchange="app.update(${i}, 'actualFuelTTL', this.value)">
                    <input type="number" class="input-actual-half" placeholder="CALC" value="${wp.actualFuelCALC || ''}" onchange="app.update(${i}, 'actualFuelCALC', this.value)">
                </td>
                <td class="log-td col-diff ${tClass}">${wp.timeDiff!==null?(wp.timeDiff>0?'+'+wp.timeDiff:wp.timeDiff):''}</td>
                <td class="log-td col-diff ${fClass}">${wp.fuelDiff!==null?wp.fuelDiff.toFixed(1):''}</td>
            `;
            tbody.appendChild(tr);
        });
        this.renderStatusBar();
    },

    update(i, field, val) {
        this.state.waypoints[i][field] = val.toUpperCase();
        this.calculate();
        this.render();
    },

    renderStatusBar() {
        const wps = this.state.waypoints; if (!wps || wps.length === 0) return;
        const last = wps[wps.length - 1];
        document.getElementById('sb-eta').textContent = last.estTimeDisplay + 'Z';
        document.getElementById('sb-dest-fuel').textContent = last.estFuelDisplay.toFixed(1);
        
        // Margin Calculation
        const container = document.getElementById('sb-avail-fuel-container');
        container.innerHTML = '';
        this.state.altns.forEach(altn => {
            if (!altn.name) return;
            const margin = last.estFuelDisplay - (parseFloat(altn.fuel) + parseFloat(altn.rsv));
            const div = document.createElement('div');
            div.style.fontSize = '12px';
            div.innerHTML = `[${altn.name}] Margin: <span style="font-weight:bold; color:${margin<this.state.alertThreshold?'var(--alert-text)':'#f1c40f'}">${margin.toFixed(1)}</span>`;
            container.appendChild(div);
        });
    },

    saveConfig() {
        try { localStorage.setItem('navlog_v25_data', JSON.stringify(this.state)); } catch(e){}
    },

    // UI Toggles
    toggleCrew() { this.state.crewPanelOpen = !this.state.crewPanelOpen; this.updateCrewPanelUI(); this.saveConfig(); },
    updateCrewPanelUI() {
        const c = document.getElementById('crewContentEl');
        const icon = document.getElementById('crew-toggle-icon');
        c.style.display = this.state.crewPanelOpen ? 'block' : 'none';
        icon.textContent = this.state.crewPanelOpen ? '▼' : '▶';
    },

    updateThemeButton() {
        const isDark = document.documentElement.classList.contains('theme-dark');
        document.getElementById('themeToggleBtn').innerHTML = isDark ? '☀️ DAY' : '🌙 NGT';
    },
    toggleTheme() {
        const isDark = document.documentElement.classList.toggle('theme-dark');
        localStorage.setItem('navlog_theme', isDark ? 'dark' : 'light');
        this.updateThemeButton();
    },

    resetData() {
        if(confirm("データを全て削除しますか？")) {
            localStorage.removeItem('navlog_v25_data');
            location.reload();
        }
    },

    // Remaining standard handlers
    toggleSettings() { const p = document.getElementById('settingsPanel'); p.style.display = p.style.display==='none'?'block':'none'; },
    renderSettings() {
        document.getElementById('alertThreshold').value = this.state.alertThreshold;
        document.getElementById('destFuelThreshold').value = this.state.destFuelThreshold;
        const container = document.getElementById('altnSettingsContainer');
        container.innerHTML = '';
        this.state.altns.forEach((altn, i) => {
            const div = document.createElement('div');
            div.innerHTML = `<input type="text" value="${altn.name}" style="width:50px" onchange="app.state.altns[${i}].name=this.value.toUpperCase();app.saveConfig()"> 
                             <input type="number" value="${altn.fuel}" style="width:60px" onchange="app.state.altns[${i}].fuel=this.value;app.saveConfig()">
                             <input type="number" value="${altn.rsv}" style="width:60px" onchange="app.state.altns[${i}].rsv=this.value;app.saveConfig()">`;
            container.appendChild(div);
        });
    },
    addAltn() { this.state.altns.push({name:'', fuel:0, rsv:0}); this.renderSettings(); },
    updateStickyHeight() {
        const sb = document.getElementById('statusBar');
        if (sb) document.documentElement.style.setProperty('--sb-height', sb.offsetHeight + 'px');
    },
    setupFocusScrollBehavior() {
        document.addEventListener('focusin', (e) => {
            if (['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) {
                this.state.activeInput = e.target;
            }
        });
    }
};

window.onload = () => app.init();