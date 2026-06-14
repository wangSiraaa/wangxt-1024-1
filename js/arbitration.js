const ArbitrationModule = {

    currentUserRole: 'cs',

    init() {
        this.bindArbitrationForm();
        this.renderPendingList();
        this.renderMaliciousList();
        this.renderHistoryList();
        this.refreshSelects();
    },

    bindArbitrationForm() {
        const form = document.getElementById('arbitrationForm');
        if (!form) return;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitArbitration();
        });
    },

    loadArbitrationDetail() {
        const returnId = document.getElementById('arbReturnId').value;
        const content = document.getElementById('arbDetailContent');
        const warning = document.getElementById('csPermissionWarning');

        if (!returnId) {
            content.innerHTML = '请先选择仲裁案件';
            return;
        }

        const returnItem = Storage.getById(Storage.KEYS.RETURNS, returnId);
        if (!returnItem) {
            content.innerHTML = '案件不存在';
            return;
        }

        if (this.currentUserRole === 'cs' && !Rules.canCsModifyConclusion(returnItem)) {
            warning.style.display = 'block';
        } else {
            warning.style.display = 'none';
        }

        const feedbacks = Storage.get(Storage.KEYS.FEEDBACKS).filter(f => f.returnId === returnId);
        const qcResults = Storage.get(Storage.KEYS.QC_RESULTS).filter(q => q.returnId === returnId);
        const inboundRecords = Storage.get(Storage.KEYS.INBOUND_RECORDS).filter(i => i.returnId === returnId);

        const reasonInfo = Models.REASON_MAP[returnItem.reason] || { zh: returnItem.reason };
        const order = Storage.getById(Storage.KEYS.ORDERS, returnItem.orderRef);
        const sku = Storage.getById(Storage.KEYS.SKUS, returnItem.skuRef);

        let detailHtml = `
            <div style="margin-bottom: 12px;">
                <strong>基本信息</strong><br>
                申请编号：${returnItem.id}<br>
                订单号：${returnItem.orderId || '-'}<br>
                买家：${order ? order.buyerAccount || '-' : '-'}<br>
                国家：${order ? order.country : '-'}<br>
                SKU：${returnItem.skuCode || '-'} / ${sku ? sku.size : '-'}<br>
                退换类型：${Models.RETURN_TYPE_LABEL[returnItem.returnType] || returnItem.returnType}<br>
                申请原因：${reasonInfo.zh}<br>
                恶意标记：<span class="badge ${Models.MALICIOUS_BADGE[returnItem.maliciousFlag]}">${Models.MALICIOUS_LABEL[returnItem.maliciousFlag]}</span>
            </div>
        `;

        if (feedbacks.length > 0) {
            detailHtml += `
                <div style="margin-bottom: 12px;">
                    <strong>试穿反馈</strong><br>
                    ${feedbacks.map(f => `
                        试穿时长：${f.tryOnDuration || '-'} /
                        污渍磨损：${f.hasDamage} /
                        吊牌：${f.tagKept} /
                        包装：${f.packageOk} /
                        穿着感受：${f.fitFeeling || '-'}<br>
                        中文描述：${f.descriptionZh || '-'}<br>
                        English: ${f.descriptionEn || '-'}
                    `).join('<br>')}
                </div>
            `;
        } else {
            detailHtml += `<div style="margin-bottom: 12px; color: #ff4d4f;"><strong>⚠️ 缺少试穿反馈</strong></div>`;
        }

        if (qcResults.length > 0) {
            detailHtml += `
                <div style="margin-bottom: 12px;">
                    <strong>质检记录</strong><br>
                    ${qcResults.map(q => `
                        结果：${q.result} /
                        尺码核对：${q.sizeCheck} /
                        二次销售：${q.resellable} /
                        污渍：${q.stain} /
                        磨损：${q.wear}<br>
                        质检员：${q.inspector || '-'} / 时间：${formatDateTime(q.qcTime)}<br>
                        说明：${q.remark || '-'}
                    `).join('<br>')}
                </div>
            `;
        }

        if (inboundRecords.length > 0) {
            detailHtml += `
                <div>
                    <strong>入库记录</strong><br>
                    ${inboundRecords.map(i => `
                        仓库：${i.warehouseCode} /
                        实收：${i.receivedQty}件 /
                        包装：${i.packageStatus} /
                        一致性：${i.matchStatus}<br>
                        入库时间：${formatDateTime(i.inboundTime)} / 备注：${i.remark || '-'}
                    `).join('<br>')}
                </div>
            `;
        }

        content.innerHTML = detailHtml;
    },

    submitArbitration() {
        const returnId = document.getElementById('arbReturnId').value;
        if (!returnId) {
            showToast('请选择仲裁案件', 'error');
            return;
        }

        const returnItem = Storage.getById(Storage.KEYS.RETURNS, returnId);

        const validation = Rules.validateArbitration(returnItem, this.currentUserRole);
        if (!validation.valid) {
            showToast(validation.errors[0], 'error');
            return;
        }

        if (validation.warnings.length > 0) {
            if (!confirm(validation.warnings.join('\n') + '\n\n是否继续提交？')) return;
        }

        const result = document.getElementById('arbResult').value;
        const reason = document.getElementById('arbReason').value.trim();

        if (!result) {
            showToast('请选择仲裁结论', 'error');
            return;
        }
        if (!reason) {
            showToast('请填写仲裁依据说明', 'error');
            return;
        }

        const data = {
            returnId: returnId,
            officer: document.getElementById('arbOfficer').value,
            result: result,
            level: document.getElementById('arbLevel').value,
            refundAmount: document.getElementById('arbRefundAmount').value,
            compensation: document.getElementById('arbCompensation').value,
            reason: reason
        };

        const arbitration = Models.createArbitration(data);
        Storage.add(Storage.KEYS.ARBITRATIONS, arbitration);

        let newStatus = 'arbitration';
        if (result === 'support_buyer') {
            newStatus = returnItem.returnType === 'exchange' ? 'refund_pending' : 'refund_pending';
        } else if (result === 'support_seller') {
            newStatus = 'rejected';
        } else if (result === 'partial_refund' || result === 'compensation') {
            newStatus = 'refund_pending';
        } else if (result === 'exchange_only') {
            newStatus = 'qc_pass';
        }

        Storage.update(Storage.KEYS.RETURNS, returnId, {
            status: newStatus,
            arbitrationInfo: {
                id: arbitration.id,
                result: result,
                officer: data.officer,
                level: data.level,
                reason: reason
            },
            arbitrationRecordId: arbitration.id,
            reasonLocked: true
        });

        if (this.currentUserRole === 'cs') {
            showToast('仲裁结论已提交（普通客服，需主管复核）', 'warning');
        } else {
            showToast('仲裁结论已提交并生效', 'success');
        }

        document.getElementById('arbitrationForm').reset();
        document.getElementById('arbDetailContent').innerHTML = '请先选择仲裁案件';
        this.renderPendingList();
        this.renderHistoryList();
        this.refreshSelects();
        this.refreshOthers();
    },

    renderPendingList() {
        const tbody = document.getElementById('arbitrationPendingList');
        if (!tbody) return;

        const returns = Storage.get(Storage.KEYS.RETURNS);
        const feedbacks = Storage.get(Storage.KEYS.FEEDBACKS);
        const qcResults = Storage.get(Storage.KEYS.QC_RESULTS);

        const pending = returns.filter(r =>
            r.status === 'arbitration' ||
            r.maliciousFlag === 'malicious' ||
            (r.qcResult === 'arbitration')
        );

        if (pending.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state">暂无待仲裁案件</td></tr>';
            return;
        }

        tbody.innerHTML = pending.map(r => {
            const reasonInfo = Models.REASON_MAP[r.reason] || { zh: r.reason };
            const fb = feedbacks.find(f => f.returnId === r.id);
            const qc = qcResults.find(q => q.returnId === r.id);
            const focusPoint = this.getDisputeFocus(r, fb, qc);

            return `
                <tr>
                    <td><strong>${r.id}</strong></td>
                    <td>${r.orderId || '-'}</td>
                    <td>${r.skuCode || '-'}</td>
                    <td>${focusPoint}</td>
                    <td>${qc ? qc.result + ' - ' + (qc.remark || '') : '未质检'}</td>
                    <td><span class="badge ${fb ? 'badge-success' : 'badge-danger'}">${fb ? '已提交' : '未提交'}</span></td>
                    <td><span class="badge ${Models.MALICIOUS_BADGE[r.maliciousFlag]}">${Models.MALICIOUS_LABEL[r.maliciousFlag]}</span></td>
                    <td>
                        <span class="action-link" onclick="ArbitrationModule.goToHandle('${r.id}')">处理</span>
                        <span class="action-link" onclick="ArbitrationModule.toggleMalicious('${r.id}')">标记</span>
                    </td>
                </tr>
            `;
        }).join('');
    },

    getDisputeFocus(returnItem, feedback, qc) {
        const reasonInfo = Models.REASON_MAP[returnItem.reason] || { zh: returnItem.reason };
        if (returnItem.maliciousFlag === 'malicious') return '恶意退换';
        if (qc && qc.result === 'arbitration') return `质检判定存疑 - ${reasonInfo.zh}`;
        if (Rules.isSizeRelatedReason(returnItem.reason)) {
            if (!feedback) return `尺码争议 - 缺少试穿反馈`;
            return `尺码争议 - ${feedback.fitFeeling || reasonInfo.zh}`;
        }
        if (returnItem.reason === 'quality') return '质量争议';
        return reasonInfo.zh;
    },

    goToHandle(returnId) {
        document.querySelectorAll('.sub-tab-btn[data-subtab="arb-handle"]').forEach(btn => btn.click());
        setTimeout(() => {
            const el = document.getElementById('arbReturnId');
            if (el) {
                el.value = returnId;
                this.loadArbitrationDetail();
            }
        }, 100);
    },

    toggleMalicious(returnId) {
        const returnItem = Storage.getById(Storage.KEYS.RETURNS, returnId);
        if (!returnItem) return;

        const options = ['normal', 'suspected', 'malicious'];
        const currentIdx = options.indexOf(returnItem.maliciousFlag);
        const nextFlag = options[(currentIdx + 1) % options.length];

        if (!confirm(`将恶意标记设置为：${Models.MALICIOUS_LABEL[nextFlag]}？`)) return;

        Storage.update(Storage.KEYS.RETURNS, returnId, { maliciousFlag: nextFlag });
        showToast('恶意标记已更新', 'success');
        this.renderPendingList();
        this.renderMaliciousList();
    },

    renderMaliciousList() {
        const tbody = document.getElementById('maliciousList');
        if (!tbody) return;

        const returns = Storage.get(Storage.KEYS.RETURNS);
        const orders = Storage.get(Storage.KEYS.ORDERS);

        const buyerMap = {};
        returns.forEach(r => {
            const order = orders.find(o => o.id === r.orderRef);
            const buyer = order ? order.buyerAccount || 'unknown' : 'unknown';
            if (!buyerMap[buyer]) {
                buyerMap[buyer] = { returns: [], buyer: buyer };
            }
            buyerMap[buyer].returns.push(r);
        });

        const maliciousReturns = returns.filter(r => r.maliciousFlag !== 'normal');

        if (maliciousReturns.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state">暂无恶意退换标记</td></tr>';
            return;
        }

        tbody.innerHTML = maliciousReturns.map(r => {
            const order = orders.find(o => o.id === r.orderRef);
            const buyer = order ? order.buyerAccount || '-' : '-';
            const buyerTotal = buyerMap[buyer] ? buyerMap[buyer].returns.length : 1;

            return `
                <tr>
                    <td><strong>${r.id}</strong></td>
                    <td>${buyer}</td>
                    <td>${buyerTotal}</td>
                    <td><span class="badge ${Models.MALICIOUS_BADGE[r.maliciousFlag]}">${Models.MALICIOUS_LABEL[r.maliciousFlag]}</span></td>
                    <td>${r.remark || '-'}</td>
                    <td>${formatDateTime(r.createdAt)}</td>
                    <td>
                        <span class="action-link" onclick="ArbitrationModule.toggleMalicious('${r.id}')">切换标记</span>
                    </td>
                </tr>
            `;
        }).join('');
    },

    renderHistoryList() {
        const tbody = document.getElementById('arbitrationHistoryList');
        if (!tbody) return;

        const arbitrations = Storage.get(Storage.KEYS.ARBITRATIONS);

        if (arbitrations.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state">暂无仲裁历史记录</td></tr>';
            return;
        }

        const resultLabels = {
            'support_buyer': '支持买家',
            'support_seller': '支持卖家',
            'partial_refund': '部分退款',
            'exchange_only': '仅换货',
            'compensation': '补偿金'
        };

        tbody.innerHTML = arbitrations.map(a => `
            <tr>
                <td><strong>${a.id}</strong></td>
                <td>${a.returnId}</td>
                <td>${a.officer || '-'}</td>
                <td><span class="badge badge-purple">${resultLabels[a.result] || a.result}</span></td>
                <td>$${parseFloat(a.refundAmount || 0).toFixed(2)}</td>
                <td>${formatDateTime(a.createdAt)}</td>
                <td><span class="badge badge-success">${a.status === 'final' ? '已生效' : '待复核'}</span></td>
            </tr>
        `).join('');
    },

    refreshSelects() {
        const returns = Storage.get(Storage.KEYS.RETURNS);
        const arbPending = returns.filter(r =>
            r.status === 'arbitration' ||
            r.qcResult === 'arbitration' ||
            r.maliciousFlag === 'malicious' ||
            (r.qcResult && !r.arbitrationInfo)
        );

        const arbEl = document.getElementById('arbReturnId');
        if (arbEl) {
            arbEl.innerHTML = '<option value="">请选择案件</option>' +
                arbPending.map(r => `<option value="${r.id}">${r.id} (${r.orderId || ''})</option>`).join('');
        }
    },

    refreshAll() {
        this.refreshSelects();
        this.renderPendingList();
        this.renderMaliciousList();
        this.renderHistoryList();
    },

    refreshOthers() {
        if (typeof CustomerService !== 'undefined') CustomerService.renderReturnList();
        if (typeof WarehouseModule !== 'undefined') WarehouseModule.renderWarehouseList();
        if (typeof RefundModule !== 'undefined') RefundModule.refreshAll();
    }
};
