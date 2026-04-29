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
        const tbody = document.getElementById('crewTableBody'); 
        if(!tbody) return;
        tbody.innerHTML = '';
        this.state.crew.forEach((c, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input type="radio" name="takeoffPilot" value="${c.id}" ${this.state.takeoffPilotId === c.id ? 'checked' : ''} onchange="app.updateCrewPilot('takeoff', ${c.id})"></td>
                <td><input type="radio" name="landingPilot" value="${c.id}" ${this.state.landingPilotId === c.id ? 'checked' : ''} onchange="app.updateCrewPilot('landing', ${c.id})"></td>
                <td>
                    <select class="crew-input" onchange="app.handleSelectChange(${i}, 'duty', this.value)">
                        <option value="PIC" ${c.duty === 'PIC' ? 'selected' : ''}>PIC</option>
                        <option value="SIC" ${c.duty === 'SIC' ? 'selected' : ''}>SIC</option>
                        <option value="COP" ${c.duty === 'COP' ? 'selected' : ''}>COP</option>
                        <option value="OBS" ${c.duty === 'OBS' ? 'selected' : ''}>OBS</option>
                        <option value="OPE" ${c.duty === 'OPE' ? 'selected' : ''}>OPE</option>
                        <option value="other" ${!['PIC','SIC','COP','OBS','OPE'].includes(c.duty) ? 'selected' : ''}>${!['PIC','SIC','COP','OBS','OPE'].includes(c.duty) ? c.duty : '---'}</option>
                    </select>
                </td>
                <td><input type="text" class="crew-input" value="${c.empNo}" onchange="app.updateCrew(${i}, 'empNo', this.value)"></td>
                <td style="padding-left: 10px;"><input type="text" class="crew-input" style="text-align: left;" value="${c.name}" onchange="app.updateCrew(${i}, 'name', this.value)"></td>
                <td>
                    <select class="crew-input" onchange="app.handleSelectChange(${i}, 'rank', this.value)">
                        <option value="CAP" ${c.rank === 'CAP' ? 'selected' : ''}>CAP</option>
                        <option value="COP" ${c.rank === 'COP' ? 'selected' : ''}>COP</option>
                        <option value="TR" ${c.rank === 'TR' ? 'selected' : ''}>TR</option>
                        <option value="other" ${!['CAP','COP','TR'].includes(c.rank) ? 'selected' : ''}>${!['CAP','COP','TR'].includes(c.rank) ? c.rank : '---'}</option>
                    </select>
                </td>
                <td class="no-print">
                    ${i > 1 ? `<button class="btn-danger btn-small" onclick="app.removeCrew(${i})">✖</button>` : ''}
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    updateCrew(index, field, val) {
        this.state.crew[index][field] = val.toUpperCase();
        this.saveConfig();
    },

    updateCrewPilot(type, id) {
        if (type === 'takeoff') this.state.takeoffPilotId = id;
        if (type === 'landing') this.state.landingPilotId = id;
        this.saveConfig();
    },

    addCrew() {
        const newId = this.state.crew.length > 0 ? Math.max(...this.state.crew.map(c => c.id)) + 1 : 1;
        this.state.crew.push({ id: newId, duty: 'OBS', empNo: '', name: '', rank: 'COP' });
        this.saveConfig();
        this.renderCrew();
    },

    removeCrew(index) {
        if (index <= 1) return;
        const cId = this.state.crew[index].id;
        if (this.state.takeoffPilotId === cId) this.state.takeoffPilotId = null;
        if (this.state.landingPilotId === cId) this.state.landingPilotId = null;
        this.state.crew.splice(index, 1);
        this.saveConfig();
        this.renderCrew();
    },

    setPflToggle(field, val) {
        if(!this.state.postFlightLog) return;
        this.state.postFlightLog[field] = val;
        
        if (field === 'domInt') {
            document.getElementById('btnPflDom').classList.toggle('active', val === 'DOM');
            document.getElementById('btnPflInt').classList.toggle('active', val === 'INT');
            if (this.calcPflTimes) this.calcPflTimes();
        } else if (field === 'activeDuty') {
            document.getElementById('btnPflPic').classList.toggle('active', val === 'PIC');
            document.getElementById('btnPflSic').classList.toggle('active', val === 'SIC');
            document.getElementById('btnPflCop').classList.toggle('active', val === 'COP');
            if (this.calcPflTimes) this.calcPflTimes();
        }
        this.saveConfig();
    },

    updatePfl(field, val, isDuration = false) {
        if(!this.state.postFlightLog) return;
        
        if (isDuration && val && !val.includes('.')) {
            if (val.length <= 2) val = "0." + val.padStart(2, '0');
            else val = val.slice(0, -2) + "." + val.slice(-2);
        }
        
        this.state.postFlightLog[field] = val;
        this.saveConfig();
        this.renderPostFlightLog();
    },

    calcPflTimes() {
        if(!this.state.postFlightLog || !this.state.times.bo || !this.state.times.bi) return;
        const bo = this.toMin(this.state.times.bo);
        const bi = this.toMin(this.state.times.bi);
        if (isNaN(bo) || isNaN(bi)) return;

        let diff = bi - bo;
        if (diff < 0) diff += 1440;
        const fltTimeStr = this.formatLegTime(diff);

        this.state.postFlightLog.fltTime = fltTimeStr;
        
        const duty = this.state.postFlightLog.activeDuty;
        if (duty === 'PIC') {
            this.state.postFlightLog.picTime = fltTimeStr;
            this.state.postFlightLog.sicTime = '';
            this.state.postFlightLog.copTime = '';
        } else if (duty === 'SIC') {
            this.state.postFlightLog.picTime = '';
            this.state.postFlightLog.sicTime = fltTimeStr;
            this.state.postFlightLog.copTime = '';
        } else if (duty === 'COP') {
            this.state.postFlightLog.picTime = '';
            this.state.postFlightLog.sicTime = '';
            this.state.postFlightLog.copTime = fltTimeStr;
        }

        const domInt = this.state.postFlightLog.domInt;
        this.state.postFlightLog.depTime = this.convertZtoLocal(this.state.times.bo, domInt);
        this.state.postFlightLog.arrTime = this.convertZtoLocal(this.state.times.bi, domInt);

        this.saveConfig();
        this.renderPostFlightLog();
    },

    convertZtoLocal(zTime, domInt) {
        if (!zTime || zTime.length !== 4) return zTime;
        if (domInt === 'INT') return zTime; 
        let m = this.toMin(zTime) + 540; 
        return this.toHHMM(m % 1440);
    },

    renderPostFlightLog() {
        if(!this.state.postFlightLog) return;
        
        let printPfl = document.getElementById('print-pfl-container');
        if (!printPfl) {
            printPfl = document.createElement('div');
            printPfl.id = 'print-pfl-container';
            const section = document.querySelector('.pfl-section');
            if (section) section.appendChild(printPfl);
            
            const style = document.createElement('style');
            style.innerHTML = `
                @media screen { #print-pfl-container { display: none; } }
                @media print {
                    #print-pfl-container { display: block; width: 100%; margin-top: 10px; }
                    .pfl-scroll-wrapper { display: none; }
                    .pfl-header-controls { display: none; }
                    .print-pfl-table { width: 100%; border-collapse: collapse; margin-bottom: 2mm; }
                    .print-pfl-table th, .print-pfl-table td { font-size: 7px; border-bottom: 1px dashed black; text-align: center; padding: 2px; }
                }
            `;
            document.head.appendChild(style);
        }
        
        const pfl = this.state.postFlightLog;
        
        if (document.getElementById('btnPflDom')) {
            document.getElementById('btnPflDom').classList.toggle('active', pfl.domInt === 'DOM');
            document.getElementById('btnPflInt').classList.toggle('active', pfl.domInt === 'INT');
            document.getElementById('btnPflPic').classList.toggle('active', pfl.activeDuty === 'PIC');
            document.getElementById('btnPflSic').classList.toggle('active', pfl.activeDuty === 'SIC');
            document.getElementById('btnPflCop').classList.toggle('active', pfl.activeDuty === 'COP');
        }

        const keys1 = ['day', 'type', 'reg', 'dep', 'arr', 'depTime', 'arrTime', 'tkof', 'ldg'];
        const keys2 = ['fltNumber', 'fltTime', 'picTime', 'sicTime', 'ngtPicSic', 'copTime', 'ngtCop', 'imc', 'apchType'];
        
        const buildTr = (keys) => {
            return `<tr>${keys.map(k => `<td>${pfl[k] || ''}</td>`).join('')}</tr>`;
        };
        const buildTh = (keys) => {
            const labels = {
                day:'DAY', type:'TYPE', reg:'REG', dep:'DEP', arr:'ARR', depTime:'DEP TIME', arrTime:'ARR TIME', tkof:'TKOF', ldg:'LDG',
                fltNumber:'FLT NUMBER', fltTime:'FLT TIME', picTime:'PIC TIME', sicTime:'SIC TIME', ngtPicSic:'NGT(PIC/SIC)', copTime:'COP TIME', ngtCop:'NGT(COP)', imc:'IMC', apchType:'APCH TYPE'
            };
            return `<tr>${keys.map(k => `<th>${labels[k]}</th>`).join('')}</tr>`;
        };

        if (printPfl) {
            printPfl.innerHTML = `
                <table class="print-pfl-table">
                    <thead>${buildTh(keys1)}</thead><tbody>${buildTr(keys1)}</tbody>
                </table>
                <table class="print-pfl-table">
                    <thead>${buildTh(keys2)}</thead><tbody>${buildTr(keys2)}</tbody>
                </table>
            `;
        }

        const fields = ['day', 'type', 'reg', 'dep', 'arr', 'depTime', 'arrTime', 'tkof', 'ldg', 'fltNumber', 'fltTime', 'picTime', 'sicTime', 'ngtPicSic', 'copTime', 'ngtCop', 'imc', 'apchType'];
        fields.forEach(f => {
            const el = document.getElementById('pfl_' + f);
            if (el && document.activeElement !== el) el.value = pfl[f] || '';
        });
    },
    
    // ★ 修正箇所：オフライン（ローカルファイル）でも確実にコピーできるように改修！
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
        
        const btn = document.getElementById('btnPflCsv');
        const originalText = btn.textContent;
        
        const successAction = () => {
            btn.textContent = '✅ COPIED!';
            btn.style.backgroundColor = 'var(--success-color)';
            btn.style.color = '#fff';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.backgroundColor = '';
                btn.style.color = '';
            }, 2000);
        };

        // 1. セキュア環境（HTTPS）であれば最新のAPIを使用
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(csvString);
                successAction();
            } catch (err) {
                console.warn('Clipboard API failed, trying fallback...', err);
                this.fallbackCopyTextToClipboard(csvString, successAction);
            }
        } else {
            // 2. ローカルファイルや非セキュア環境では旧式のコピー方法へ自動切り替え
            this.fallbackCopyTextToClipboard(csvString, successAction);
        }
    },

    // ★ 追加：旧式のコピー手法（透明なメモ帳を作って強引にコピーさせる）
    fallbackCopyTextToClipboard(text, successCallback) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        // 画面外に隠す
        textArea.style.position = "fixed";
        textArea.style.top = "0";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            const successful = document.execCommand('copy');
            if (successful) {
                successCallback();
            } else {
                alert("コピーに失敗しました。");
            }
        } catch (err) {
            alert("コピーに失敗しました。手動でコピーしてください。");
        }
        document.body.removeChild(textArea);
    }
});