const Storage = {
    KEYS: {
        ORDERS: 'cx_orders',
        SKUS: 'cx_skus',
        RETURNS: 'cx_returns',
        FEEDBACKS: 'cx_feedbacks',
        LOGISTICS: 'cx_logistics',
        QC_RESULTS: 'cx_qc_results',
        REFUNDS: 'cx_refunds',
        ARBITRATIONS: 'cx_arbitrations',
        INBOUND_RECORDS: 'cx_inbound_records'
    },

    get(key) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Storage get error:', e);
            return [];
        }
    },

    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error('Storage set error:', e);
            return false;
        }
    },

    getById(key, id) {
        const list = this.get(key);
        return list.find(item => item.id === id);
    },

    add(key, item) {
        const list = this.get(key);
        list.unshift(item);
        this.set(key, list);
        return item;
    },

    update(key, id, updates) {
        const list = this.get(key);
        const index = list.findIndex(item => item.id === id);
        if (index !== -1) {
            list[index] = { ...list[index], ...updates, updatedAt: new Date().toISOString() };
            this.set(key, list);
            return list[index];
        }
        return null;
    },

    remove(key, id) {
        const list = this.get(key);
        const filtered = list.filter(item => item.id !== id);
        this.set(key, filtered);
        return filtered.length !== list.length;
    },

    clearAll() {
        Object.values(this.KEYS).forEach(key => localStorage.removeItem(key));
    }
};

function generateId(prefix) {
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function formatDateTime(date) {
    if (!date) return '';
    const d = new Date(date);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toDateTimeLocal(date) {
    if (!date) return '';
    const d = new Date(date);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show ' + type;
    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}
