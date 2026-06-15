const App = {

    init() {
        this.bindTabNavigation();
        this.bindSubTabNavigation();
        this.startClock();
        this.initModules();
    },

    bindTabNavigation() {
        const tabs = document.querySelectorAll('.tab-btn');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                const tabId = tab.dataset.tab;
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                const target = document.getElementById('tab-' + tabId);
                if (target) target.classList.add('active');

                this.refreshModuleByTab(tabId);
            });
        });
    },

    bindSubTabNavigation() {
        const subTabs = document.querySelectorAll('.sub-tab-btn');
        subTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const parent = tab.closest('.module-container');
                if (!parent) return;

                parent.querySelectorAll('.sub-tab-btn').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                const subTabId = tab.dataset.subtab;
                parent.querySelectorAll('.sub-tab-content').forEach(c => c.classList.remove('active'));
                const target = document.getElementById('subtab-' + subTabId);
                if (target) target.classList.add('active');
            });
        });
    },

    refreshModuleByTab(tabId) {
        switch (tabId) {
            case 'cs':
                if (typeof CustomerService !== 'undefined') {
                    CustomerService.refreshAllSelects();
                    CustomerService.renderOrderList();
                    CustomerService.renderSkuList();
                    CustomerService.renderReturnList();
                }
                break;
            case 'buyer':
                if (typeof BuyerModule !== 'undefined') BuyerModule.refreshAll();
                break;
            case 'warehouse':
                if (typeof WarehouseModule !== 'undefined') {
                    WarehouseModule.renderWarehouseList();
                    WarehouseModule.refreshAllSelects();
                }
                break;
            case 'refund':
                if (typeof RefundModule !== 'undefined') RefundModule.refreshAll();
                break;
            case 'arbitration':
                if (typeof ArbitrationModule !== 'undefined') ArbitrationModule.refreshAll();
                break;
            case 'analysis':
                if (typeof AnalysisModule !== 'undefined') {
                    AnalysisModule.renderStats();
                    AnalysisModule.renderReasonChart();
                    AnalysisModule.renderSizeAnalysis();
                }
                break;
        }
    },

    startClock() {
        const update = () => {
            const el = document.getElementById('currentTime');
            if (!el) return;
            const now = new Date();
            const pad = n => String(n).padStart(2, '0');
            el.textContent = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} (本地时间)`;
        };
        update();
        setInterval(update, 1000);
    },

    initModules() {
        if (typeof CustomerService !== 'undefined') CustomerService.init();
        if (typeof BuyerModule !== 'undefined') BuyerModule.init();
        if (typeof WarehouseModule !== 'undefined') WarehouseModule.init();
        if (typeof RefundModule !== 'undefined') RefundModule.init();
        if (typeof ArbitrationModule !== 'undefined') ArbitrationModule.init();
        if (typeof AnalysisModule !== 'undefined') AnalysisModule.init();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();

    if (window.location.hash === '#demo' || localStorage.getItem('cx_autodemo') === '1') {
        localStorage.removeItem('cx_autodemo');
        setTimeout(() => {
            document.querySelectorAll('.tab-btn[data-tab="analysis"]').forEach(b => b.click());
            setTimeout(() => {
                document.querySelectorAll('.sub-tab-btn[data-subtab="ana-demo"]').forEach(b => b.click());
                setTimeout(() => {
                    if (typeof AnalysisModule !== 'undefined') {
                        AnalysisModule.initAllDemoData();
                    }
                }, 200);
            }, 200);
        }, 300);
    }
});

window.renderReturnList = () => {
    if (typeof CustomerService !== 'undefined') CustomerService.renderReturnList();
};

window.renderWarehouseList = () => {
    if (typeof WarehouseModule !== 'undefined') WarehouseModule.renderWarehouseList();
};

window.calculateRefund = () => {
    if (typeof RefundModule !== 'undefined') RefundModule.calculateRefund();
};

window.autoFillRefundData = () => {
    if (typeof RefundModule !== 'undefined') RefundModule.autoFillRefundData();
};

window.loadArbitrationDetail = () => {
    if (typeof ArbitrationModule !== 'undefined') ArbitrationModule.loadArbitrationDetail();
};

window.demoScenarioOverdue = () => {
    if (typeof AnalysisModule !== 'undefined') AnalysisModule.demoScenarioOverdue();
};

window.demoScenarioNoFeedback = () => {
    if (typeof AnalysisModule !== 'undefined') AnalysisModule.demoScenarioNoFeedback();
};

window.demoScenarioReasonLocked = () => {
    if (typeof AnalysisModule !== 'undefined') AnalysisModule.demoScenarioReasonLocked();
};

window.demoScenarioStockShortage = () => {
    if (typeof AnalysisModule !== 'undefined') AnalysisModule.demoScenarioStockShortage();
};

window.demoScenarioArbitration = () => {
    if (typeof AnalysisModule !== 'undefined') AnalysisModule.demoScenarioArbitration();
};

window.initAllDemoData = () => {
    if (typeof AnalysisModule !== 'undefined') AnalysisModule.initAllDemoData();
};

window.clearAllData = () => {
    if (!confirm('确定要清空所有业务数据吗？此操作不可恢复。')) return;
    if (typeof AnalysisModule !== 'undefined') AnalysisModule.clearAllData();
};
