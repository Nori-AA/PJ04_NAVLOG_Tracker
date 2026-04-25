if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW failed:', err));
    });
}

// Enter（完了）キー押下時にキーボードを即座に引っ込める機能
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
        postFlightLog: null,
        activeInput: null 
    },

    init() {
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
            if (!this.state.crew || this.state.crew.length === 0) {
                this.state.crew = [{ id: 1, duty: 'PIC', empNo: '', name: '', rank: 'CAP' }, { id: 2, duty: 'COP', empNo: '', name: '', rank: 'COP' }];
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
            
            // これらは crew.js 側で定義される関数ですが、実行タイミング(init)ではすでに結合済みなので問題なく動きます
            if(this.updateCrewPanelUI) this.updateCrewPanelUI();
            if(this.renderCrew) this.renderCrew();
            
            this.renderTimes();
            this.renderActualFuel();
            
            if(this.renderPostFlightLog) this.renderPostFlightLog();
            
            document.getElementById('tableBody').innerHTML = ''; 
            this.render();
        }
        
        this.setupFocusScrollBehavior();
        this.updateThemeButton();
        window.addEventListener('resize', this.updateStickyHeight);
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
        
        if (waypoints.length <= 1) return alert("データを抽出できませんでした。正しいNAVLOGテキストか確認してください。");
        if (waypoints.length > 1 && waypoints[1].rtme !== "---") {
            const firstWpRtmeMin = this.parseLegTime(waypoints[1].rtme);
            const firstWpZtmeMin = waypoints[1].ztmeMin;
            waypoints[0].rtme = this.formatLegTime(firstWpRtmeMin + firstWpZtmeMin);
        }

        let cumDist = 0;
        waypoints.forEach(wp => { cumDist += wp.dist; wp.cumDist = cumDist; });
        let totalRouteDist = cumDist;
        waypoints.forEach(wp => { wp.rdis = totalRouteDist - wp.cumDist; });
        
        if (this.state.flightMeta) { this.state.flightMeta.dist = totalRouteDist; }
        this.state.waypoints = waypoints;
        if (this.state.flightMeta && this.state.flightMeta.altns && this.state.flightMeta.altns.length > 0) {
            this.state.altns = this.state.flightMeta.altns;
            this.renderSettings();
        }
        
        document.getElementById('statusBar').style.display = 'flex';
        document.getElementById('bottomControls').style.display = 'block';
        document.getElementById('inputArea').style.display = 'none';
        document.getElementById('crewInfoCard').style.display = 'block';
        
        this.state.crewPanelOpen = true;
        if(this.updateCrewPanelUI) this.updateCrewPanelUI();
        
        document.getElementById('tableBody').innerHTML = ''; 
        this.calculate();
        if(this.renderCrew) this.renderCrew();
        this.renderTimes();
        this.renderActualFuel();
        if(this.renderPostFlightLog) this.renderPostFlightLog();
        this.render();
        this.renderFlightMeta();
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
        // crew.js 側に移動した関数を呼び出し（安全のため if でチェック）
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
        
        let globalRsv = 0; const rsvMatch = text.match(/^RSV\s+\d{2}\/\d{2}\s+(\d+)/m); 
        if (rsvMatch) { 
            let val = parseFloat(rsvMatch[1]); 
            globalRsv = val > 100 ? val / 1000 : val; 
            if(globalRsv > 0) this.state.destFuelThreshold = globalRsv; 
        }
        
        const altMatch = text.match(/^ALT\s+(.*)/m);
        if (altMatch) {
            const altnParts = altMatch[1].match(/([A-Z0-9]{4})\s+\d{2}\/\d{2}\s+(\d+)/g);
            if (altnParts) altnParts.forEach(p => {
                const m = p.match(/([A-Z0-9]{4})\s+\d{2}\/\d{2}\s+(\d+)/);
                if (m) meta.altns.push({ name: m[1], fuel: parseFloat(m[2]) > 100 ? parseFloat(m[2])/1000 : parseFloat(m[2]), rsv: globalRsv });
            });
        }
        this.state.flightMeta = meta; this.renderFlightMeta();

        if (this.state.postFlightLog) {
            this.state.postFlightLog.fltNumber = meta.flt !== "---" ? meta.flt : "";
            this.state.postFlightLog.dep = meta.dep !== "---" ? meta.dep : "";
            this.state.postFlightLog.arr = meta.dest !== "---" ? meta.dest : "";
            this.state.postFlightLog.day = meta.date !== "---" ? meta.date : "";
            this.state.postFlightLog.reg = meta.reg !== "---" ? meta.reg : "";
            if(!this.state.postFlightLog.type) this.state.postFlightLog.type = "B767";
        }
    },

    renderFlightMeta() {
        document.getElementById('defaultTitle').style.display = 'none'; document.getElementById('flightHeader').style.display = 'block';
        document.getElementById('fh-flt').textContent = this.state.flightMeta.flt; document.getElementById('fh-date').textContent = this.state.flightMeta.date;
        document.getElementById('fh-reg').textContent = this.state.flightMeta.reg; document.getElementById('fh-route').textContent = `${this.state.flightMeta.dep} ➔ ${this.state.flightMeta.dest}`;
        document.getElementById('fh-altn').textContent = this.state.flightMeta.altn; document.getElementById('fh-time').textContent = this.state.flightMeta.time;
        document.getElementById('fh-bt').textContent = this.state.flightMeta.bt || "---"; document.getElementById('fh-ft').textContent = this.state.flightMeta.ft || "---";
        document.getElementById('fh-dist').textContent = (this.state.flightMeta.dist !== "---" ? this.state.flightMeta.dist + " NM" : "---");
    },

    toggleHeader() {
        const c = document.getElementById('headerInfoContent'), icon = document.getElementById('drm-toggle-icon');
        if (c.style.display === 'none') { c.style.display = 'block'; icon.textContent = '▼'; } else { c.style.display = 'none'; icon.textContent = '▶'; }
    },

    extractAndFormatHeaderInfo(text) {
        let headerEndIndex = text.length; const rdisMatch = text.match(/([A-Z]{4})\s+\(RDIS\)\s+(\d{3}\.\d)/); if (rdisMatch) headerEndIndex = rdisMatch.index;
        let rawHeader = text.substring(0, headerEndIndex); const lastNavLogIdx = rawHeader.lastIndexOf('NAVIGATION LOG'); if (lastNavLogIdx !== -1) rawHeader = rawHeader.substring(0, lastNavLogIdx);
        let cleanedLines = [];
        for (let line of rawHeader.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.includes('ipobs-aps') || trimmed === '_' || trimmed.includes('token=') || /\d+\s*\/\s*\d+\s*ページ/.test(trimmed) || trimmed === '') continue;
            cleanedLines.push(trimmed);
        }
        let formattedLines = [], inFuelPlan = false, inSummaryPlan = false, parenthesisDepth = 0;
        for (let i = 0; i < cleanedLines.length; i++) {
            let line = cleanedLines[i];
            if (inFuelPlan && !line.includes('-FUEL PLAN')) {
                const isKey = ['BOF','CON','RSV','ALT','TAX','REQ','PCF','EXT','FOB'].some(k => line.startsWith(k));
                if (!isKey && !line.includes('TIME') && !line.startsWith('FOD=') && !line.startsWith('DIV') && !line.startsWith('TXI') && !line.startsWith('CRIT F') && !line.startsWith('CPT')) {
                    formattedLines.push('----------------------------------------------------------------------'); inFuelPlan = false;
                }
            }
            if (inSummaryPlan && !line.includes('-SUMMARY PLAN')) { if (!/^FL\d{3}/.test(line) && !line.includes('SPD')) { formattedLines.push('-------------------------------------------'); inSummaryPlan = false; } }
            let isMajorHeader = false;
            if (line.includes('JDP:') || line.includes('COMPANY CLEARANCE')) isMajorHeader = true;
            else if (line.startsWith('-') && !line.startsWith('--') && parenthesisDepth === 0) isMajorHeader = true;
            if (isMajorHeader && formattedLines.length > 0 && formattedLines[formattedLines.length - 1] !== '') formattedLines.push('');
            let oC = (line.match(/\(/g) || []).length, cC = (line.match(/\)/g) || []).length; parenthesisDepth = Math.max(0, parenthesisDepth + (oC - cC));
            if (line.includes('-SUMMARY PLAN')) { inSummaryPlan = true; formattedLines.push('■ SUMMARY PLAN'); continue; }
            if (inSummaryPlan) {
                if (line.includes('FL') && line.includes('SPD')) { formattedLines.push('     FL    SPD   TIME    FUEL    W/F    C/T\n-------------------------------------------'); continue; }
                if (/^FL\d{3}/.test(line)) { let p = line.split(/\s+/); formattedLines.push((p[0]||"").padEnd(6,' ')+" "+(p[1]||"").padStart(4,' ')+"  "+(p[2]||"").padStart(5,' ')+"  "+(p[3]||"").padStart(7,' ')+"  "+(p[4]||"").padStart(5,' ')+"  "+(p[5]||"").padStart(5,' ')); continue; }
                continue; 
            }
            if (line.includes('-FUEL PLAN')) { inFuelPlan = true; formattedLines.push('■ FUEL PLAN'); continue; }
            if (inFuelPlan) {
                if (line.includes('TIME') && line.includes('FUEL')) { formattedLines.push('     DEST   TIME   FUEL      DEST   TIME   FUEL      REMARKS\n----------------------------------------------------------------------'); continue; }
                if (line.startsWith('FOD=') || line.startsWith('CPT') || line.startsWith('DIV') || line.startsWith('TXI') || line.startsWith('CRIT F')) { formattedLines.push(line); continue; }
                const keyMatch = ['BOF','CON','RSV','ALT','TAX','REQ','PCF','EXT','FOB'].find(k => line.startsWith(k));
                if (keyMatch) {
                    let p = line.split(/\s+/), k = p[0], d1="", t1="", f1="", d2="", t2="", f2="", rm="";
                    if (k==='BOF') { d1=p[1]; t1=p[2]; f1=p[3]; d2=p[4]; t2=p[5]; f2=p[6]; rm=p.slice(7).join(' '); }
                    else if (k==='ALT') { d1=p[1]||""; t1=p[2]||""; f1=p[3]||""; if (p[4] && p[4].includes('/')) { d2="----"; t2=p[4]; f2=p[5]||""; } else { d2=p[4]||""; t2=p[5]||""; f2=p[6]||""; } }
                    else if (k==='TAX') { f1=p[1]; f2=p[2]; } else { t1=p[1]; f1=p[2]; t2=p[3]; f2=p[4]; }
                    formattedLines.push(`${k.padEnd(4, ' ')} ${(d1||"").padEnd(5, ' ')}  ${(t1||"").padStart(5, ' ')}  ${(f1||"").padStart(6, ' ')}   ${(d2||"").padEnd(5, ' ')}  ${(t2||"").padStart(5, ' ')}  ${(f2||"").padStart(6, ' ')}   ${rm}`);
                    continue;
                }
            }
            if (line.includes('COMPANY CLEARANCE')) formattedLines.push('■ ' + line); else formattedLines.push(line);
        }
        this.state.headerInfo = formattedLines.join('\n').trim();
        if (this.state.headerInfo) { document.getElementById('headerInfoCard').style.display = 'block'; document.getElementById('headerInfoContent').textContent = this.state.headerInfo; }
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
    updateMemo(i, val) { this.state.waypoints[i].memo = val; this.saveConfig(); },

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
                            <input type="number" id="wp_${i}_actFuelTTL" class="input-actual-half" inputmode="decimal" step="0.1" placeholder="TTL" value="${wp.actualFuelTTL || ''}" onchange="app.update(${i}, 'actualFuelTTL', this.value)">
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
                memoTr.className = 'memo-row'; // ★ no-print から memo-row に変更
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
        setTimeout(() => this.updateStickyHeight(), 50);
    },

    resetData() {
        if(confirm("フライトデータを完全に削除し、初期状態に戻しますか？")) {
            localStorage.removeItem('navlog_v25_data');
            this.state = { 
                waypoints: [], altns: [{name:'', fuel:0, rsv:0}], alertThreshold: 0, destFuelThreshold: 0, headerInfo: "", flightMeta: null, fuelCalcBasis: 'CALC',
                crew: [{ id: 1, duty: 'PIC', empNo: '', name: '', rank: 'CAP' }, { id: 2, duty: 'COP', empNo: '', name: '', rank: 'COP' }],
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