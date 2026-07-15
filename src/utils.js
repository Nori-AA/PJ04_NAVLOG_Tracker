// ====== utils.js ======
// 汎用計算・フォーマット・気象解析ユーティリティ
Object.assign(app, {
    // ★追加: 時間入力のサニタイズ（数字と '+' のみ許可）
    sanitizeTimeInput(val) {
        if (!val) return '';
        return String(val).replace(/[^0-9+]/g, '');
    },

    // ★追加: 燃料入力のサニタイズ（数字と '.' のみ許可、重複排除、先頭ドット補正）
    sanitizeFuelInput(val) {
        if (!val) return '';
        let s = String(val).replace(/[^0-9.]/g, '');
        // 小数点が複数ある場合は最初の1つだけ残す
        const parts = s.split('.');
        if (parts.length > 2) {
            s = parts[0] + '.' + parts.slice(1).join('');
        }
        // 先頭が小数点なら0を補完
        if (s.startsWith('.')) {
            s = '0' + s;
        }
        return s;
    },

    parseLegTime(str) { if (!str || str === "---") return 0; const p = str.split('.'), h = parseInt(p[0], 10) || 0, m = parseInt(p[1], 10) || 0; return (h * 60) + m; },
    formatLegTime(m) { return String(Math.floor(m / 60)).padStart(2, '0') + '.' + String(m % 60).padStart(2, '0'); },
    toMin(s) { return parseInt(s.slice(0,2), 10)*60 + parseInt(s.slice(2,4), 10); },
    toHHMM(m) { let tm = Math.round(m); return String(Math.floor(tm/60)%24).padStart(2,'0') + String(tm%60).padStart(2,'0'); },
    diffMin(act, est) { let d = act - est; while(d > 720) d -= 1440; while(d < -720) d += 1440; return d; },

    formatWindTemp(raw) {
        if (!raw || raw === "---") return "---";
        const match = raw.match(/^(\d{2})(\d{2})([PM])?(\d{2})?$/);
        if (!match) return raw;
        
        let dirCode = parseInt(match[1], 10);
        let spdCode = parseInt(match[2], 10);
        
        let dir, spd;
        if (dirCode === 99) { dir = "VRB"; spd = spdCode; } 
        else if (dirCode >= 50) { dir = (dirCode - 50) * 10; spd = spdCode + 100; } 
        else { dir = dirCode * 10; spd = spdCode; }
        
        let dirStr = dir === "VRB" ? "VRB" : String(dir).padStart(3, '0');
        let spdStr = String(spd).padStart(3, '0');
        
        let tempStr = "";
        if (match[3] && match[4]) {
            let sign = match[3] === 'M' ? '-' : '';
            tempStr = " " + sign + match[4];
        }
        return `${dirStr}/${spdStr}${tempStr}`;
    },

    getAltFeet(altStr) {
        if (!altStr || altStr === '---') return null;
        let targetNum = parseInt(altStr.replace(/\D/g, ''));
        if (isNaN(targetNum)) return null;
        if (altStr.includes('FL') || targetNum < 1000) targetNum *= 100; 
        return targetNum;
    },

    getISA(altFeet) {
        if (altFeet >= 36089) return -56.5; 
        return 15.0 - (0.0019812 * altFeet);
    },

    getClosestAlt(forecastObj, targetAltStr) {
        if (!forecastObj || Object.keys(forecastObj).length === 0) return null;
        const targetNum = this.getAltFeet(targetAltStr);
        if (targetNum === null) return null;
        
        const alts = Object.keys(forecastObj).map(Number).sort((a, b) => a - b);
        let closest = alts[0];
        let minDiff = Math.abs(targetNum - closest);
        
        for (let i = 1; i < alts.length; i++) {
            let diff = Math.abs(targetNum - alts[i]);
            if (diff < minDiff) { closest = alts[i]; minDiff = diff; } 
            else if (diff === minDiff) { if (alts[i] > closest) closest = alts[i]; } 
        }
        return String(closest);
    }
});