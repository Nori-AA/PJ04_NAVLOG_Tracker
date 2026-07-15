// ====== history.js ======
// フライト履歴・データ管理ロジック
Object.assign(app, {
    saveFlightToHistory() {
        if (!this.state.flightMeta || this.state.flightMeta.flt === "---") return;
        const meta = this.state.flightMeta;
        const entry = { date: meta.date, flt: meta.flt, dep: meta.dep, dest: meta.dest, crew: JSON.parse(JSON.stringify(this.state.crew)) };
        this.state.flightHistory = this.state.flightHistory.filter(h => !(h.date === entry.date && h.flt === entry.flt));
        this.state.flightHistory.unshift(entry);
        if (this.state.flightHistory.length > 5) this.state.flightHistory.pop();
    },

    syncCrewToHistory() {
        if (!this.state.flightMeta || this.state.flightMeta.flt === "---" || !this.state.flightHistory || this.state.flightHistory.length === 0) return;
        const meta = this.state.flightMeta;
        const idx = this.state.flightHistory.findIndex(h => h.date === meta.date && h.flt === meta.flt);
        if (idx !== -1) this.state.flightHistory[idx].crew = JSON.parse(JSON.stringify(this.state.crew));
    },

    renderFlightHistory() {
        const area = document.getElementById('historyArea'), list = document.getElementById('historyList');
        if (!area || !list) return;
        if (this.state.flightHistory.length === 0) { area.style.display = 'none'; return; }
        area.style.display = 'block'; list.innerHTML = '';
        this.state.flightHistory.forEach((h, idx) => {
            const otherCrewNames = h.crew.map(c => c.name).filter(name => name !== '' && name.trim() !== '').join(', ');
            const div = document.createElement('div');
            div.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: var(--card-bg); padding: 10px; border-radius: 8px; border: 1px solid var(--border-color);';
            div.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 2px; flex: 1;">
                    <div style="font-size: 13px; font-weight: bold;">📅 ${h.date} &nbsp; ✈️ ${h.flt} <span style="font-weight: normal; color: var(--text-faint); font-size: 11px;">(${h.dep} ➔ ${h.dest})</span></div>
                    <div style="font-size: 11px; color: var(--accent-color);">👨‍✈️ Crew: ${otherCrewNames || '(未入力)'}</div>
                </div>
                <div style="display: flex; gap: 5px; align-items: center;">
                    <button class="btn-secondary btn-small" onclick="app.applyCrewFromHistory(${idx})" style="padding: 5px 8px; font-size: 10px; white-space: nowrap;">[このCrewを適用]</button>
                    <button class="btn-danger btn-small" onclick="app.deleteHistoryEntry(${idx})" style="padding: 5px 8px; font-size: 10px;" title="この履歴を削除">✖</button>
                </div>
            `;
            list.appendChild(div);
        });
    },

    applyCrewFromHistory(index) {
        const h = this.state.flightHistory[index];
        if (h && h.crew) {
            this.state.crew = h.crew.map(c => ({ id: c.id, duty: c.duty, empNo: c.empNo, name: c.name, rank: c.rank }));
            this.state.takeoffPilotId = null; this.state.landingPilotId = null;
            this.saveConfig(); alert(`${h.flt} のCrew編成をセットしました。`);
            if (this.renderCrew) this.renderCrew();
        }
    },

    deleteHistoryEntry(index) { if (confirm("このフライト履歴を削除しますか？")) { this.state.flightHistory.splice(index, 1); this.saveConfig(); this.renderFlightHistory(); } },
    clearFlightHistory() { if (confirm("保存されているフライト履歴(Crew情報)をすべて消去しますか？")) { this.state.flightHistory = []; this.saveConfig(); this.renderFlightHistory(); } }
});