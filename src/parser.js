// ====== parser.js ======
// NAVLOGのテキスト読み込み、およびパース（データ抽出）処理
Object.assign(app, {
    
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
        
        const regex = /(?:\(\s*\d+\s*\)\s+(?:-\s*){4,6}(?:\(\s*(-?\d+)\s*\))?[\s\S]{1,150}?)?(\d{2}\.\d{2})\s+[NS]\d{5}[EW]\d{5,6}[\s\.]+(\d+\.\d{2})\s+(CLM|DEC|\d{5})?\s*(\d{3}\.\d)\s*([+-]\d{2}|\.{1,2})?\s*(\d{6}|\.{1,2})?\s*([\d\/]{5}|\.{1,2})?[\s\S]{1,150}?(\d{2}\.\d{2})\s+([A-Z0-9\-]+)\s+\.\s+(\d{3})\s+FL.*?(?:\s+|\/)(\d{2}|\.{1,2})\s*$/gm;
        
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

        // =========================================================
        // ★ フェーズ1：WINDS/TEMP ALOFT FCST 抽出・紐付けロジック
        // =========================================================
        const fcstSection = text.split("-WINDS/TEMP ALOFT FCST")[1];
        if (fcstSection) {
            const lines = fcstSection.split('\n')
                .map(l => l.trim())
                .filter(l => l !== '' && !l.includes('token=') && !l.includes('ページ'));

            if (lines.length > 0) {
                // 1. 高度ヘッダー (例: 12000 18000...) を取得
                const heights = lines[0].split(/\s+/);
                
                // 2. 予報セクション内の「WPT名リスト」と「データ行」を分離
                let nameList = [];
                let dataStartIndex = 1;
                for (let i = 1; i < lines.length; i++) {
                    if (lines[i].match(/^\d{7}/)) { // 7桁以上の数字(2820P00等)で始まる行はデータ
                        dataStartIndex = i;
                        break;
                    }
                    nameList = nameList.concat(lines[i].split(/\s+/));
                }

                const dataLines = lines.slice(dataStartIndex);

                // 3. 【ポインター・マッチング】メイン表のWPTと、予報のWPT名を突き合わせ
                let fcstPointer = 0;
                waypoints.forEach((wp, wpIdx) => {
                    if (wpIdx === 0) return; // 出発空港は予報がないためスキップ

                    // 予報ポインターがまだ残っているか確認
                    if (fcstPointer < nameList.length) {
                        // メイン表のWPT名と、予報側のWPT名が一致するかチェック
                        if (wp.name === nameList[fcstPointer]) {
                            // 一致したらデータを取り込む
                            if (dataLines[fcstPointer]) {
                                const rowValues = dataLines[fcstPointer].trim().split(/\s+/);
                                wp.forecast = {};
                                heights.forEach((h, hIdx) => {
                                    wp.forecast[h] = rowValues[hIdx] || "---"; // 高度をキーにして保存
                                });
                            }
                            // 無事に紐付けられたので、ポインターを1つ進める（消費する）
                            fcstPointer++;
                        }
                    }
                });
                
                // 確認用ログ（PCブラウザの「開発者ツール」等で確認できます）
                console.log(`[Phase 1 完了] WIND/TEMP 予報: ${nameList.length}地点中、${fcstPointer}地点の紐付けに成功しました！`);
            }
        }
        // =========================================================

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
        if(this.renderCrewMemo) this.renderCrewMemo();
        this.render();
        this.renderFlightMeta();

        this.saveFlightToHistory();
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
    }
});