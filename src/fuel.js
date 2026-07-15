// ====== fuel.js ======
// 燃料・時間計算、ステータスバー表示ロジック
Object.assign(app, {
    updateActualFuel(field, val) { 
        // ★保護：サニタイズ（安全装置）を実行
        if (this.sanitizeFuelInput) val = this.sanitizeFuelInput(val);

        if (field === 'fob') this.state.actFob = val; 
        if (field === 'fod') this.state.actFod = val; 
        this.saveConfig(); 
        
        // ★修正：UIへ補正された値を強制的に書き戻す
        this.renderActualFuel();
    },
    
    renderActualFuel() {
        const fobEl = document.getElementById('actFob'); if (fobEl && document.activeElement !== fobEl) fobEl.value = this.state.actFob || '';
        const fodEl = document.getElementById('actFod'); if (fodEl && document.activeElement !== fodEl) fodEl.value = this.state.actFod || '';
    },

    calculate() {
        let pTimeMin = null, pFuel = null, cAlt = null, oAlt = null;
        this.state.waypoints.forEach((wp, i) => {
            if (wp.actualAlt !== '') { wp.estAltDisplay = wp.actualAlt; cAlt = wp.actualAlt; oAlt = wp.plannedAlt; }
            else { if (cAlt !== null && wp.plannedAlt === oAlt) wp.estAltDisplay = cAlt; else { cAlt = null; oAlt = null; wp.estAltDisplay = wp.plannedAlt; } }
            
            let autoWind = wp.plannedZwind;
            let autoTmp = wp.plannedTmp;
            
            if (wp.estAltDisplay !== wp.plannedAlt && wp.forecast && Object.keys(wp.forecast).length > 0) {
                const closestAlt = this.getClosestAlt(wp.forecast, wp.estAltDisplay);
                if (closestAlt) {
                    const rawData = wp.forecast[closestAlt];
                    if (rawData && rawData !== "---") {
                        const decodedStr = this.formatWindTemp(rawData); 
                        const parts = decodedStr.split(' ');
                        if (parts.length >= 1) autoWind = parts[0];
                        if (parts.length >= 2) autoTmp = parts[1];
                    }
                }
            }
            
            wp.estZwindDisplay = wp.actualZwind !== '' ? wp.actualZwind : autoWind;
            wp.estTmpDisplay = wp.actualTmp !== '' ? wp.actualTmp : autoTmp;
            
            const currentAltFeet = this.getAltFeet(wp.estAltDisplay);
            if (currentAltFeet !== null && wp.estTmpDisplay && wp.estTmpDisplay !== '---') {
                const currentTmpNum = parseInt(wp.estTmpDisplay, 10);
                if (!isNaN(currentTmpNum)) {
                    const isaTemp = this.getISA(currentAltFeet);
                    wp.calcIsaDev = Math.round(currentTmpNum - isaTemp); 
                } else {
                    wp.calcIsaDev = null;
                }
            } else {
                wp.calcIsaDev = null;
            }
            
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
        if (lastTimeIdx !== -1) { elEtaLast.textContent = `(Last: ${wps[lastTimeIdx].name})`; elEtaLast.style.display = 'inline'; elEtaLast.onclick = () => app.scrollToRow(lastTimeIdx); } else { elEtaLast.style.display = 'none'; }
        const elFuelLast = document.getElementById('sb-fuel-last');
        if (lastFuelIdx !== -1) { elFuelLast.textContent = `(Last: ${wps[lastFuelIdx].name})`; elFuelLast.style.display = 'inline'; elFuelLast.onclick = () => app.scrollToRow(lastFuelIdx); } else { elFuelLast.style.display = 'none'; }

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
                if (diff < 0) { etaDiffDisp = `(${diff}m)`; etaClass = 'diff-ahead'; } else if (diff > 0) { etaDiffDisp = `(+${diff}m)`; etaClass = 'diff-behind'; } else { etaDiffDisp = '(On Time)'; }
            }
        }
        document.getElementById('sb-eta').textContent = etaDisp;
        const elEtaDiff = document.getElementById('sb-eta-diff'); elEtaDiff.textContent = etaDiffDisp; elEtaDiff.className = etaClass ? `status-badge ${etaClass}` : 'status-badge';
        
      
        let destFuelDisp = finalFuel !== null ? finalFuel.toFixed(1) : '--', destFuelDiffDisp = '', destFuelClass = '';
        if (finalFuel !== null) {
            let diff = finalFuel - last.plannedFuel;
            if (diff > 0) { destFuelDiffDisp = `(+${diff.toFixed(1)})`; destFuelClass = 'diff-ahead'; } else if (diff < 0) { destFuelDiffDisp = `(${diff.toFixed(1)})`; destFuelClass = 'diff-behind'; } else { destFuelDiffDisp = '(±0.0)'; }
        }
        document.getElementById('sb-dest-fuel').textContent = destFuelDisp;
        const elFuelDiff = document.getElementById('sb-dest-fuel-diff'); elFuelDiff.textContent = destFuelDiffDisp; elFuelDiff.className = destFuelClass ? `status-badge ${destFuelClass}` : 'status-badge';

        const planFodEl = document.getElementById('sb-plan-fod-display'); if (planFodEl && last) planFodEl.textContent = `Plan FOD: ${last.plannedFuel.toFixed(1)}`;

        const sb = document.getElementById('statusBar'), warningEl = document.getElementById('sb-dest-fuel-warning');
        if (finalFuel !== null && this.state.destFuelThreshold > 0 && finalFuel < this.state.destFuelThreshold) { sb.classList.add('status-warning'); if (warningEl) warningEl.innerHTML = '<span class="dest-warning-badge">⚠️ LOW FUEL</span>'; } 
        else { sb.classList.remove('status-warning'); if (warningEl) warningEl.innerHTML = ''; }

        const container = document.getElementById('sb-avail-fuel-container'); container.innerHTML = '';
        let validAltnCount = 0;
        if (finalFuel !== null) {
            this.state.altns.forEach(altn => {
                if (altn.name && altn.name.trim() !== '') {
                    validAltnCount++; const totalReq = parseFloat(altn.fuel) + parseFloat(altn.rsv), avail = finalFuel - totalReq, isLow = avail < this.state.alertThreshold;
                    const div = document.createElement('div'); div.style.display = 'flex'; div.style.alignItems = 'center'; div.style.flexWrap = 'wrap'; div.style.marginBottom = '2px';
                    div.innerHTML = `<span style="font-size: 14px; color: ${isLow ? 'var(--alert-text)' : '#f1c40f'};">[${altn.name}] ${avail.toFixed(1)}</span>${isLow ? `<span class="altn-warning-badge">⚠️ LOW FUEL</span>` : ''}<span style="font-size: 10px; font-weight: normal; margin-left: 8px; opacity: 0.7;">( [${altn.name}] ${totalReq.toFixed(1)} (= ALTN:${parseFloat(altn.fuel).toFixed(1)} + RSV:${parseFloat(altn.rsv).toFixed(1)}) )</span>`;
                    container.appendChild(div);
                }
            });
            if (validAltnCount === 0) {
                const avail = finalFuel, isLow = avail < this.state.alertThreshold;
                const div = document.createElement('div'); div.style.display = 'flex'; div.style.alignItems = 'center';
                div.innerHTML = `<span style="font-size: 14px; color: ${isLow ? 'var(--alert-text)' : '#f1c40f'};">${avail.toFixed(1)}</span>${isLow ? `<span class="altn-warning-badge">⚠️ LOW FUEL</span>` : ''}`;
                container.appendChild(div);
            }
        }

        const etaEl = document.getElementById('sb-eta');
        if (etaEl) { const etaSection = etaEl.closest('.status-section'); if (etaSection) etaSection.classList.add('no-print'); }
        setTimeout(() => this.updateStickyHeight(), 50);
    }
});