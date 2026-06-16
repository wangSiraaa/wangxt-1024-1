const WarehouseModule = {

    CROSS_WAREHOUSE_SHIPPING_COSTS: {
        'same': 0,
        'domestic_to_bonded': 15,
        'overseas_to_domestic': 45,
        'overseas_to_bonded': 40,
        'bonded_to_overseas': 50,
        'cross_overseas': 60
    },

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

        const matchStatus = document.getElementById('inboundMatch').value;
        const wearConditionEl = document.getElementById('inboundWearCondition');
        const wearCondition = wearConditionEl ? wearConditionEl.value : 'none';
        const sizeMatchReasonEl = document.getElementById('inboundSizeMatchReason');
        const sizeMatchReason = sizeMatchReasonEl ? sizeMatchReasonEl.value : (matchStatus !== 'yes' ? '入库时与申请不一致' : '');

        const data = {
            returnId: returnId,
            warehouseCode: document.getElementById('warehouseCode').value,
            receivedQty: document.getElementById('receivedQty').value,
            inboundTime: document.getElementById('inboundTime').value || new Date().toISOString(),
            packageStatus: document.getElementById('inboundPackage').value,
            matchStatus: matchStatus,
            remark: document.getElementById('inboundRemark').value,
            sizeMatchReason: sizeMatchReason,
            wearCondition: wearCondition
        };

        if (!data.receivedQty || parseInt(data.receivedQty) <= 0) {
            showToast('请输入实收数量', 'error');
            return;
        }

        const inbound = Models.createInbound(data);
        Storage.add(Storage.KEYS.INBOUND_RECORDS, inbound);

        const hasMismatch = matchStatus !== 'yes' || wearCondition !== 'none';
        const updates = {
            hasInbound: true,
            reasonLocked: true,
            inboundRecordId: inbound.id,
            originWarehouse: data.warehouseCode
        };

        if (hasMismatch) {
            updates.qcMismatchTriggered = true;
            updates.status = 'qc_mismatch_recheck';
            updates.sizeMatchReason = sizeMatchReason;
            updates.wearCondition = wearCondition;
        } else {
            updates.status = 'qc_pending';
        }

        Storage.update(Storage.KEYS.RETURNS, returnId, updates);

        if (hasMismatch) {
            showToast('入库成功，检测到不一致情况，已进入质检复核流程', 'warning');
        } else {
            showToast('入库成功，退换原因已锁定', 'success');
        }

        document.getElementById('inboundForm').reset();
        const inboundWarning = document.getElementById('inboundWarning');
        if (inboundWarning) inboundWarning.style.display = 'none';
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

        const feedbacks = Storage.get(Storage.KEYS.FEEDBACKS).filter(f => f.returnId === returnId);
        const feedback = feedbacks.length > 0 ? feedbacks[0] : null;

        let mismatchWithFeedback = false;
        let mismatchDetail = '';
        if (feedback) {
            const mismatchCheck = Rules.checkQcMismatch(returnItem, data, feedback);
            if (mismatchCheck && mismatchCheck.mismatch) {
                mismatchWithFeedback = true;
                mismatchDetail = mismatchCheck.detail || mismatchCheck.reason || '';
            }
        }

        data.mismatchWithFeedback = mismatchWithFeedback;
        data.mismatchDetail = mismatchDetail;

        const qcResult = Models.createQcResult(data);
        Storage.add(Storage.KEYS.QC_RESULTS, qcResult);

        const returnUpdates = {
            qcResult: result,
            qcRecordId: qcResult.id,
            reasonLocked: true
        };

        if (mismatchWithFeedback) {
            returnUpdates.qcMismatchTriggered = true;
            returnUpdates.qcMismatchReason = mismatchDetail;
            const costEstimation = Rules.estimateMismatchCost(returnItem, mismatchDetail);
            if (costEstimation) {
                returnUpdates.costEstimation = costEstimation;
            }
        }

        let newStatus = 'qc_pass';
        if (result === 'reject') {
            newStatus = 'qc_reject';
        } else if (result === 'arbitration' || Rules.getArbitrationRequired(returnItem, data, null)) {
            newStatus = 'arbitration';
        } else if (result === 'partial') {
            newStatus = 'refund_pending';
        } else if (mismatchWithFeedback && result !== 'arbitration') {
            newStatus = 'qc_mismatch_recheck';
        } else if (result === 'pass' && returnItem.returnType === 'exchange') {
            newStatus = 'qc_pass';
        } else if (result === 'pass') {
            newStatus = 'refund_pending';
        }

        returnUpdates.status = newStatus;
        Storage.update(Storage.KEYS.RETURNS, returnId, returnUpdates);

        if (result === 'pass' && returnItem.returnType === 'refund') {
            const originSku = Storage.getById(Storage.KEYS.SKUS, returnItem.skuRef);
            if (originSku && data.resellable === 'yes') {
                Storage.update(Storage.KEYS.SKUS, originSku.id, {
                    stock: (parseInt(originSku.stock) || 0) + (parseInt(returnItem.quantity) || 0)
                });
            }
        }

        if (result === 'pass' && returnItem.returnType === 'exchange' && !mismatchWithFeedback) {
            this.checkCrossWarehouseStockForExchange(returnItem);
        }

        let resultMsg = '';
        if (result === 'pass') {
            resultMsg = mismatchWithFeedback ? '质检通过，但与买家反馈不一致，需复核' : '质检通过';
        } else if (result === 'reject') {
            resultMsg = '质检不通过';
        } else if (result === 'arbitration') {
            resultMsg = '需仲裁判定';
        } else {
            resultMsg = '部分通过';
        }
        showToast(`质检完成：${resultMsg}`, mismatchWithFeedback ? 'warning' : 'success');

        document.getElementById('qcForm').reset();
        this.renderWarehouseList();
        this.refreshAllSelects();
        this.refreshOthers();
    },

    checkCrossWarehouseStockForExchange(returnItem) {
        if (!returnItem || returnItem.returnType !== 'exchange') return;

        const originWarehouse = returnItem.originWarehouse;
        const targetWarehouse = returnItem.targetWarehouse || originWarehouse;

        if (targetWarehouse !== originWarehouse) {
            const originSku = Storage.getById(Storage.KEYS.SKUS, returnItem.skuRef);
            if (!originSku) return;

            const skus = Storage.get(Storage.KEYS.SKUS);
            const targetSize = returnItem.exchangeSize;
            let targetSku = null;
            if (targetSize) {
                targetSku = skus.find(s => s.size === targetSize && s.skuName === originSku.skuName);
                if (!targetSku) {
                    targetSku = skus.find(s => s.size === targetSize);
                }
            }

            if (targetSku) {
                const stockCheck = Rules.checkCrossWarehouseStock(targetSku, targetWarehouse, returnItem.quantity || 1);
                if (stockCheck && !stockCheck.available) {
                    showToast(`目标仓库${Models.WAREHOUSES[targetWarehouse] ? Models.WAREHOUSES[targetWarehouse].name : targetWarehouse}库存不足，换货可能需跨仓调货`, 'warning');
                }
            }
        }
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

        const originWarehouse = returnItem.originWarehouse;
        const targetWarehouseEl = document.getElementById('exchangeTargetWarehouse');
        const targetWarehouse = targetWarehouseEl ? targetWarehouseEl.value : (returnItem.targetWarehouse || originWarehouse);

        const isCrossWarehouse = targetWarehouse !== originWarehouse;

        let validation;
        if (isCrossWarehouse) {
            const crossStockCheck = Rules.checkCrossWarehouseStock(targetSku, targetWarehouse, lockQty);
            validation = Rules.validateExchangeLock(returnItem, targetSku, lockQty);
            if (crossStockCheck && !crossStockCheck.available && validation.valid) {
                validation = {
                    valid: false,
                    errors: [`目标仓库${Models.WAREHOUSES[targetWarehouse] ? Models.WAREHOUSES[targetWarehouse].name : targetWarehouse}库存不足：${crossStockCheck.reason}`],
                    stockCheck: crossStockCheck
                };
            }
        } else {
            validation = Rules.validateExchangeLock(returnItem, targetSku, lockQty);
        }

        if (!validation.valid) {
            showToast(validation.errors[0], 'error');
            return;
        }

        if (isCrossWarehouse && !confirm(`检测到跨仓换货：${Models.WAREHOUSES[originWarehouse] ? Models.WAREHOUSES[originWarehouse].name : originWarehouse} → ${Models.WAREHOUSES[targetWarehouse] ? Models.WAREHOUSES[targetWarehouse].name : targetWarehouse}，将产生额外跨仓运费。是否确认？`)) {
            return;
        }

        const crossType = Models.getWarehouseCrossType(originWarehouse, targetWarehouse);
        const crossWarehouseShippingCost = this.CROSS_WAREHOUSE_SHIPPING_COSTS[crossType] || 0;

        if (isCrossWarehouse && targetSku) {
            const warehouseStocks = Object.assign({}, targetSku.warehouseStocks || {});
            const currentStock = parseInt(warehouseStocks[targetWarehouse]) || 0;
            warehouseStocks[targetWarehouse] = Math.max(0, currentStock - lockQty);
            Storage.update(Storage.KEYS.SKUS, targetSku.id, {
                stock: (parseInt(targetSku.stock) || 0) - lockQty,
                warehouseStocks: warehouseStocks
            });
        } else if (targetSku) {
            Storage.update(Storage.KEYS.SKUS, targetSku.id, {
                stock: (parseInt(targetSku.stock) || 0) - lockQty
            });
        }

        Storage.update(Storage.KEYS.RETURNS, returnId, {
            stockLocked: true,
            lockedQty: lockQty,
            lockedSkuId: targetSku ? targetSku.id : null,
            status: 'exchange_locked',
            expectedShipDate: document.getElementById('expectedShipDate').value || null,
            targetWarehouse: targetWarehouse,
            warehouseCrossType: crossType,
            crossWarehouseShippingCost: crossWarehouseShippingCost
        });

        if (isCrossWarehouse) {
            showToast(`换货锁库成功（跨仓：${Models.WAREHOUSE_CROSS_TYPES[crossType] || crossType}），跨仓运费：$${crossWarehouseShippingCost}`, 'success');
        } else {
            showToast('换货锁库成功，库存已扣减', 'success');
        }

        document.getElementById('exchangeForm').reset();
        const stockWarning = document.getElementById('stockWarning');
        if (stockWarning) stockWarning.style.display = 'none';
        const crossIndicator = document.getElementById('crossWarehouseIndicator');
        if (crossIndicator) crossIndicator.style.display = 'none';
        this.renderWarehouseList();
        this.refreshAllSelects();
        this.refreshOthers();
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
            targetSku = skus.find(s => s.size === targetSize && s.skuName === originSku.skuName);
            if (!targetSku) {
                targetSku = skus.find(s => s.size === targetSize);
            }
        }

        const targetWarehouseEl = document.getElementById('exchangeTargetWarehouse');
        const targetWarehouse = targetWarehouseEl ? targetWarehouseEl.value : (returnItem.targetWarehouse || returnItem.originWarehouse);
        const originWarehouse = returnItem.originWarehouse;

        let availableStock = 0;
        let warehouseStockDisplay = '';

        if (targetSku) {
            availableStock = parseInt(targetSku.stock) || 0;

            if (targetWarehouse && targetSku.warehouseStocks && targetSku.warehouseStocks[targetWarehouse] !== undefined) {
                availableStock = parseInt(targetSku.warehouseStocks[targetWarehouse]) || 0;
                warehouseStockDisplay = `${Models.WAREHOUSES[targetWarehouse] ? Models.WAREHOUSES[targetWarehouse].name : targetWarehouse}: ${availableStock}`;
            }

            const warehouseStocks = targetSku.warehouseStocks || {};
            const stockParts = [];
            Object.keys(warehouseStocks).forEach(wh => {
                const whName = Models.WAREHOUSES[wh] ? Models.WAREHOUSES[wh].name : wh;
                stockParts.push(`${whName}: ${warehouseStocks[wh]}`);
            });
            if (stockParts.length > 0) {
                warehouseStockDisplay = stockParts.join(' | ');
            }
        }

        document.getElementById('exchangeTargetSku').value = targetSku ? targetSku.skuCode : (originSku ? originSku.skuCode : '');
        document.getElementById('exchangeTargetSize').value = targetSize || '-';

        const stockEl = document.getElementById('exchangeAvailableStock');
        if (stockEl) {
            stockEl.value = warehouseStockDisplay || availableStock;
        }

        const crossIndicator = document.getElementById('crossWarehouseIndicator');
        if (crossIndicator) {
            if (targetWarehouse && originWarehouse && targetWarehouse !== originWarehouse) {
                const crossType = Models.getWarehouseCrossType(originWarehouse, targetWarehouse);
                const crossLabel = Models.WAREHOUSE_CROSS_TYPES[crossType] || crossType;
                const shippingCost = this.CROSS_WAREHOUSE_SHIPPING_COSTS[crossType] || 0;
                crossIndicator.innerHTML = `🔄 跨仓换货：${crossLabel}${shippingCost > 0 ? `，跨仓运费：$${shippingCost}` : ''}`;
                crossIndicator.style.display = 'block';
            } else {
                crossIndicator.style.display = 'none';
            }
        }

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

        const targetWarehouseEl = document.getElementById('exchangeTargetWarehouse');
        const targetWarehouse = targetWarehouseEl ? targetWarehouseEl.value : (returnItem.targetWarehouse || returnItem.originWarehouse);
        const originWarehouse = returnItem.originWarehouse;

        let stockCheck;
        if (targetWarehouse && originWarehouse && targetWarehouse !== originWarehouse) {
            stockCheck = Rules.checkCrossWarehouseStock(targetSku, targetWarehouse, lockQty);
        } else {
            stockCheck = Rules.checkStockAvailable(targetSku, lockQty);
        }

        if (warning) {
            if (!stockCheck || !stockCheck.available) {
                let warnMsg = stockCheck ? stockCheck.reason : '库存不足';
                if (targetWarehouse && originWarehouse && targetWarehouse !== originWarehouse) {
                    const whName = Models.WAREHOUSES[targetWarehouse] ? Models.WAREHOUSES[targetWarehouse].name : targetWarehouse;
                    warnMsg = `[跨仓] ${whName} - ${warnMsg}`;
                }
                warning.textContent = `❌ ${warnMsg}`;
                warning.style.display = 'block';
            } else {
                let okMsg = stockCheck.reason || '库存充足';
                if (targetWarehouse && originWarehouse && targetWarehouse !== originWarehouse) {
                    const whName = Models.WAREHOUSES[targetWarehouse] ? Models.WAREHOUSES[targetWarehouse].name : targetWarehouse;
                    const crossType = Models.getWarehouseCrossType(originWarehouse, targetWarehouse);
                    const crossLabel = Models.WAREHOUSE_CROSS_TYPES[crossType] || '';
                    okMsg = `[${crossLabel}] ${whName} - ${okMsg}`;
                }
                warning.textContent = `✅ ${okMsg}`;
                warning.style.display = 'block';
            }
        }
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
                if (filterStatus === 'qc_pending') return r.status === 'qc_pending' || r.status === 'qc_mismatch_recheck';
                if (filterStatus === 'qc_pass') return r.status === 'qc_pass' || r.status === 'exchange_locked' || r.status === 'refund_pending';
                if (filterStatus === 'qc_reject') return r.status === 'qc_reject';
                return r.status === filterStatus;
            });
        }

        if (returns.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="empty-state">暂无仓库处理数据</td></tr>';
            return;
        }

        const qcResultLabels = {
            'pass': '通过', 'reject': '不通过', 'partial': '部分通过', 'arbitration': '需仲裁'
        };

        tbody.innerHTML = returns.map(r => {
            const inboundRecords = Storage.get(Storage.KEYS.INBOUND_RECORDS).filter(i => i.returnId === r.id);
            const lastInbound = inboundRecords.length > 0 ? inboundRecords[0] : null;
            const inboundWarehouse = lastInbound ? (Models.WAREHOUSES[lastInbound.warehouseCode] ? Models.WAREHOUSES[lastInbound.warehouseCode].name : lastInbound.warehouseCode) : '-';

            let qcBadge = '待质检';
            let qcBadgeClass = 'badge-default';
            if (r.qcResult) {
                qcBadge = qcResultLabels[r.qcResult] || r.qcResult;
                qcBadgeClass = r.qcResult === 'pass' ? 'badge-success' : r.qcResult === 'reject' ? 'badge-danger' : 'badge-warning';
            }
            if (r.qcMismatchTriggered) {
                qcBadge += ' ⚠️';
                qcBadgeClass = 'badge-danger';
            }

            let lockBadge = r.returnType === 'exchange' ? '待锁库' : '不涉及';
            let lockBadgeClass = 'badge-default';
            if (r.stockLocked) {
                lockBadge = '已锁库';
                lockBadgeClass = 'badge-info';
                if (r.targetWarehouse && r.originWarehouse && r.targetWarehouse !== r.originWarehouse) {
                    const crossType = Models.getWarehouseCrossType(r.originWarehouse, r.targetWarehouse);
                    lockBadge += ` 🔄${Models.WAREHOUSE_CROSS_TYPES[crossType] || ''}`;
                }
            }

            return `
                <tr>
                    <td><strong>${r.id}</strong></td>
                    <td>${r.orderId || '-'}</td>
                    <td>${r.skuCode || '-'}</td>
                    <td>${inboundWarehouse}</td>
                    <td><span class="badge ${r.hasInbound ? 'badge-success' : 'badge-warning'}">${r.hasInbound ? '已入库' : '待入库'}</span></td>
                    <td><span class="badge ${qcBadgeClass}">${qcBadge}</span></td>
                    <td><span class="badge ${lockBadgeClass}">${lockBadge}</span></td>
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
                qcPending.map(r => `<option value="${r.id}">${r.id} (${r.orderId || ''})${r.qcMismatchTriggered ? ' ⚠️' : ''}</option>`).join('');
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
                exchangePending.map(r => {
                    const crossLabel = (r.targetWarehouse && r.originWarehouse && r.targetWarehouse !== r.originWarehouse) ? ' 🔄' : '';
                    return `<option value="${r.id}">${r.id} (${r.orderId || ''} → ${r.exchangeSize || '?'})${crossLabel}</option>`;
                }).join('');
        }
    },

    refreshOthers() {
        if (typeof CustomerService !== 'undefined') CustomerService.renderReturnList();
        if (typeof BuyerModule !== 'undefined') BuyerModule.refreshAll();
        if (typeof RefundModule !== 'undefined') RefundModule.refreshAll();
        if (typeof ArbitrationModule !== 'undefined') ArbitrationModule.refreshAll();
    },

    goToInbound(returnId) {
        document.querySelectorAll('.sub-tab-btn[data-subtab="wh-inbound"]').forEach(btn => btn.click());
        setTimeout(() => {
            const el = document.getElementById('inboundReturnId');
            if (el) el.value = returnId;
            const warning = document.getElementById('inboundWarning');
            if (warning) warning.style.display = 'block';
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
    }
};
