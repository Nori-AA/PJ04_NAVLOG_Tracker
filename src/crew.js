// ====== crew.js ======
// appオブジェクトにCREW・PFL関連の機能を追加（拡張）します
Object.assign(app, {
    
    toggleCrew() {
        this.state.crewPanelOpen = !this.state.crewPanelOpen;
        this.saveConfig();
        this.updateCrewPanelUI();
    },
    
    updateCrewPanelUI() {
        const c = document.getElementById('crewContentEl');
        const icon = document.getElementById('crew-toggle-icon');
        if (this.state.crewPanelOpen) { c.style.display = 'block'; icon.textContent = '▼'; } 
        else { c.style.display = 'none'; icon.textContent = '▶'; }
    },

    handleSelectChange(index, field, val) {
        if (val === 'other') {
            const input = prompt(`${field.toUpperCase()} を入力:`);
            if (input !== null && input.trim() !== '') { this.state.crew[index][field] = input.trim().toUpperCase(); }
        } else { this.state.crew[index][field] = val; }
        this.saveConfig();
        this.renderCrew();
    },

    renderCrew() {
        const tbody = document.getElementById('crewTableBody'); tbody.innerHTML = '';
        this.state.crew.forEach((c, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="radio" name="takeoff_pilot" ${this.state.takeoffPilotId === c.id ? 'checked' : ''} onchange="app.updateCrewPilot('takeoff', ${c.id})"></td>
                <td><input type="radio" name="landing_pilot" ${this.state.landingPilotId === c.id ? 'checked' : ''} onchange="app.updateCrewPilot('landing', ${c.id})"></td>
                <td><select class="input-crew" onchange="app.handleSelectChange(${i}, 'duty', this.value)">
                    <option value="${c.duty}" selected hidden>${c.duty}</option>
                    <option value="PIC">PIC</option><option value="COP">COP</option><option value="SIC">SIC</option><option value="other">other</option>
                </select></td>
                <td><input type="text" class="input-crew" value="${c.empNo}" placeholder="Emp No" onchange="app.updateCrew(${i}, 'empNo', this.value)"></td>
                <td><input type="text" class="input-crew input-crew-name" value="${c.name}" placeholder="Name" onchange="app.updateCrew(${i}, 'name', this.value)"></td>
                <td><select class="input-crew" onchange="app.handleSelectChange(${i}, 'rank', this.value)">
                    <option value="${c.rank}" selected hidden>${c.rank}</option>
                    <option value="CAP">CAP</option><option value="COP">COP</option><option value="other">other</option>
                </select></td>
                <td>${this.state.crew.length > 2 ? `<button class="btn-danger btn-small" style="padding:2px 4px;font-size:10px;" onclick="app.removeCrew(${i})">✖</button>` : ''}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    updateCrew(index, field, val) { this.state.crew[index][field] = val.toUpperCase(); this.saveConfig(); },
    
    updateCrewPilot(type, id) {
        if (type === 'takeoff') this.state.takeoffPilotId = id;
        if (type === 'landing') this.state.landingPilotId = id;
        this.saveConfig();
    },
    
    addCrew() {
        const newId = this.state.crew.length > 0 ? Math.max(...this.state.crew.map(c => c.id)) + 1 : 1;
        this.state.crew.push({ id: newId, duty: '', empNo: '', name: '', rank: '' });
        if(!this.state.crewPanelOpen) this.toggleCrew(); 
        this.saveConfig(); this.renderCrew();
    },
    
    removeCrew(index) {
        const id = this.state.crew[index].id;
        if (this.state.takeoffPilotId === id) this.state.takeoffPilotId = null;
        if (this.state.landingPilotId === id) this.state.landingPilotId = null;
        this.state.crew.splice(index, 1);
        this.saveConfig(); this.renderCrew();
    },

    setPflToggle(field, val) {
        if(!this.state.postFlightLog) return;
        if (field === 'activeDuty') {
            const oldDuty = this.state.postFlightLog.activeDuty;
            if (oldDuty !== val) {
                if (oldDuty === 'PIC') this.state.postFlightLog.picTime = '';
                if (oldDuty === 'SIC') this.state.postFlightLog.sicTime = '';
                if (oldDuty === 'COP') this.state.postFlightLog.copTime = '';
                this.state.postFlightLog.activeDuty = val;
                if (this.state.postFlightLog.fltTime) {
                    if (val === 'PIC') this.state.postFlightLog.picTime = this.state.postFlightLog.fltTime;
                    if (val === 'SIC') this.state.postFlightLog.sicTime = this.state.postFlightLog.fltTime;
                    if (val === 'COP') this.state.postFlightLog.copTime = this.state.postFlightLog.fltTime;
                }
            }
        } else if (field === 'domInt') {
            this.state.postFlightLog.domInt = val;
        }
        this.calcPflTimes(); 
    },
    
    updatePfl(field, val, isDuration = false) {
        if(!this.state.postFlightLog) return;
        if (isDuration && val.trim() !== '') {
            let clean = val.replace(/[^\d]/g, '');
            if (clean.length >= 3 && clean.length <= 4) {
                let h = clean.length === 3 ? clean.slice(0, 1) : clean.slice(0, 2);
                let m = clean.slice(-2);
                val = parseInt(h, 10) + '+' + m;
            }
        }
        this.state.postFlightLog[field] = val;
        this.saveConfig();
        this.renderPostFlightLog();
    },
    
    calcPflTimes() {
        if(!this.state.postFlightLog) return;
        const bo = this.state.times.bo;
        const bi = this.state.times.bi;
        const pfl = this.state.postFlightLog;

        if (bo && bo.length === 4) pfl.depTime = this.convertZtoLocal(bo, pfl.domInt);
        if (bi && bi.length === 4) pfl.arrTime = this.convertZtoLocal(bi, pfl.domInt);

        if (bo && bo.length === 4 && bi && bi.length === 4) {
            let m1 = this.toMin(bo);
            let m2 = this.toMin(bi);
            let diff = m2 - m1;
            if (diff < 0) diff += 1440; 
            
            let h = Math.floor(diff / 60);
            let m = String(diff % 60).padStart(2, '0');
            let newFltStr = `${h}+${m}`;
            
            if (pfl.fltTime !== newFltStr) {
                pfl.fltTime = newFltStr;
                pfl.picTime = ''; pfl.sicTime = ''; pfl.copTime = '';
                if (pfl.activeDuty === 'PIC') pfl.picTime = newFltStr;
                if (pfl.activeDuty === 'SIC') pfl.sicTime = newFltStr;
                if (pfl.activeDuty === 'COP') pfl.copTime = newFltStr;
            }
        }
        this.saveConfig();
        this.renderPostFlightLog();
    },
    
    convertZtoLocal(zTime, domInt) {
        if (domInt === 'INT') return zTime;
        let m = this.toMin(zTime) + 9 * 60; 
        m = m % 1440;
        return this.toHHMM(m);
    },
    
    renderPostFlightLog() {
        if(!this.state.postFlightLog) return;

        // ★★★ 追加: PDF印刷時にFLT NUMBERの前で改行する処理 ★★★
        if (!document.getElementById('pfl_print_style')) {
            const style = document.createElement('style');
            style.id = 'pfl_print_style';
            style.innerHTML = `
                @media print {
                    .pfl-print-break {
                        display: block !important;
                        flex-basis: 100%;
                        width: 100%;
                        height: 0;
                        margin: 0;
                        padding: 0;
                    }
                    .pfl-container-print-wrap {
                        flex-wrap: wrap !important;
                    }
                }
                @media screen {
                    .pfl-print-break {
                        display: none !important;
                    }
                }
            `;
            document.head.appendChild(style);

            const fltNumEl = document.getElementById('pfl_fltNumber');
            if (fltNumEl) {
                // FLT NUMBERの入力欄とラベルを囲んでいる親コンテナを取得
                const parentGroup = fltNumEl.parentElement;
                if (parentGroup && parentGroup.parentNode) {
                    const brk = document.createElement('div');
                    brk.className = 'pfl-print-break';
                    // FLT NUMBERコンテナの直前に「印刷時のみ発動する改行ブロック」を挿入
                    parentGroup.parentNode.insertBefore(brk, parentGroup);
                    
                    // フレックスボックスで折り返しを許可する
                    parentGroup.parentNode.classList.add('pfl-container-print-wrap');
                }
            }
        }
        // ★★★ ここまで ★★★

        const pfl = this.state.postFlightLog;
        
        const btnDom = document.getElementById('btnPflDom'); if(btnDom) btnDom.className = pfl.domInt === 'DOM' ? 'pfl-btn active' : 'pfl-btn';
        const btnInt = document.getElementById('btnPflInt'); if(btnInt) btnInt.className = pfl.domInt === 'INT' ? 'pfl-btn active' : 'pfl-btn';
        
        const btnPic = document.getElementById('btnPflPic'); if(btnPic) btnPic.className = pfl.activeDuty === 'PIC' ? 'pfl-btn active' : 'pfl-btn';
        const btnSic = document.getElementById('btnPflSic'); if(btnSic) btnSic.className = pfl.activeDuty === 'SIC' ? 'pfl-btn active' : 'pfl-btn';
        const btnCop = document.getElementById('btnPflCop'); if(btnCop) btnCop.className = pfl.activeDuty === 'COP' ? 'pfl-btn active' : 'pfl-btn';

        const fields = ['day', 'type', 'reg', 'dep', 'arr', 'depTime', 'arrTime', 'tkof', 'ldg', 'fltNumber', 'fltTime', 'picTime', 'sicTime', 'ngtPicSic', 'copTime', 'ngtCop', 'imc', 'apchType'];
        fields.forEach(f => {
            const el = document.getElementById('pfl_' + f);
            if (el && document.activeElement !== el) el.value = pfl[f] || '';
        });
    },
    
    async copyPflToCsv() {
        if(!this.state.postFlightLog) return;
        const pfl = this.state.postFlightLog;
        const picCrew = this.state.crew.find(c => c.duty === 'PIC');
        const picName = picCrew ? picCrew.name : '';
        
        const fields = [
            pfl.day, pfl.type, pfl.reg, pfl.dep, pfl.arr, pfl.depTime, pfl.arrTime, pfl.tkof, pfl.ldg, 
            pfl.fltNumber, pfl.fltTime, pfl.picTime, pfl.sicTime, pfl.ngtPicSic, pfl.copTime, pfl.ngtCop, pfl.imc, pfl.apchType, picName
        ];
        
        const csvString = fields.map(v => v || '').join(',');
        
        try {
            await navigator.clipboard.writeText(csvString);
            const btn = document.getElementById('btnPflCsv');
            if (btn) {
                const originalText = btn.innerHTML;
                btn.innerHTML = '✅ コピー完了！'; btn.style.background = 'var(--success-color)';
                setTimeout(() => { btn.innerHTML = originalText; btn.style.background = ''; }, 2000);
            }
        } catch (err) { alert("クリップボードへのコピーに失敗しました。"); }
    }
});