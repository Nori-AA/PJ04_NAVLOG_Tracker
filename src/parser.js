// ====== parser.js ======
// NAVLOGのテキスト読み込み、およびパース（データ抽出）処理
Object.assign(app, {
    
    // --- ★追加: エラー時に初期画面へ強制帰還する安全装置 ---
    abortAndReturn(errorMessage) {
        if (errorMessage) {
            alert(errorMessage);
        }
        const elementsToHide = ['flightHeader', 'headerInfoCard', 'forecastInfoCard', 'crewInfoCard', 'tableContainer', 'statusBar', 'bottomControls', 'settingsPanel'];
        elementsToHide.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        
        const titleEl = document.getElementById('defaultTitle');
        if (titleEl) titleEl.style.display = 'block';
        
        const inputArea = document.getElementById('inputArea');
        if (inputArea) inputArea.style.display = 'block';
        
        document.body.style.overflow = '';
    },

    // --- ★修正: Swift(iPad)とWebブラウザを自動判別 ---
    openPDFPicker() {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.pdfPickerHandler) {
            // iPadのSwiftネイティブ環境なら、Swift側にPDF選択画面を開かせる
            window.webkit.messageHandlers.pdfPickerHandler.postMessage('pickPDF');
        } else {
            // Webブラウザ環境なら、HTMLの隠しファイル選択（PDF用）をクリックさせる
            document.getElementById('webPdfInput').click();
        }
    },

    // --- ★追加: WebブラウザでPDFが選ばれた時の処理（PDF.jsを使用） ---
    // --- ★修正: WebブラウザでPDFが選ばれた時の処理（自動ダウンロード機能付き） ---
    async handleWebPDFUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            // ① PDF.jsライブラリが存在しない場合、ネットから「動的」にダウンロードしてくる最強の仕組み
            if (!window.pdfjsLib) {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
            }

            // ② 解析エンジンの裏方（Worker）をセット
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

            // ③ PDFの読み込みとテキスト抽出
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
            let fullText = "";

            // 全ページをループ
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                
                let lastY = -1;
                let pageText = "";
                
                // 文字のY座標が変わったら改行するロジック
                for (const item of textContent.items) {
                    if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 5) {
                        pageText += "\n";
                    }
                    pageText += item.str;
                    lastY = item.transform[5];
                }
                fullText += pageText + "\n";
            }
            
            // 抽出完了！いつもの最強パーサーに丸投げする
            this.processData(fullText);
            
            // 連続で同じファイルを選べるように入力をリセット
            event.target.value = '';
            
        } catch (e) {
            console.error(e);
            this.abortAndReturn("Web版でのPDF解析に失敗しました。\nファイルが破損しているか、通信環境が不安定な可能性があります。");
            event.target.value = '';
        }
    },

    // --- ★追加: SwiftからのPDF読み込み時 ---
    loadFromSwiftPDF(text) {
        if (!text || text.trim() === '') {
            return alert("PDFからテキストを抽出できませんでした。");
        }
        try {
            this.processData(text);
        } catch (parseError) {
            console.error(parseError);
            this.abortAndReturn("PDFの解析中にエラーが発生しました。\n正しいNAVLOGのPDFか確認してください。");
        }
    },
    
    // --- 修正: エラー保護 ---
    async loadFromClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            if (!text || text.trim() === '') return alert("クリップボードが空です。");
            
            try {
                this.processData(text);
            } catch (parseError) {
                console.error(parseError);
                this.abortAndReturn("データの解析に失敗しました。\n関係ないテキストが含まれている可能性があります。");
            }
        } catch (err) {
            alert("読み込みに失敗しました。ファイルを選択してください。");
        }
    },

    // --- 修正: エラー保護 ---
    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => { 
            try {
                this.processData(e.target.result); 
            } catch (parseError) {
                console.error(parseError);
                this.abortAndReturn("ファイルの解析に失敗しました。\n正しいNAVLOGデータか確認してください。");
            }
        };
        reader.readAsText(file);
    },

    processData(text) {
        // 全体を保護し、エラーがあれば上の呼び出し元（catch）に投げる
        try {
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
            
            // ★修正: データが0件の場合は強制帰還させる
            if (waypoints.length <= 1) {
                return this.abortAndReturn("データを抽出できませんでした。正しいNAVLOGテキストか確認してください。");
            }
            
            if (waypoints.length > 1 && waypoints[1].rtme !== "---") {
                const firstWpRtmeMin = this.parseLegTime(waypoints[1].rtme);
                const firstWpZtmeMin = waypoints[1].ztmeMin;
                waypoints[0].rtme = this.formatLegTime(firstWpRtmeMin + firstWpZtmeMin);
            }

            // =========================================================
            // WINDS/TEMP ALOFT FCST 抽出・整形・紐付けロジック
            // =========================================================
            const fcstSection = text.split("-WINDS/TEMP ALOFT FCST")[1];
            if (fcstSection) {
                const lines = fcstSection.split('\n').map(l => l.trim());

                let heights = [];
                let allWptNames = [];
                let allDataRows = [];
                let isHeaderFound = false;
                let fdDataLine = "";

                for (let i = 0; i < lines.length; i++) {
                    let line = lines[i];

                    if (line === '' || line === '_' || line.includes('ipobs-aps') || line.includes('token=') || line.includes('ページ')) {
                        continue;
                    }

                    if (line.includes('FD DATA') || line.includes('BASED ON')) {
                        fdDataLine = line;
                        continue;
                    }

                    if (!isHeaderFound) {
                        if (line.match(/^(\d{4,5}\s+)+\d{4,5}$/)) {
                            heights = line.split(/\s+/);
                            isHeaderFound = true;
                        }
                        continue;
                    }

                    let tokens = line.split(/\s+/).filter(t => t !== '');
                    let rowData = [];

                    for (let t of tokens) {
                        if (/^\d{4}([PM]\d{2})?$/.test(t)) {
                            rowData.push(t);
                        } else {
                            allWptNames.push(t);
                        }
                    }

                    if (rowData.length > 0) {
                        allDataRows.push(rowData);
                    }
                }

                let formattedLines = [];
                if (fdDataLine) formattedLines.push(fdDataLine);

                if (heights.length > 0) {
                    let str = "".padEnd(8, " ");
                    heights.forEach(h => str += h.padStart(8, " "));
                    formattedLines.push(str);
                }

                for (let i = 0; i < allDataRows.length; i++) {
                    let wptName = allWptNames[i] || "???";
                    if (wptName.length > 8) wptName = wptName.substring(0, 8); 
                    let str = wptName.padEnd(8, " ");
                    
                    let rowData = allDataRows[i];
                    rowData.forEach(d => str += d.padStart(8, " "));
                    formattedLines.push(str);
                }

                this.state.rawForecastText = formattedLines.join('\n');

                let fcstPointer = 0;
                let matchedCount = 0;
                waypoints.forEach((wp, wpIdx) => {
                    if (wpIdx === 0) return; 
                    let foundIdx = allWptNames.indexOf(wp.name, fcstPointer);
                    if (foundIdx !== -1) {
                        if (allDataRows[foundIdx]) {
                            const rowValues = allDataRows[foundIdx];
                            wp.forecast = {};
                            heights.forEach((h, hIdx) => {
                                wp.forecast[h] = rowValues[hIdx] || "---";
                            });
                            matchedCount++;
                        }
                        fcstPointer = foundIdx + 1;
                    }
                });
                console.log(`[Phase 1] WIND/TEMP 紐付け完了: ${matchedCount} / ${allWptNames.length}`);
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
            
            if (this.showMainUI) this.showMainUI(); 

            document.getElementById('tableBody').innerHTML = ''; 
            this.calculate();
            if(this.renderCrew) this.renderCrew();
            this.renderTimes();
            this.renderActualFuel();
            if(this.renderPostFlightLog) this.renderPostFlightLog();
            if(this.renderCrewMemo) this.renderCrewMemo();
            
            if(this.renderForecastCard) this.renderForecastCard();

            this.render();
            this.renderFlightMeta();

            this.saveFlightToHistory();
        } catch (e) {
            throw e; // エラーが発生した場合は上位のcatchに投げる
        }
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