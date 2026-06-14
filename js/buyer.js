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

        const data = {
            returnId: returnId,
            trackingNo: document.getElementById('trackingNo').value,
            carrier: document.getElementById('carrier').value,
            trackTime: document.getElementById('trackTime').value,
            trackNode: document.getElementById('trackNode').value,
            trackLocation: document.getElementById('trackLocation').value,
            description: document.getElementById('trackDesc').value
        };

        if (!data.trackTime || !data.trackNode) {
            showToast('请填写轨迹时间和节点', 'error');
            return;
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

        const sizeRelated = ['size_big', 'size_small', 'size_mismatch'];

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
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state">暂无物流轨迹数据</td></tr>';
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

        tbody.innerHTML = logistics.map(log => `
            <tr>
                <td>${log.returnId}</td>
                <td>${log.trackingNo || '-'}</td>
                <td>${log.carrier || '-'}</td>
                <td>${formatDateTime(log.trackTime)}</td>
                <td><span class="badge badge-info">${nodeLabels[log.trackNode] || log.trackNode}</span></td>
                <td>${log.trackLocation || '-'}</td>
                <td>${log.description || '-'}</td>
            </tr>
        `).join('');
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
