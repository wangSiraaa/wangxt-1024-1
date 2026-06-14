const WarehouseModule = {

    init() {
        this.bindInboundForm();
        this.bindQcForm();
        this.bindExchangeForm();
        this.renderWarehouseList();
        this.refreshAllSelects();
        this.bindExchangeAutoFill();
    },

    bindInboundForm() {
        const form = document.getElementById('inboundForm');
        if (!form) return;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitInbound();
        });

        const returnSelect = document.getElementById('inboundReturnId');
        if (returnSelect) {
            returnSelect.addEventListener('change', () => {
                const warning = document.getElementById('inboundWarning');
                if (returnSelect.value && warning) {
                    warning.style.display = 'block';
                } else if (warning) {
                    warning.style.display = 'none';
                }
            });
        }
    },

    bindQcForm() {
        const form = document.getElementById('qcForm');
        if (!form) return;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitQc();
        });
    },

    bindExchangeForm() {
        const form = document.getElementById('exchangeForm');
        if (!form) return;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitExchangeLock();
        });
    },

    bindExchangeAutoFill() {
        const returnSelect = document.getElementById('exchangeReturnId');
        if (returnSelect) {
            returnSelect.addEventListener('change', () => {
                this.autoFillExchangeInfo();
            });
        }
        const lockQty = document.getElementById('lockQty');
        if (lockQty) {
            lockQty.addEventListener('input', () => {
                this.checkExchangeStock();
            });
        }
    },

    autoFillExchangeInfo() {
        const returnId = document.getElementById('exchangeReturnId').value;
        if (!returnId) return;

        const returnItem = Storage.getById(Storage.KEYS.RETURNS, returnId);
        if (!returnItem) return;

        const originSku = Storage.getById(Storage.KEYS.SKUS, returnItem.skuRef);
        const targetSize = returnItem.exchangeSize;

        let targetSku = null;
        if (originSku && targetSize) {
            const skus = Storage.get(Storage.KEYS.SKUS);
            targetSku = skus.find(s =>
                s.skuCode.replace(/\-[^-]+$/, '-' + targetSize) === s.skuCode ? false :
                (s.size === targetSize && s.skuName === originSku.skuName)
            );
            if (!targetSku) {
                targetSku = skus.find(s => s.size === targetSize);
            }
        }

        document.getElementById('exchangeTargetSku').value = targetSku ? targetSku.skuCode : (originSku ? originSku.skuCode : '');
        document.getElementById('exchangeTargetSize').value = targetSize || '-';
        document.getElementById('exchangeAvailableStock').value = targetSku ? targetSku.stock : 0;

        this.checkExchangeStock();
    },

    checkExchangeStock() {
        const returnId = document.getElementById('exchangeReturnId').value;
        const lockQty = parseInt(document.getElementById('lockQty').value) || 1;
        const warning = document.getElementById('stockWarning');
        const btn = document.querySelector('#exchangeForm button[type="submit"]');

        if (!returnId) {
            if (warning) warning.style.display = 'none';
            return;
        }

        const returnItem = Storage.getById(Storage.KEYS.RETURNS, returnId);
        if (!returnItem) return;

        const originSku = Storage.getById(Storage.KEYS.SKUS, returnItem.skuRef);
        const targetSize = returnItem.exchangeSize;

        let targetSku = null;
        if (originSku && targetSize) {
            const skus = Storage.get(Storage.KEYS.SKUS);
            targetSku = skus.find(s => s.size === targetSize && s.skuName === originSku.skuName);
            if (!targetSku) {
                targetSku = skus.find(s => s.size === targetSize);
            }
        }

        const stockCheck = Rules.checkStockAvailable(targetSku, lockQty);
        if (warning) {
            warning.style.display = stockCheck.available ? 'none' : 'block';
            warning.textContent = `❌ ${stockCheck.reason}`;
        }
    },

    submitInbound() {
        const returnId = document.getElementById('inboundReturnId').value;
        if (!returnId) {
            showToast('请选择退换申请', 'error');
            return;
        }

        const returnItem = Storage.getById(Storage.KEYS.RETURNS, returnId);
        const validation = Rules.validateWarehouseInbound(returnItem);
        if (!validation.valid) {
            showToast(validation.errors[0], 'error');
            return;
        }

        const feedbackCheck = Rules.checkFeedbackRequired(returnItem);
        if (!feedbackCheck.canProceed) {
            if (!confirm(feedbackCheck.reason + '，入库后原因将锁定。是否确认入库？')) return;
        }

        const data = {
            returnId: returnId,
            warehouseCode: document.getElementById('warehouseCode').value,
            receivedQty: document.getElementById('receivedQty').value,
            inboundTime: document.getElementById('inboundTime').value || new Date().toISOString(),
            packageStatus: document.getElementById('inboundPackage').value,
            matchStatus: document.getElementById('inboundMatch').value,
            remark: document.getElementById('inboundRemark').value
        };

        if (!data.receivedQty || parseInt(data.receivedQty) <= 0) {
            showToast('请输入实收数量', 'error');
            return;
        }

        const inbound = Models.createInbound(data);
        Storage.add(Storage.KEYS.INBOUND_RECORDS, inbound);

        Storage.update(Storage.KEYS.RETURNS, returnId, {
            hasInbound: true,
            reasonLocked: true,
            status: 'qc_pending',
            inboundRecordId: inbound.id
        });

        showToast('入库成功，退换原因已锁定', 'success');
        document.getElementById('inboundForm').reset();
        document.getElementById('inboundWarning').style.display = 'none';
        this.renderWarehouseList();
        this.refreshAllSelects();
        this.refreshOthers();
    },

    submitQc() {
        const returnId = document.getElementById('qcReturnId').value;
        if (!returnId) {
            showToast('请选择退换申请', 'error');
            return;
        }

        const returnItem = Storage.getById(Storage.KEYS.RETURNS, returnId);
        const validation = Rules.validateQcSubmission(returnItem);
        if (!validation.valid) {
            showToast(validation.errors[0], 'error');
            return;
        }

        const result = document.getElementById('qcResult').value;
        if (!result) {
            showToast('请选择质检结果', 'error');
            return;
        }

        const data = {
            returnId: returnId,
            result: result,
            sizeCheck: document.getElementById('qcSizeCheck').value,
            resellable: document.getElementById('qcResellable').value,
            stain: document.getElementById('qcStain').value,
            wear: document.getElementById('qcWear').value,
            inspector: document.getElementById('qcInspector').value,
            qcTime: document.getElementById('qcTime').value || new Date().toISOString(),
            remark: document.getElementById('qcRemark').value
        };

        const qcResult = Models.createQcResult(data);
        Storage.add(Storage.KEYS.QC_RESULTS, qcResult);

        let newStatus = 'qc_pass';
        if (result === 'reject') {
            newStatus = 'qc_reject';
        } else if (result === 'arbitration' || Rules.getArbitrationRequired(returnItem, data, null)) {
            newStatus = 'arbitration';
        } else if (result === 'partial') {
            newStatus = 'refund_pending';
        } else if (returnItem.returnType === 'exchange') {
            newStatus = 'qc_pass';
        } else {
            newStatus = 'refund_pending';
        }

        Storage.update(Storage.KEYS.RETURNS, returnId, {
            qcResult: result,
            qcRecordId: qcResult.id,
            status: newStatus,
            reasonLocked: true
        });

        if (result === 'pass' && returnItem.returnType === 'refund') {
            const originSku = Storage.getById(Storage.KEYS.SKUS, returnItem.skuRef);
            if (originSku && data.resellable === 'yes') {
                Storage.update(Storage.KEYS.SKUS, originSku.id, {
                    stock: (parseInt(originSku.stock) || 0) + (parseInt(returnItem.quantity) || 0)
                });
            }
        }

        showToast(`质检完成：${result === 'pass' ? '通过' : result === 'reject' ? '不通过' : result === 'arbitration' ? '需仲裁' : '部分通过'}`, 'success');
        document.getElementById('qcForm').reset();
        this.renderWarehouseList();
        this.refreshAllSelects();
        this.refreshOthers();
    },

    submitExchangeLock() {
        const returnId = document.getElementById('exchangeReturnId').value;
        if (!returnId) {
            showToast('请选择换货申请', 'error');
            return;
        }

        const returnItem = Storage.getById(Storage.KEYS.RETURNS, returnId);
        const lockQty = parseInt(document.getElementById('lockQty').value) || 1;

        const originSku = Storage.getById(Storage.KEYS.SKUS, returnItem.skuRef);
        const targetSize = returnItem.exchangeSize;

        let targetSku = null;
        if (originSku && targetSize) {
            const skus = Storage.get(Storage.KEYS.SKUS);
            targetSku = skus.find(s => s.size === targetSize && s.skuName === originSku.skuName);
            if (!targetSku) {
                targetSku = skus.find(s => s.size === targetSize);
            }
        }

        const validation = Rules.validateExchangeLock(returnItem, targetSku, lockQty);
        if (!validation.valid) {
            showToast(validation.errors[0], 'error');
            return;
        }

        if (targetSku) {
            Storage.update(Storage.KEYS.SKUS, targetSku.id, {
                stock: (parseInt(targetSku.stock) || 0) - lockQty
            });
        }

        Storage.update(Storage.KEYS.RETURNS, returnId, {
            stockLocked: true,
            lockedQty: lockQty,
            lockedSkuId: targetSku ? targetSku.id : null,
            status: 'exchange_locked',
            expectedShipDate: document.getElementById('expectedShipDate').value || null
        });

        showToast('换货锁库成功，库存已扣减', 'success');
        document.getElementById('exchangeForm').reset();
        document.getElementById('stockWarning').style.display = 'none';
        this.renderWarehouseList();
        this.refreshAllSelects();
        this.refreshOthers();
    },

    renderWarehouseList() {
        const tbody = document.getElementById('warehouseList');
        if (!tbody) return;

        const filterStatus = document.getElementById('whFilterStatus') ? document.getElementById('whFilterStatus').value : '';
        let returns = Storage.get(Storage.KEYS.RETURNS);

        if (filterStatus) {
            returns = returns.filter(r => {
                if (filterStatus === 'warehouse_pending') return r.status === 'warehouse_pending';
                if (filterStatus === 'warehouse_in') return r.hasInbound && (r.status === 'warehouse_in' || r.status === 'qc_pending');
                if (filterStatus === 'qc_pending') return r.status === 'qc_pending';
                if (filterStatus === 'qc_pass') return r.status === 'qc_pass' || r.status === 'exchange_locked' || r.status === 'refund_pending';
                if (filterStatus === 'qc_reject') return r.status === 'qc_reject';
                return r.status === filterStatus;
            });
        }

        if (returns.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state">暂无仓库处理数据</td></tr>';
            return;
        }

        tbody.innerHTML = returns.map(r => {
            const qcResultLabels = {
                'pass': '通过', 'reject': '不通过', 'partial': '部分通过', 'arbitration': '需仲裁'
            };
            return `
                <tr>
                    <td><strong>${r.id}</strong></td>
                    <td>${r.orderId || '-'}</td>
                    <td>${r.skuCode || '-'}</td>
                    <td><span class="badge ${r.hasInbound ? 'badge-success' : 'badge-warning'}">${r.hasInbound ? '已入库' : '待入库'}</span></td>
                    <td>${r.qcResult ? `<span class="badge ${r.qcResult === 'pass' ? 'badge-success' : r.qcResult === 'reject' ? 'badge-danger' : 'badge-warning'}">${qcResultLabels[r.qcResult] || r.qcResult}</span>` : '待质检'}</td>
                    <td><span class="badge ${r.stockLocked ? 'badge-info' : 'badge-default'}">${r.stockLocked ? '已锁库' : (r.returnType === 'exchange' ? '待锁库' : '不涉及')}</span></td>
                    <td><span class="badge ${r.reasonLocked ? 'badge-danger' : 'badge-success'}">${r.reasonLocked ? '🔒 已锁定' : '可修改'}</span></td>
                    <td>
                        ${!r.hasInbound ? `<span class="action-link" onclick="WarehouseModule.goToInbound('${r.id}')">入库</span>` : ''}
                        ${r.hasInbound && !r.qcResult ? `<span class="action-link" onclick="WarehouseModule.goToQc('${r.id}')">质检</span>` : ''}
                        ${r.returnType === 'exchange' && r.qcResult === 'pass' && !r.stockLocked ? `<span class="action-link" onclick="WarehouseModule.goToExchange('${r.id}')">换货锁库</span>` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    },

    goToInbound(returnId) {
        document.querySelectorAll('.sub-tab-btn[data-subtab="wh-inbound"]').forEach(btn => btn.click());
        setTimeout(() => {
            const el = document.getElementById('inboundReturnId');
            if (el) el.value = returnId;
            document.getElementById('inboundWarning').style.display = 'block';
        }, 100);
    },

    goToQc(returnId) {
        document.querySelectorAll('.sub-tab-btn[data-subtab="wh-qc"]').forEach(btn => btn.click());
        setTimeout(() => {
            const el = document.getElementById('qcReturnId');
            if (el) el.value = returnId;
        }, 100);
    },

    goToExchange(returnId) {
        document.querySelectorAll('.sub-tab-btn[data-subtab="wh-exchange"]').forEach(btn => btn.click());
        setTimeout(() => {
            const el = document.getElementById('exchangeReturnId');
            if (el) {
                el.value = returnId;
                this.autoFillExchangeInfo();
            }
        }, 100);
    },

    refreshAllSelects() {
        const returns = Storage.get(Storage.KEYS.RETURNS);

        const inboundPending = returns.filter(r => !r.hasInbound && (r.status === 'warehouse_pending' || r.status === 'buyer_submitted'));
        const inboundEl = document.getElementById('inboundReturnId');
        if (inboundEl) {
            inboundEl.innerHTML = '<option value="">请选择待入库申请</option>' +
                inboundPending.map(r => `<option value="${r.id}">${r.id} (${r.orderId || ''})</option>`).join('');
        }

        const qcPending = returns.filter(r => r.hasInbound && !r.qcResult && r.status !== 'rejected' && r.status !== 'returned');
        const qcEl = document.getElementById('qcReturnId');
        if (qcEl) {
            qcEl.innerHTML = '<option value="">请选择待质检申请</option>' +
                qcPending.map(r => `<option value="${r.id}">${r.id} (${r.orderId || ''})</option>`).join('');
        }

        const exchangePending = returns.filter(r =>
            r.returnType === 'exchange' &&
            r.qcResult === 'pass' &&
            !r.stockLocked &&
            r.status !== 'completed'
        );
        const exchangeEl = document.getElementById('exchangeReturnId');
        if (exchangeEl) {
            exchangeEl.innerHTML = '<option value="">请选择换货申请</option>' +
                exchangePending.map(r => `<option value="${r.id}">${r.id} (${r.orderId || ''} → ${r.exchangeSize || '?'})</option>`).join('');
        }
    },

    refreshOthers() {
        if (typeof CustomerService !== 'undefined') CustomerService.renderReturnList();
        if (typeof BuyerModule !== 'undefined') BuyerModule.refreshAll();
        if (typeof RefundModule !== 'undefined') RefundModule.refreshAll();
        if (typeof ArbitrationModule !== 'undefined') ArbitrationModule.refreshAll();
    }
};
