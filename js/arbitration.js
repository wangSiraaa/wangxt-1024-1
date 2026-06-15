const ArbitrationModule = {

    currentUserRole: 'cs',

    roleLabels: {
        cs: '普通客服',
        supervisor: '主管',
        arbitrator: '仲裁员'
    },

    roleIcons: {
        cs: '👤',
        supervisor: '👔',
        arbitrator: '⚖️'
    },

    init() {
        this.bindArbitrationForm();
        this.renderPendingList();
        this.renderReviewList();
        this.renderMaliciousList();
        this.renderHistoryList();
        this.refreshSelects();
        this.updateRoleUI();
    },

    switchRole(role) {
        this.currentUserRole = role;
        this.updateRoleUI();
        this.renderPendingList();
        this.renderReviewList();
        this.renderMaliciousList();
        this.renderHistoryList();
        this.refreshSelects();
        this.updatePermissionTip();
        this.updateSubmitButton();
        showToast(`已切换为【${this.roleLabels[role]}】角色`, 'info');
    },

    updateRoleUI() {
        const roleBtns = document.querySelectorAll('.role-btn');
        roleBtns.forEach(btn => {
            const role = btn.getAttribute('data-role');
            if (role === this.currentUserRole) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
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

        if (!returnId) {
            content.innerHTML = '请先选择仲裁案件';
            this.updatePermissionTip();
            this.updateSubmitButton();
            return;
        }

        const returnItem = Storage.getById(Storage.KEYS.RETURNS, returnId);
        if (!returnItem) {
            content.innerHTML = '案件不存在';
            return;
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
                当前状态：<span class="badge ${Models.STATUS_BADGE[returnItem.status] || 'badge-default'}">${Models.STATUS_LABEL[returnItem.status] || returnItem.status}</span><br>
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
        this.updatePermissionTip(returnItem);
        this.updateSubmitButton(returnItem);
    },

    updatePermissionTip(returnItem) {
        const tipBox = document.getElementById('rolePermissionTip');
        const tipIcon = document.getElementById('rolePermissionIcon');
        const tipText = document.getElementById('rolePermissionText');
        if (!tipBox || !tipIcon || !tipText) return;

        tipBox.className = 'permission-box';

        if (!returnItem) {
            tipIcon.textContent = this.roleIcons[this.currentUserRole];
            tipText.textContent = `当前角色：${this.roleLabels[this.currentUserRole]}。请选择案件后查看权限说明`;
            tipBox.classList.add('warning');
            return;
        }

        const validation = Rules.validateArbitration(returnItem, this.currentUserRole);

        if (this.currentUserRole === 'arbitrator') {
            tipIcon.textContent = '⚖️';
            tipText.textContent = '仲裁员权限：可直接提交仲裁结论并立即生效，案件状态将同步更新。';
            tipBox.classList.add('success');
        } else if (this.currentUserRole === 'supervisor') {
            tipIcon.textContent = '👔';
            tipText.textContent = '主管权限：可直接提交仲裁结论并立即生效，也可复核普通客服提交的待仲裁案件。';
            tipBox.classList.add('success');
        } else {
            tipIcon.textContent = '👤';
            if (Rules.canCsModifyConclusion(returnItem)) {
                tipText.textContent = '普通客服权限：案件尚未进入仲裁，可直接提交初步仲裁意见，提交后待主管复核。';
                tipBox.classList.add('warning');
            } else {
                tipText.textContent = '普通客服权限：案件已进入仲裁，无法直接修改结论，可提交初步意见待主管/仲裁员复核。';
                tipBox.classList.add('danger');
            }
        }
    },

    updateSubmitButton(returnItem) {
        const btn = document.getElementById('arbSubmitBtn');
        if (!btn) return;

        if (this.currentUserRole === 'arbitrator' || this.currentUserRole === 'supervisor') {
            btn.textContent = '提交并生效仲裁结论';
            btn.classList.remove('btn-disabled');
        } else {
            btn.textContent = '提交初步意见（待主管复核）';
            btn.classList.remove('btn-disabled');
        }
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

        const isFinal = this.currentUserRole === 'arbitrator' || this.currentUserRole === 'supervisor';

        const data = {
            returnId: returnId,
            officer: document.getElementById('arbOfficer').value || this.roleLabels[this.currentUserRole],
            result: result,
            level: document.getElementById('arbLevel').value,
            refundAmount: document.getElementById('arbRefundAmount').value,
            compensation: document.getElementById('arbCompensation').value,
            reason: reason,
            submittedBy: this.currentUserRole,
            submitterRole: this.currentUserRole,
            status: isFinal ? 'final' : 'pending_review'
        };

        const arbitration = Models.createArbitration(data);
        Storage.add(Storage.KEYS.ARBITRATIONS, arbitration);

        if (isFinal) {
            this.applyArbitrationResult(returnItem, arbitration);
            showToast('仲裁结论已提交并生效', 'success');
        } else {
            if (returnItem.status !== 'arbitration') {
                Storage.update(Storage.KEYS.RETURNS, returnId, { status: 'arbitration' });
            }
            showToast('初步意见已提交，等待主管/仲裁员复核', 'warning');
        }

        document.getElementById('arbitrationForm').reset();
        document.getElementById('arbDetailContent').innerHTML = '请先选择仲裁案件';
        this.renderPendingList();
        this.renderReviewList();
        this.renderHistoryList();
        this.refreshSelects();
        this.refreshOthers();
    },

    applyArbitrationResult(returnItem, arbitration) {
        const returnId = returnItem.id;
        const result = arbitration.result;

        let newStatus = 'arbitration';
        if (result === 'support_buyer') {
            newStatus = 'refund_pending';
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
                officer: arbitration.officer,
                level: arbitration.level,
                reason: arbitration.reason,
                finalized: true
            },
            arbitrationRecordId: arbitration.id,
            reasonLocked: true
        });

        Storage.update(Storage.KEYS.ARBITRATIONS, arbitration.id, {
            status: 'final',
            reviewedBy: this.currentUserRole,
            reviewTime: new Date().toISOString()
        });
    },

    renderReviewList() {
        const tbody = document.getElementById('arbitrationReviewList');
        if (!tbody) return;

        const arbitrations = Storage.get(Storage.KEYS.ARBITRATIONS).filter(a => a.status === 'pending_review');

        if (arbitrations.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state">暂无待复核仲裁</td></tr>';
            return;
        }

        const resultLabels = {
            'support_buyer': '支持买家',
            'support_seller': '支持卖家',
            'partial_refund': '部分退款',
            'exchange_only': '仅换货',
            'compensation': '补偿金'
        };

        const canReview = this.currentUserRole === 'supervisor' || this.currentUserRole === 'arbitrator';

        tbody.innerHTML = arbitrations.map(a => {
            const returnItem = Storage.getById(Storage.KEYS.RETURNS, a.returnId);
            return `
                <tr>
                    <td><strong>${a.id}</strong></td>
                    <td>${a.returnId}</td>
                    <td>${a.officer || '-'}<br><small>${this.roleLabels[a.submitterRole] || ''}</small></td>
                    <td><span class="badge badge-purple">${resultLabels[a.result] || a.result}</span></td>
                    <td>$${parseFloat(a.refundAmount || 0).toFixed(2)}</td>
                    <td>${formatDateTime(a.createdAt)}</td>
                    <td><span class="badge badge-warning">待复核</span></td>
                    <td>
                        ${canReview ? `
                            <span class="action-link" onclick="ArbitrationModule.reviewArbitration('${a.id}', 'approve')">通过生效</span>
                            <span class="action-link danger" onclick="ArbitrationModule.reviewArbitration('${a.id}', 'reject')">驳回</span>
                        ` : '<span style="color:#999;">需主管/仲裁员操作</span>'}
                    </td>
                </tr>
            `;
        }).join('');
    },

    reviewArbitration(arbitrationId, action) {
        if (this.currentUserRole !== 'supervisor' && this.currentUserRole !== 'arbitrator') {
            showToast('仅主管或仲裁员可进行复核操作', 'error');
            return;
        }

        const arbitration = Storage.getById(Storage.KEYS.ARBITRATIONS, arbitrationId);
        if (!arbitration) {
            showToast('仲裁记录不存在', 'error');
            return;
        }

        if (arbitration.status !== 'pending_review') {
            showToast('该仲裁已处理，无需重复复核', 'warning');
            return;
        }

        const returnItem = Storage.getById(Storage.KEYS.RETURNS, arbitration.returnId);

        if (action === 'approve') {
            if (!confirm('确认通过该仲裁结论？通过后将立即生效并更新案件状态。')) return;
            this.applyArbitrationResult(returnItem, arbitration);
            showToast('仲裁结论已通过并生效', 'success');
        } else if (action === 'reject') {
            const rejectReason = prompt('请填写驳回原因：');
            if (!rejectReason) return;
            Storage.update(Storage.KEYS.ARBITRATIONS, arbitrationId, {
                status: 'rejected',
                reviewedBy: this.currentUserRole,
                reviewTime: new Date().toISOString(),
                rejectReason: rejectReason
            });
            showToast('仲裁结论已驳回', 'warning');
        }

        this.renderPendingList();
        this.renderReviewList();
        this.renderHistoryList();
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
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state">暂无仲裁历史记录</td></tr>';
            return;
        }

        const resultLabels = {
            'support_buyer': '支持买家',
            'support_seller': '支持卖家',
            'partial_refund': '部分退款',
            'exchange_only': '仅换货',
            'compensation': '补偿金'
        };

        const statusLabels = {
            'pending_review': '待复核',
            'final': '已生效',
            'rejected': '已驳回'
        };

        const statusBadges = {
            'pending_review': 'badge-warning',
            'final': 'badge-success',
            'rejected': 'badge-danger'
        };

        tbody.innerHTML = arbitrations.map(a => `
            <tr>
                <td><strong>${a.id}</strong></td>
                <td>${a.returnId}</td>
                <td>${a.officer || '-'}<br><small>${this.roleLabels[a.submitterRole] || ''}</small></td>
                <td><span class="badge badge-purple">${resultLabels[a.result] || a.result}</span></td>
                <td>$${parseFloat(a.refundAmount || 0).toFixed(2)}</td>
                <td>${formatDateTime(a.createdAt)}</td>
                <td><span class="badge ${statusBadges[a.status] || 'badge-default'}">${statusLabels[a.status] || a.status}</span></td>
                <td>
                    ${a.status === 'pending_review' && (this.currentUserRole === 'supervisor' || this.currentUserRole === 'arbitrator') ?
                        `<span class="action-link" onclick="ArbitrationModule.goToReview('${a.id}')">复核</span>` :
                        '<span style="color:#999;">-</span>'
                    }
                </td>
            </tr>
        `).join('');
    },

    goToReview(arbitrationId) {
        document.querySelectorAll('.sub-tab-btn[data-subtab="arb-review"]').forEach(btn => btn.click());
        showToast(`请在待复核列表中找到 ${arbitrationId} 进行处理`, 'info');
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
        this.renderReviewList();
        this.renderMaliciousList();
        this.renderHistoryList();
    },

    refreshOthers() {
        if (typeof CustomerService !== 'undefined') CustomerService.renderReturnList();
        if (typeof WarehouseModule !== 'undefined') WarehouseModule.renderWarehouseList();
        if (typeof RefundModule !== 'undefined') RefundModule.refreshAll();
    }
};
