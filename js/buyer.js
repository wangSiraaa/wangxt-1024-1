const BuyerModule = {

    init() {
        this.bindFeedbackForm();
        this.bindLogisticsForm();
        this.renderReasonMultiLang();
        this.renderLogisticsList();
        this.renderPendingFeedbackList();
        this.refreshReturnSelects();
    },

    bindFeedbackForm() {
        const form = document.getElementById('feedbackForm');
        if (!form) return;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitFeedback();
        });
    },

    bindLogisticsForm() {
        const form = document.getElementById('logisticsForm');
        if (!form) return;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitLogistics();
        });
    },

    submitFeedback() {
        const returnId = document.getElementById('feedbackReturnId').value;
        if (!returnId) {
            showToast('请选择退换申请', 'error');
            return;
        }

        const data = {
            returnId: returnId,
            tryOnDuration: document.getElementById('tryOnDuration').value,
            hasDamage: document.getElementById('hasDamage').value,
            tagKept: document.getElementById('tagKept').value,
            packageOk: document.getElementById('packageOk').value,
            fitFeeling: document.getElementById('fitFeeling').value,
            descriptionZh: document.getElementById('feedbackDescZh').value,
            descriptionEn: document.getElementById('feedbackDescEn').value,
            images: document.getElementById('feedbackImages').value
        };

        const returnItem = Storage.getById(Storage.KEYS.RETURNS, returnId);
        if (!returnItem) {
            showToast('退换申请不存在', 'error');
            return;
        }

        const feedback = Models.createFeedback(data);
        Storage.add(Storage.KEYS.FEEDBACKS, feedback);

        Storage.update(Storage.KEYS.RETURNS, returnId, {
            hasFeedback: true,
            status: returnItem.status === 'pending' ? 'warehouse_pending' : returnItem.status
        });

        showToast('试穿反馈提交成功', 'success');
        document.getElementById('feedbackForm').reset();
        this.renderPendingFeedbackList();
        this.refreshAll();
    },

    submitLogistics() {
        const returnId = document.getElementById('logisticsReturnId').value;
        if (!returnId) {
            showToast('请选择退换申请', 'error');
            return;
        }

        const trackNode = document.getElementById('trackNode').value;

        const data = {
            returnId: returnId,
            trackingNo: document.getElementById('trackingNo').value,
            carrier: document.getElementById('carrier').value,
            trackTime: document.getElementById('trackTime').value,
            trackNode: trackNode,
            trackLocation: document.getElementById('trackLocation').value,
            description: document.getElementById('trackDesc').value,
            customsStatus: '',
            tariffInfo: '',
            tariffAmount: 0,
            tariffPayer: ''
        };

        if (!data.trackTime || !data.trackNode) {
            showToast('请填写轨迹时间和节点', 'error');
            return;
        }

        if (trackNode === 'customs' || trackNode === 'customs_passed') {
            const customsStatusEl = document.getElementById('customsStatus');
            const tariffInfoEl = document.getElementById('tariffInfo');
            const tariffAmountEl = document.getElementById('tariffAmount');
            const tariffPayerEl = document.getElementById('tariffPayer');

            data.customsStatus = customsStatusEl ? customsStatusEl.value : '';
            data.tariffInfo = tariffInfoEl ? tariffInfoEl.value : '';
            data.tariffAmount = tariffAmountEl ? (parseFloat(tariffAmountEl.value) || 0) : 0;
            data.tariffPayer = tariffPayerEl ? tariffPayerEl.value : '';

            if (!data.customsStatus) {
                showToast('清关节点必须填写清关状态', 'error');
                return;
            }

            const returnItem = Storage.getById(Storage.KEYS.RETURNS, returnId);
            if (returnItem) {
                const tariffUpdates = {};
                if (data.tariffAmount > 0) {
                    tariffUpdates.tariffAmount = data.tariffAmount;
                }
                if (data.tariffPayer) {
                    tariffUpdates.tariffResponsibility = data.tariffPayer;
                }
                if (Object.keys(tariffUpdates).length > 0) {
                    Storage.update(Storage.KEYS.RETURNS, returnId, tariffUpdates);
                }
            }
        }

        const logistics = Models.createLogistics(data);
        Storage.add(Storage.KEYS.LOGISTICS, logistics);

        if (data.trackNode === 'warehouse_received' || data.trackNode === 'arrived_warehouse') {
            const returnItem = Storage.getById(Storage.KEYS.RETURNS, returnId);
            if (returnItem && returnItem.status === 'warehouse_pending') {
            }
        }

        showToast('物流轨迹添加成功', 'success');
        document.getElementById('logisticsForm').reset();
        this.renderLogisticsList();
    },

    renderReasonMultiLang() {
        const container = document.getElementById('reasonMultiLangList');
        if (!container) return;

        const sizeRelated = Models.SIZE_RELATED_REASONS;

        container.innerHTML = Object.entries(Models.REASON_MAP).map(([code, info]) => {
            const isSizeRelated = sizeRelated.includes(code);
            return `
                <div class="reason-item" style="${isSizeRelated ? 'border-color: #1890ff; background: #e6f7ff;' : ''}">
                    <div class="reason-code">${code} ${isSizeRelated ? '📏 尺码相关' : ''}</div>
                    <div class="reason-zh">${info.zh}</div>
                    <div class="reason-en">${info.en}</div>
                </div>
            `;
        }).join('');
    },

    renderLogisticsList() {
        const tbody = document.getElementById('logisticsList');
        if (!tbody) return;
        const logistics = Storage.get(Storage.KEYS.LOGISTICS);

        if (logistics.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="empty-state">暂无物流轨迹数据</td></tr>';
            return;
        }

        const nodeLabels = {
            'buyer_shipped': '买家已发货',
            'in_transit': '运输中',
            'customs': '清关中',
            'customs_passed': '清关完成',
            'arrived_warehouse': '到达仓库',
            'warehouse_received': '仓库签收',
            'returned': '退回买家'
        };

        const customsStatusLabels = {
            'cleared': '已清关',
            'pending': '待清关',
            'blocked': '清关受阻'
        };

        tbody.innerHTML = logistics.map(log => {
            const isCustoms = log.trackNode === 'customs' || log.trackNode === 'customs_passed';
            let customsCol = '-';
            if (isCustoms && log.customsStatus) {
                const csLabel = customsStatusLabels[log.customsStatus] || log.customsStatus;
                const csBadge = log.customsStatus === 'cleared' ? 'badge-success' : log.customsStatus === 'blocked' ? 'badge-danger' : 'badge-warning';
                customsCol = `<span class="badge ${csBadge}">${csLabel}</span>`;
            }
            let tariffCol = '-';
            if (isCustoms && log.tariffAmount > 0) {
                const returnItem = Storage.getById(Storage.KEYS.RETURNS, log.returnId);
                const currency = returnItem ? returnItem.orderCurrency : 'USD';
                const payerLabel = Models.TARIFF_LABEL[log.tariffPayer] || log.tariffPayer || '-';
                tariffCol = `${formatCurrency(log.tariffAmount, currency)} (${payerLabel})`;
            }
            return `
                <tr>
                    <td>${log.returnId}</td>
                    <td>${log.trackingNo || '-'}</td>
                    <td>${log.carrier || '-'}</td>
                    <td>${formatDateTime(log.trackTime)}</td>
                    <td><span class="badge badge-info">${nodeLabels[log.trackNode] || log.trackNode}</span></td>
                    <td>${customsCol}</td>
                    <td>${tariffCol}</td>
                    <td>${log.trackLocation || '-'}</td>
                    <td>${log.description || '-'}</td>
                </tr>
            `;
        }).join('');
    },

    renderPendingFeedbackList() {
        const tbody = document.getElementById('pendingFeedbackList');
        if (!tbody) return;
        const returns = Storage.get(Storage.KEYS.RETURNS);

        const pending = returns.filter(r => {
            const needFeedback = Rules.checkNeedFeedback(r);
            return needFeedback && !r.hasFeedback;
        });

        if (pending.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state">暂无待反馈的申请</td></tr>';
            return;
        }

        tbody.innerHTML = pending.map(r => {
            const applyTime = new Date(r.applyTime || r.createdAt);
            const hours = Math.floor((Date.now() - applyTime.getTime()) / (1000 * 60 * 60));
            const needFeedback = Rules.checkNeedFeedback(r);
            const reasonInfo = Models.REASON_MAP[r.reason] || { zh: r.reason };

            return `
                <tr>
                    <td><strong>${r.id}</strong></td>
                    <td>${r.orderId || '-'}</td>
                    <td>${r.skuCode || '-'}</td>
                    <td>${reasonInfo.zh}</td>
                    <td><span class="badge ${needFeedback ? 'badge-danger' : 'badge-default'}">${needFeedback ? '必须' : '建议'}</span></td>
                    <td><span class="badge ${hours > 48 ? 'badge-danger' : hours > 24 ? 'badge-warning' : 'badge-info'}">${hours}小时</span></td>
                    <td>
                        <span class="action-link" onclick="BuyerModule.goToFeedback('${r.id}')">去反馈</span>
                        <span class="action-link danger" onclick="BuyerModule.returnForNoFeedback('${r.id}')">退回申请</span>
                    </td>
                </tr>
            `;
        }).join('');
    },

    renderCombinedView(returnId) {
        const container = document.getElementById('combinedViewPanel');
        if (!container) return;

        if (!returnId) {
            const selectEl = document.getElementById('combinedViewReturnId');
            returnId = selectEl ? selectEl.value : null;
        }

        if (!returnId) {
            container.innerHTML = '<div class="empty-state">请选择退换申请查看综合信息</div>';
            return;
        }

        const returnItem = Storage.getById(Storage.KEYS.RETURNS, returnId);
        if (!returnItem) {
            container.innerHTML = '<div class="empty-state">退换申请不存在</div>';
            return;
        }

        const feedbacks = Storage.get(Storage.KEYS.FEEDBACKS).filter(f => f.returnId === returnId);
        const logistics = Storage.get(Storage.KEYS.LOGISTICS).filter(l => l.returnId === returnId);
        const inbounds = Storage.get(Storage.KEYS.INBOUND_RECORDS).filter(i => i.returnId === returnId);
        const qcResults = Storage.get(Storage.KEYS.QC_RESULTS).filter(q => q.returnId === returnId);

        const feedback = feedbacks.length > 0 ? feedbacks[0] : null;
        const latestLogistics = logistics.length > 0 ? logistics[0] : null;
        const inbound = inbounds.length > 0 ? inbounds[0] : null;
        const qcResult = qcResults.length > 0 ? qcResults[0] : null;

        const reasonInfo = Models.REASON_MAP[returnItem.reason] || { zh: returnItem.reason, en: returnItem.reason };

        const nodeLabels = {
            'buyer_shipped': '买家已发货',
            'in_transit': '运输中',
            'customs': '清关中',
            'customs_passed': '清关完成',
            'arrived_warehouse': '到达仓库',
            'warehouse_received': '仓库签收',
            'returned': '退回买家'
        };

        const customsStatusLabels = {
            'cleared': '已清关',
            'pending': '待清关',
            'blocked': '清关受阻'
        };

        const fitFeelingLabels = {
            'too_tight': '偏紧',
            'too_loose': '偏松',
            'slight_tight': '略紧',
            'slight_loose': '略松',
            'just_right': '刚好',
            '': '未填写'
        };

        const fitDamageLabels = { 'yes': '是', 'no': '否', '': '未填写' };
        const fitTagLabels = { 'yes': '是', 'no': '否', '': '未填写' };
        const fitPackageLabels = { 'yes': '完好', 'no': '破损', '': '未填写' };

        let feedbackSection = '';
        if (feedback) {
            feedbackSection = `
                <div class="combined-section">
                    <h4>📏 试穿反馈摘要</h4>
                    <div class="combined-grid">
                        <div class="combined-field"><label>试穿时长</label><span>${feedback.tryOnDuration || '-'}</span></div>
                        <div class="combined-field"><label>穿着感受</label><span>${fitFeelingLabels[feedback.fitFeeling] || feedback.fitFeeling || '-'}</span></div>
                        <div class="combined-field"><label>是否有损坏</label><span>${fitDamageLabels[feedback.hasDamage] || '-'}</span></div>
                        <div class="combined-field"><label>吊牌保留</label><span>${fitTagLabels[feedback.tagKept] || '-'}</span></div>
                        <div class="combined-field"><label>包装完好</label><span>${fitPackageLabels[feedback.packageOk] || '-'}</span></div>
                    </div>
                    ${feedback.descriptionZh ? `<div class="combined-desc"><label>中文描述</label><p>${feedback.descriptionZh}</p></div>` : ''}
                    ${feedback.descriptionEn ? `<div class="combined-desc"><label>英文描述</label><p>${feedback.descriptionEn}</p></div>` : ''}
                </div>
            `;
        } else {
            feedbackSection = `
                <div class="combined-section">
                    <h4>📏 试穿反馈摘要</h4>
                    <div class="empty-state" style="padding:10px">暂无试穿反馈${returnItem.hasFeedback ? '' : ' <span class="action-link" onclick="BuyerModule.goToFeedback(\'' + returnId + '\')">去反馈</span>'}</div>
                </div>
            `;
        }

        let logisticsSection = '';
        const logisticsItems = logistics.map(log => {
            const isCustoms = log.trackNode === 'customs' || log.trackNode === 'customs_passed';
            let customsInfo = '';
            let tariffInfo = '';
            if (isCustoms) {
                if (log.customsStatus) {
                    const csLabel = customsStatusLabels[log.customsStatus] || log.customsStatus;
                    const csBadge = log.customsStatus === 'cleared' ? 'badge-success' : log.customsStatus === 'blocked' ? 'badge-danger' : 'badge-warning';
                    customsInfo = `<span class="badge ${csBadge}">${csLabel}</span>`;
                }
                if (log.tariffAmount > 0) {
                    const currency = returnItem.orderCurrency || 'USD';
                    const payerLabel = Models.TARIFF_LABEL[log.tariffPayer] || log.tariffPayer || '-';
                    tariffInfo = `关税: ${formatCurrency(log.tariffAmount, currency)} (${payerLabel})`;
                }
            }
            return `
                <div class="logistics-track-item">
                    <span class="badge badge-info">${nodeLabels[log.trackNode] || log.trackNode}</span>
                    <span>${formatDateTime(log.trackTime)}</span>
                    <span>${log.trackLocation || '-'}</span>
                    ${customsInfo}
                    ${tariffInfo}
                    ${log.description ? `<span class="text-muted">${log.description}</span>` : ''}
                </div>
            `;
        }).join('');

        if (logisticsItems) {
            logisticsSection = `
                <div class="combined-section">
                    <h4>🚚 物流追踪（含清关/关税）</h4>
                    <div class="logistics-track-list">${logisticsItems}</div>
                </div>
            `;
        } else {
            logisticsSection = `
                <div class="combined-section">
                    <h4>🚚 物流追踪（含清关/关税）</h4>
                    <div class="empty-state" style="padding:10px">暂无物流追踪信息</div>
                </div>
            `;
        }

        let warehouseSection = '';
        if (inbound) {
            const whName = Models.WAREHOUSES[inbound.warehouseCode] ? Models.WAREHOUSES[inbound.warehouseCode].name : inbound.warehouseCode;
            const matchLabels = { 'yes': '匹配', 'no': '不匹配', 'partial': '部分匹配' };
            const wearLabels = { 'none': '无穿着痕迹', 'slight': '轻微穿着', 'serious': '严重穿着' };
            const packageLabels = { 'good': '完好', 'damaged': '损坏', 'deformed': '变形' };
            let qcInfo = '';
            if (qcResult) {
                const qcLabels = { 'pass': '通过', 'reject': '不通过', 'partial': '部分通过', 'arbitration': '需仲裁' };
                const qcBadge = qcResult.result === 'pass' ? 'badge-success' : qcResult.result === 'reject' ? 'badge-danger' : 'badge-warning';
                qcInfo = `
                    <div class="combined-field" style="margin-top:8px">
                        <label>质检结果</label>
                        <span class="badge ${qcBadge}">${qcLabels[qcResult.result] || qcResult.result}</span>
                        ${qcResult.mismatchWithFeedback ? '<span class="badge badge-danger">⚠️ 与反馈不一致</span>' : ''}
                    </div>
                `;
            }
            warehouseSection = `
                <div class="combined-section">
                    <h4>🏭 仓库入库结果</h4>
                    <div class="combined-grid">
                        <div class="combined-field"><label>入库仓库</label><span>${whName}</span></div>
                        <div class="combined-field"><label>实收数量</label><span>${inbound.receivedQty}</span></div>
                        <div class="combined-field"><label>包裹状态</label><span>${packageLabels[inbound.packageStatus] || inbound.packageStatus}</span></div>
                        <div class="combined-field"><label>匹配状态</label><span>${matchLabels[inbound.matchStatus] || inbound.matchStatus}</span></div>
                        <div class="combined-field"><label>穿着状况</label><span>${wearLabels[inbound.wearCondition] || inbound.wearCondition}</span></div>
                        <div class="combined-field"><label>入库时间</label><span>${formatDateTime(inbound.inboundTime)}</span></div>
                    </div>
                    ${inbound.remark ? `<div class="combined-desc"><label>入库备注</label><p>${inbound.remark}</p></div>` : ''}
                    ${inbound.sizeMatchReason ? `<div class="combined-desc"><label>不一致原因</label><p>${inbound.sizeMatchReason}</p></div>` : ''}
                    ${qcInfo}
                </div>
            `;
        } else {
            warehouseSection = `
                <div class="combined-section">
                    <h4>🏭 仓库入库结果</h4>
                    <div class="empty-state" style="padding:10px">暂未入库</div>
                </div>
            `;
        }

        let tariffSection = '';
        const tariffResponsibility = returnItem.tariffResponsibility || 'seller';
        const tariffLabel = Models.TARIFF_LABEL[tariffResponsibility] || tariffResponsibility;
        const tariffBadge = tariffResponsibility === 'seller' ? 'badge-success' : tariffResponsibility === 'buyer' ? 'badge-danger' : 'badge-warning';
        const tariffAmount = parseFloat(returnItem.tariffAmount) || 0;
        const shippingResp = Rules.calculateShippingResponsibility(returnItem, returnItem.qcResult);

        let tariffDetails = '';
        if (tariffAmount > 0) {
            tariffDetails = `
                <div class="combined-field"><label>关税金额</label><span>${formatCurrency(tariffAmount, returnItem.orderCurrency || 'USD')}</span></div>
                <div class="combined-field"><label>关税承担方</label><span class="badge ${tariffBadge}">${tariffLabel}</span></div>
            `;
        }

        const crossShippingCost = parseFloat(returnItem.crossWarehouseShippingCost) || 0;
        let crossDetails = '';
        if (crossShippingCost > 0) {
            const crossTypeLabel = Models.WAREHOUSE_CROSS_TYPES[returnItem.warehouseCrossType] || returnItem.warehouseCrossType || '-';
            crossDetails = `
                <div class="combined-field"><label>跨仓类型</label><span>${crossTypeLabel}</span></div>
                <div class="combined-field"><label>跨仓运费</label><span>${formatCurrency(crossShippingCost, returnItem.orderCurrency || 'USD')}</span></div>
            `;
        }

        const shippingPayerLabel = Models.TARIFF_LABEL[shippingResp.shippingPayer] || (shippingResp.shippingPayer === 'seller' ? '卖家承担' : shippingResp.shippingPayer === 'buyer' ? '买家承担' : '双方分担');
        const shippingBadge = shippingResp.shippingPayer === 'seller' ? 'badge-success' : shippingResp.shippingPayer === 'buyer' ? 'badge-danger' : 'badge-warning';

        tariffSection = `
            <div class="combined-section">
                <h4>💰 关税与费用责任</h4>
                <div class="combined-grid">
                    ${tariffDetails}
                    ${crossDetails}
                    <div class="combined-field"><label>运费承担方</label><span class="badge ${shippingBadge}">${shippingPayerLabel}</span></div>
                    <div class="combined-field"><label>责任判定依据</label><span style="font-size:12px;color:#666">${shippingResp.reason || '-'}</span></div>
                </div>
            </div>
        `;

        container.innerHTML = `
            <div class="combined-view-header">
                <h3>📋 综合视图 - ${returnItem.id}</h3>
                <div class="combined-meta">
                    <span class="badge ${Models.RETURN_STATUS_BADGE[returnItem.status]}">${Models.RETURN_STATUS_LABEL[returnItem.status]}</span>
                    <span>订单: ${returnItem.orderId || '-'}</span>
                    <span>SKU: ${returnItem.skuCode || '-'}</span>
                    <span>类型: ${Models.RETURN_TYPE_LABEL[returnItem.returnType] || returnItem.returnType}</span>
                    <span>原因: ${reasonInfo.zh}${reasonInfo.en !== reasonInfo.zh ? ' / ' + reasonInfo.en : ''}</span>
                </div>
            </div>
            ${feedbackSection}
            ${logisticsSection}
            ${warehouseSection}
            ${tariffSection}
        `;
    },

    goToFeedback(returnId) {
        document.querySelectorAll('.sub-tab-btn[data-subtab="buyer-feedback"]').forEach(btn => {
            btn.click();
        });
        setTimeout(() => {
            const select = document.getElementById('feedbackReturnId');
            if (select) select.value = returnId;
        }, 100);
    },

    returnForNoFeedback(returnId) {
        const returnItem = Storage.getById(Storage.KEYS.RETURNS, returnId);
        if (!returnItem) return;

        const needFeedback = Rules.checkNeedFeedback(returnItem);
        if (!needFeedback) {
            showToast('该申请不需要试穿反馈，无法以此理由退回', 'warning');
            return;
        }

        if (!confirm(`尺码争议案件【${returnItem.id}】缺少试穿反馈，确认退回该申请吗？`)) return;

        Storage.update(Storage.KEYS.RETURNS, returnId, {
            status: 'returned',
            remark: (returnItem.remark ? returnItem.remark + '\n' : '') + '退回原因：缺少试穿反馈，尺码争议无法判定'
        });

        showToast('申请已退回，原因：尺码争议无试穿反馈', 'success');
        this.renderPendingFeedbackList();
        this.refreshAll();
    },

    refreshReturnSelects() {
        const returns = Storage.get(Storage.KEYS.RETURNS);

        const pendingReturns = returns.filter(r => r.status === 'pending');
        const pendingOptions = pendingReturns.map(r =>
            `<option value="${r.id}">${r.id} (${r.orderId || ''} - ${r.skuCode || ''})</option>`
        ).join('');

        const feedbackEl = document.getElementById('feedbackReturnId');
        if (feedbackEl) {
            feedbackEl.innerHTML = '<option value="">请选择申请</option>' + pendingOptions;
        }

        const logisticsOptions = returns.map(r =>
            `<option value="${r.id}">${r.id} (${r.orderId || ''} - ${r.skuCode || ''})</option>`
        ).join('');

        const logisticsEl = document.getElementById('logisticsReturnId');
        if (logisticsEl) {
            logisticsEl.innerHTML = '<option value="">请选择申请</option>' + logisticsOptions;
        }

        const combinedViewEl = document.getElementById('combinedViewReturnId');
        if (combinedViewEl) {
            combinedViewEl.innerHTML = '<option value="">请选择申请</option>' +
                returns.map(r => {
                    const statusLabel = Models.RETURN_STATUS_LABEL[r.status] || r.status;
                    return `<option value="${r.id}">${r.id} (${r.orderId || ''} - ${statusLabel})</option>`;
                }).join('');
        }
    },

    refreshAll() {
        this.refreshReturnSelects();
        this.renderPendingFeedbackList();
        this.renderLogisticsList();
        if (typeof CustomerService !== 'undefined') {
            CustomerService.renderReturnList();
        }
    }
};
