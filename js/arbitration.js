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
        this.bindEvidenceForm();
        this.renderPendingList();
        this.renderReviewList();
        this.renderMaliciousList();
        this.renderHistoryList();
        this.renderEvidenceList();
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
        this.renderEvidenceList();
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

    bindEvidenceForm() {
        const form = document.getElementById('evidenceForm');
        if (!form) return;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitEvidence();
        });
        const evidenceReturnEl = document.getElementById('evidenceReturnId');
        if (evidenceReturnEl) {
            evidenceReturnEl.addEventListener('change', () => {
                this.renderEvidenceList(evidenceReturnEl.value);
            });
        }
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
        const logistics = Storage.get(Storage.KEYS.LOGISTICS).filter(l => l.returnId === returnId);
        const evidences = Storage.get(Storage.KEYS.ARBITRATION_EVIDENCES).filter(e => e.returnId === returnId);
        const arbitrations = Storage.get(Storage.KEYS.ARBITRATIONS).filter(a => a.returnId === returnId);

        const reasonInfo = Models.REASON_MAP[returnItem.reason] || { zh: returnItem.reason };
        const order = returnItem.orderRef ? Storage.getById(Storage.KEYS.ORDERS, returnItem.orderRef) : null;
        const sku = returnItem.skuRef ? Storage.getById(Storage.KEYS.SKUS, returnItem.skuRef) : null;

        const originWarehouseName = Models.WAREHOUSES[returnItem.originWarehouse] ? Models.WAREHOUSES[returnItem.originWarehouse].name : (returnItem.originWarehouse || '-');
        const targetWarehouseName = Models.WAREHOUSES[returnItem.targetWarehouse] ? Models.WAREHOUSES[returnItem.targetWarehouse].name : (returnItem.targetWarehouse || '-');
        const crossTypeLabel = returnItem.warehouseCrossType ? (Models.WAREHOUSE_CROSS_TYPES[returnItem.warehouseCrossType] || returnItem.warehouseCrossType) : '-';
        const currencyInfo = Models.CURRENCIES[order ? order.country : ''] || { code: returnItem.orderCurrency || 'USD', symbol: '$', name: '' };
        const tariffLabel = Models.TARIFF_LABEL[returnItem.tariffResponsibility] || returnItem.tariffResponsibility || '-';

        let detailHtml = `
            <div style="margin-bottom: 12px; padding: 8px; background: #f0f5ff; border-radius: 4px;">
                <strong>📋 基本信息</strong><br>
                申请编号：${returnItem.id}<br>
                订单号：${returnItem.orderId || '-'}<br>
                买家：${order ? order.buyerAccount || '-' : '-'}<br>
                国家：${order ? order.country : '-'}<br>
                SKU：${returnItem.skuCode || '-'} / ${sku ? sku.size : '-'}<br>
                退换类型：${Models.RETURN_TYPE_LABEL[returnItem.returnType] || returnItem.returnType}<br>
                当前状态：<span class="badge ${Models.RETURN_STATUS_BADGE[returnItem.status] || 'badge-default'}">${Models.RETURN_STATUS_LABEL[returnItem.status] || returnItem.status}</span><br>
                申请原因：${reasonInfo.zh}<br>
                恶意标记：<span class="badge ${Models.MALICIOUS_BADGE[returnItem.maliciousFlag]}">${Models.MALICIOUS_LABEL[returnItem.maliciousFlag]}</span><br>
                币种：${currencyInfo.code} (${currencyInfo.name})<br>
                发货仓库：${originWarehouseName}<br>
                目标仓库：${targetWarehouseName}<br>
                跨仓类型：${crossTypeLabel}<br>
                关税责任：${tariffLabel}<br>
                关税金额：${formatCurrency(returnItem.tariffAmount, currencyInfo.code)}<br>
                跨仓运费：${formatCurrency(returnItem.crossWarehouseShippingCost, currencyInfo.code)}<br>
                结论锁定：${returnItem.arbitrationConclusionLocked ? '<span class="badge badge-danger">🔒 已锁定</span>' : '<span class="badge badge-success">未锁定</span>'}
            </div>
        `;

        if (feedbacks.length > 0) {
            detailHtml += `
                <div style="margin-bottom: 12px; padding: 8px; background: #f6ffed; border-radius: 4px;">
                    <strong>👗 试穿反馈</strong><br>
                    ${feedbacks.map(f => `
                        试穿时长：${f.tryOnDuration || '-'}<br>
                        污渍磨损：${f.hasDamage === 'yes' ? '⚠️ 有' : '无'} /
                        吊牌：${f.tagKept === 'yes' ? '✅ 保留' : '❌ 已剪'} /
                        包装：${f.packageOk === 'yes' ? '✅ 完好' : '❌ 损坏'}<br>
                        穿着感受：${f.fitFeeling || '-'}<br>
                        中文描述：${f.descriptionZh || '-'}<br>
                        English: ${f.descriptionEn || '-'}
                    `).join('<hr style="margin:4px 0;border:none;border-top:1px dashed #ccc;">')}
                </div>
            `;
        } else {
            detailHtml += `<div style="margin-bottom: 12px; padding: 8px; background: #fff2f0; border-radius: 4px; color: #ff4d4f;"><strong>⚠️ 缺少试穿反馈</strong></div>`;
        }

        if (logistics.length > 0) {
            detailHtml += `
                <div style="margin-bottom: 12px; padding: 8px; background: #e6f7ff; border-radius: 4px;">
                    <strong>🚚 物流轨迹</strong><br>
                    ${logistics.map(l => `
                        <span class="badge badge-info">${formatDateTime(l.trackTime)}</span>
                        ${l.trackNode || '-'} @ ${l.trackLocation || '-'}<br>
                        承运商：${l.carrier || '-'} / 单号：${l.trackingNo || '-'}<br>
                        ${l.customsStatus ? `海关状态：<span class="badge badge-warning">${l.customsStatus}</span><br>` : ''}
                        ${l.tariffInfo ? `关税信息：${l.tariffInfo}<br>` : ''}
                        ${l.tariffAmount ? `关税金额：${formatCurrency(l.tariffAmount, currencyInfo.code)}<br>` : ''}
                        ${l.tariffPayer ? `关税支付方：${l.tariffPayer}<br>` : ''}
                        ${l.description ? `描述：${l.description}<br>` : ''}
                    `).join('<hr style="margin:4px 0;border:none;border-top:1px dashed #ccc;">')}
                </div>
            `;
        }

        detailHtml += `
            <div style="margin-bottom: 12px; padding: 8px; background: #fff7e6; border-radius: 4px;">
                <strong>💰 关税责任</strong><br>
                责任方：${tariffLabel}<br>
                关税金额：${formatCurrency(returnItem.tariffAmount, currencyInfo.code)}<br>
                订单币种：${returnItem.orderCurrency || 'USD'}<br>
                退款币种：${returnItem.refundCurrency || 'USD'}<br>
                汇率：${returnItem.exchangeRate || 1}
            </div>
        `;

        if (inboundRecords.length > 0) {
            detailHtml += `
                <div style="margin-bottom: 12px; padding: 8px; background: #f9f0ff; border-radius: 4px;">
                    <strong>📦 仓库入库结果</strong><br>
                    ${inboundRecords.map(i => `
                        入库仓库：${Models.WAREHOUSES[i.warehouseCode] ? Models.WAREHOUSES[i.warehouseCode].name : i.warehouseCode}<br>
                        实收数量：${i.receivedQty}件<br>
                        包装状态：${i.packageStatus === 'good' ? '✅ 完好' : i.packageStatus === 'damaged' ? '❌ 损坏' : i.packageStatus}<br>
                        匹配状态：${i.matchStatus === 'yes' ? '✅ 一致' : i.matchStatus === 'partial' ? '⚠️ 部分匹配' : '❌ 不匹配'}<br>
                        ${i.matchStatus !== 'yes' ? `不一致原因：${i.sizeMatchReason || '-'}<br>` : ''}
                        磨损情况：${i.wearCondition === 'none' ? '无' : i.wearCondition === 'light' ? '轻微' : i.wearCondition === 'serious' ? '⚠️ 严重' : i.wearCondition}<br>
                        入库时间：${formatDateTime(i.inboundTime)}<br>
                        备注：${i.remark || '-'}
                    `).join('<hr style="margin:4px 0;border:none;border-top:1px dashed #ccc;">')}
                </div>
            `;
        }

        if (qcResults.length > 0) {
            detailHtml += `
                <div style="margin-bottom: 12px; padding: 8px; background: #fff0f6; border-radius: 4px;">
                    <strong>🔍 质检记录</strong><br>
                    ${qcResults.map(q => `
                        结果：<span class="badge ${q.result === 'pass' ? 'badge-success' : q.result === 'reject' ? 'badge-danger' : 'badge-warning'}">${q.result === 'pass' ? '通过' : q.result === 'reject' ? '不通过' : q.result === 'arbitration' ? '需仲裁' : q.result}</span><br>
                        尺码核对：${q.sizeCheck} / 二次销售：${q.resellable === 'yes' ? '可' : '不可'}<br>
                        污渍：${q.stain} / 磨损：${q.wear}<br>
                        质检员：${q.inspector || '-'} / 时间：${formatDateTime(q.qcTime)}<br>
                        说明：${q.remark || '-'}
                        ${q.mismatchWithFeedback ? `<br><span class="badge badge-danger">⚠️ 与反馈不一致：${q.mismatchDetail || ''}</span>` : ''}
                    `).join('<hr style="margin:4px 0;border:none;border-top:1px dashed #ccc;">')}
                </div>
            `;
        }

        if (returnItem.qcMismatchTriggered) {
            detailHtml += `
                <div style="margin-bottom: 12px; padding: 8px; background: #fff1f0; border-radius: 4px;">
                    <strong>⚠️ 质检不一致信息</strong><br>
                    不一致原因：${returnItem.qcMismatchReason || '-'}<br>
                    ${returnItem.costEstimation ? `
                        复核成本估算：${formatCurrency(returnItem.costEstimation.totalCost, currencyInfo.code)}<br>
                        明细：复核费 ${formatCurrency(returnItem.costEstimation.breakdown.recheckCost, currencyInfo.code)} +
                        跨仓运费 ${formatCurrency(returnItem.costEstimation.breakdown.crossWarehouseShippingCost || 0, currencyInfo.code)} +
                        关税 ${formatCurrency(returnItem.costEstimation.breakdown.tariffCost || 0, currencyInfo.code)}
                    ` : ''}
                </div>
            `;
        }

        if (arbitrations.length > 0) {
            const resultLabels = {
                'support_buyer': '支持买家',
                'support_seller': '支持卖家',
                'partial_refund': '部分退款',
                'exchange_only': '仅换货',
                'compensation': '补偿金'
            };
            detailHtml += `
                <div style="margin-bottom: 12px; padding: 8px; background: #f0f0f0; border-radius: 4px;">
                    <strong>📝 已有仲裁记录</strong><br>
                    ${arbitrations.map(a => `
                        ${a.id} - <span class="badge badge-purple">${resultLabels[a.result] || a.result}</span>
                        ${a.status === 'final' ? '<span class="badge badge-success">已生效</span>' : a.status === 'pending_review' ? '<span class="badge badge-warning">待复核</span>' : '<span class="badge badge-danger">已驳回</span>'}
                        ${a.conclusionLocked ? '🔒' : ''}<br>
                        提交人：${this.roleLabels[a.submitterRole] || a.submitterRole} / 时间：${formatDateTime(a.createdAt)}<br>
                        依据：${a.reason || '-'}
                    `).join('<hr style="margin:4px 0;border:none;border-top:1px dashed #ccc;">')}
                </div>
            `;
        }

        if (evidences.length > 0) {
            detailHtml += `
                <div style="margin-bottom: 12px; padding: 8px; background: #e8f5e9; border-radius: 4px;">
                    <strong>📎 补充证据</strong><br>
                    ${evidences.map(e => `
                        <span class="badge badge-info">${this.roleLabels[e.submitterRole] || e.submitterRole}</span>
                        <span class="badge badge-default">${e.evidenceType === 'text' ? '文字' : e.evidenceType === 'photo' ? '图片' : e.evidenceType === 'document' ? '文档' : e.evidenceType}</span>
                        ${formatDateTime(e.createdAt)}<br>
                        内容：${e.content}
                    `).join('<hr style="margin:4px 0;border:none;border-top:1px dashed #ccc;">')}
                </div>
            `;
        }

        content.innerHTML = detailHtml;
        this.updatePermissionTip(returnItem);
        this.updateSubmitButton(returnItem);
        this.renderEvidenceList(returnId);
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

        const isEvidenceOnly = returnItem.arbitrationConclusionLocked === true &&
            (this.currentUserRole === 'cs' || this.currentUserRole === 'warehouse');

        if (isEvidenceOnly) {
            tipIcon.textContent = '🔒';
            tipText.textContent = '当前角色只能补充证据，不能直接修改结论';
            tipBox.classList.add('danger');
            return;
        }

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

        const isEvidenceOnly = returnItem && returnItem.arbitrationConclusionLocked === true &&
            (this.currentUserRole === 'cs' || this.currentUserRole === 'warehouse');

        if (isEvidenceOnly) {
            btn.textContent = '补充证据';
            btn.classList.remove('btn-disabled');
        } else if (this.currentUserRole === 'arbitrator' || this.currentUserRole === 'supervisor') {
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
        if (!returnItem) {
            showToast('案件不存在', 'error');
            return;
        }

        const isEvidenceOnly = returnItem.arbitrationConclusionLocked === true &&
            (this.currentUserRole === 'cs' || this.currentUserRole === 'warehouse');

        if (isEvidenceOnly) {
            this.submitEvidence();
            return;
        }

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
            officer: document.getElementById('arbOfficer') ? document.getElementById('arbOfficer').value : this.roleLabels[this.currentUserRole],
            result: result,
            level: document.getElementById('arbLevel') ? document.getElementById('arbLevel').value : 'normal',
            refundAmount: document.getElementById('arbRefundAmount') ? document.getElementById('arbRefundAmount').value : 0,
            compensation: document.getElementById('arbCompensation') ? document.getElementById('arbCompensation').value : 0,
            reason: reason,
            submittedBy: this.currentUserRole,
            submitterRole: this.currentUserRole,
            status: isFinal ? 'final' : 'pending_review',
            conclusionLocked: isFinal
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
        this.renderEvidenceList();
        this.refreshSelects();
        this.refreshOthers();
    },

    submitEvidence() {
        let returnId = document.getElementById('arbReturnId') ? document.getElementById('arbReturnId').value : '';
        const evidenceReturnEl = document.getElementById('evidenceReturnId');
        if (!returnId && evidenceReturnEl) {
            returnId = evidenceReturnEl.value;
        }

        if (!returnId) {
            showToast('请选择仲裁案件', 'error');
            return;
        }

        const returnItem = Storage.getById(Storage.KEYS.RETURNS, returnId);
        if (!returnItem) {
            showToast('案件不存在', 'error');
            return;
        }

        if (this.currentUserRole !== 'cs' && this.currentUserRole !== 'warehouse' &&
            this.currentUserRole !== 'supervisor' && this.currentUserRole !== 'arbitrator') {
            showToast('当前角色无法提交证据', 'error');
            return;
        }

        if (returnItem.arbitrationConclusionLocked &&
            this.currentUserRole !== 'supervisor' && this.currentUserRole !== 'arbitrator') {
            // locked - CS/warehouse can only add evidence
        }

        let content = '';
        let evidenceType = 'text';

        const evidenceDescEl = document.getElementById('evidenceDesc');
        const evidenceTypeEl = document.getElementById('evidenceType');
        if (evidenceDescEl && evidenceDescEl.value.trim()) {
            content = evidenceDescEl.value.trim();
            if (evidenceTypeEl) evidenceType = evidenceTypeEl.value;
        } else {
            content = document.getElementById('arbReason') ? document.getElementById('arbReason').value.trim() : '';
            const resultEl = document.getElementById('arbResult');
            if (resultEl && resultEl.value === 'photo') evidenceType = 'photo';
            else if (resultEl && resultEl.value === 'document') evidenceType = 'document';
        }

        if (!content) {
            showToast('请填写证据内容', 'error');
            return;
        }

        const evidenceData = {
            arbitrationId: null,
            returnId: returnId,
            submitterRole: this.currentUserRole,
            submitterName: this.roleLabels[this.currentUserRole],
            evidenceType: evidenceType,
            content: content
        };

        const evidence = Models.createArbitrationEvidence(evidenceData);
        Storage.add(Storage.KEYS.ARBITRATION_EVIDENCES, evidence);

        showToast('证据已补充', 'success');
        const evidenceForm = document.getElementById('evidenceForm');
        if (evidenceForm) evidenceForm.reset();
        document.getElementById('arbitrationForm').reset();
        this.loadArbitrationDetail();
        this.renderEvidenceList(returnId);
        this.refreshOthers();
    },

    applyArbitrationResult(returnItem, arbitration) {
        const returnId = returnItem.id;
        const result = arbitration.result;

        let newStatus = 'arbitration_locked';

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
            arbitrationConclusionLocked: true,
            arbitrationInfo: {
                id: arbitration.id,
                result: result,
                officer: arbitration.officer,
                level: arbitration.level,
                reason: arbitration.reason,
                finalized: true,
                lockedAt: new Date().toISOString()
            },
            arbitrationRecordId: arbitration.id,
            reasonLocked: true
        });

        Storage.update(Storage.KEYS.ARBITRATIONS, arbitration.id, {
            status: 'final',
            conclusionLocked: true,
            reviewedBy: this.currentUserRole,
            reviewTime: new Date().toISOString()
        });
    },

    renderPendingList() {
        const tbody = document.getElementById('arbitrationPendingList');
        if (!tbody) return;

        const returns = Storage.get(Storage.KEYS.RETURNS);
        const feedbacks = Storage.get(Storage.KEYS.FEEDBACKS);
        const qcResults = Storage.get(Storage.KEYS.QC_RESULTS);

        const pending = returns.filter(r =>
            r.status === 'arbitration' ||
            r.status === 'arbitration_locked' ||
            r.maliciousFlag === 'malicious' ||
            (r.qcResult === 'arbitration')
        );

        if (pending.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="empty-state">暂无待仲裁案件</td></tr>';
            return;
        }

        tbody.innerHTML = pending.map(r => {
            const reasonInfo = Models.REASON_MAP[r.reason] || { zh: r.reason };
            const fb = feedbacks.find(f => f.returnId === r.id);
            const qc = qcResults.find(q => q.returnId === r.id);
            const focusPoint = this.getDisputeFocus(r, fb, qc);
            const originWh = Models.WAREHOUSES[r.originWarehouse] ? Models.WAREHOUSES[r.originWarehouse].name : (r.originWarehouse || '-');
            const targetWh = Models.WAREHOUSES[r.targetWarehouse] ? Models.WAREHOUSES[r.targetWarehouse].name : (r.targetWarehouse || '-');
            const crossLabel = r.warehouseCrossType ? (Models.WAREHOUSE_CROSS_TYPES[r.warehouseCrossType] || r.warehouseCrossType) : '-';
            const currencyCode = r.orderCurrency || 'USD';
            const tariffLabel = Models.TARIFF_LABEL[r.tariffResponsibility] || r.tariffResponsibility || '-';

            return `
                <tr>
                    <td><strong>${r.id}</strong></td>
                    <td>${r.orderId || '-'}</td>
                    <td>${r.skuCode || '-'}</td>
                    <td>${focusPoint}</td>
                    <td>
                        ${originWh}${r.targetWarehouse && r.targetWarehouse !== r.originWarehouse ? ' → ' + targetWh : ''}
                        ${r.warehouseCrossType && r.warehouseCrossType !== 'same' ? '<br><small class="badge badge-info">' + crossLabel + '</small>' : ''}
                    </td>
                    <td>${currencyCode} / ${tariffLabel}</td>
                    <td>
                        ${qc ? qc.result + (qc.remark ? ' - ' + qc.remark : '') : '未质检'}
                        ${r.arbitrationConclusionLocked ? '<br><span class="badge badge-danger">🔒 已锁定</span>' : ''}
                    </td>
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
            const isEvidenceOnly = returnItem && returnItem.arbitrationConclusionLocked === true;

            return `
                <tr>
                    <td><strong>${a.id}</strong></td>
                    <td>${a.returnId}</td>
                    <td>${a.officer || '-'}<br><small>${this.roleLabels[a.submitterRole] || ''}</small></td>
                    <td><span class="badge badge-purple">${resultLabels[a.result] || a.result}</span></td>
                    <td>${formatCurrency(a.refundAmount, returnItem ? returnItem.orderCurrency : 'USD')}</td>
                    <td>${formatDateTime(a.createdAt)}</td>
                    <td>
                        <span class="badge badge-warning">待复核</span>
                        ${isEvidenceOnly ? '<br><small class="badge badge-danger">🔒 结论已锁定</small>' : ''}
                    </td>
                    <td>
                        ${canReview && !isEvidenceOnly ? `
                            <span class="action-link" onclick="ArbitrationModule.reviewArbitration('${a.id}', 'approve')">通过生效</span>
                            <span class="action-link danger" onclick="ArbitrationModule.reviewArbitration('${a.id}', 'reject')">驳回</span>
                        ` : isEvidenceOnly ? '<span style="color:#999;">结论已锁定</span>' : '<span style="color:#999;">需主管/仲裁员操作</span>'}
                    </td>
                </tr>
            `;
        }).join('');
    },

    renderEvidenceList(returnId) {
        const tbody = document.getElementById('arbitrationEvidenceList');
        const tbody2 = document.getElementById('evidenceList');

        if (!returnId) {
            const arbSelect = document.getElementById('arbReturnId');
            const evidenceSelect = document.getElementById('evidenceReturnId');
            returnId = arbSelect ? arbSelect.value : (evidenceSelect ? evidenceSelect.value : '');
        }

        const evidences = Storage.get(Storage.KEYS.ARBITRATION_EVIDENCES).filter(e => e.returnId === returnId);

        const typeLabels = {
            'text': '📝 文字',
            'photo': '📷 图片',
            'document': '📄 文档'
        };

        const buildRows = () => {
            if (evidences.length === 0) {
                return '<tr><td colspan="6" class="empty-state">暂无补充证据</td></tr>';
            }
            return evidences.map(e => `
                <tr>
                    <td><strong>${e.id}</strong></td>
                    <td><span class="badge badge-info">${this.roleLabels[e.submitterRole] || e.submitterRole}</span></td>
                    <td><span class="badge badge-default">${typeLabels[e.evidenceType] || e.evidenceType}</span></td>
                    <td>${e.content}</td>
                    <td>${formatDateTime(e.createdAt)}</td>
                    <td>
                        ${(this.currentUserRole === 'supervisor' || this.currentUserRole === 'arbitrator') ?
                            `<span class="action-link danger" onclick="ArbitrationModule.deleteEvidence('${e.id}')">删除</span>` :
                            '<span style="color:#999;">-</span>'
                        }
                    </td>
                </tr>
            `).join('');
        };

        if (tbody) tbody.innerHTML = buildRows();
        if (tbody2) tbody2.innerHTML = buildRows();
    },

    deleteEvidence(evidenceId) {
        if (this.currentUserRole !== 'supervisor' && this.currentUserRole !== 'arbitrator') {
            showToast('仅主管或仲裁员可删除证据', 'error');
            return;
        }
        if (!confirm('确认删除此证据？')) return;
        Storage.remove(Storage.KEYS.ARBITRATION_EVIDENCES, evidenceId);
        showToast('证据已删除', 'success');
        this.renderEvidenceList();
        this.loadArbitrationDetail();
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
            showToast('该仲裁已处理，无需重复复核', 'error');
            return;
        }

        const returnItem = Storage.getById(Storage.KEYS.RETURNS, arbitration.returnId);

        if (action === 'approve') {
            if (!confirm('确认通过该仲裁结论？通过后将立即生效、锁定结论并更新案件状态。')) return;
            this.applyArbitrationResult(returnItem, arbitration);
            showToast('仲裁结论已通过并生效，结论已锁定', 'success');
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
        this.renderEvidenceList();
        this.refreshOthers();
    },

    getDisputeFocus(returnItem, feedback, qc) {
        const reasonInfo = Models.REASON_MAP[returnItem.reason] || { zh: returnItem.reason };
        if (returnItem.maliciousFlag === 'malicious') return '恶意退换';
        if (returnItem.arbitrationConclusionLocked) return '🔒 结论已锁定';
        if (qc && qc.result === 'arbitration') return `质检判定存疑 - ${reasonInfo.zh}`;
        if (Rules.isSizeRelatedReason(returnItem.reason)) {
            if (!feedback) return `尺码争议 - 缺少试穿反馈`;
            return `尺码争议 - ${feedback.fitFeeling || reasonInfo.zh}`;
        }
        if (returnItem.reason === 'quality') return '质量争议';
        if (returnItem.qcMismatchTriggered) return `质检不一致 - ${returnItem.qcMismatchReason || ''}`;
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
            const order = r.orderRef ? orders.find(o => o.id === r.orderRef) : null;
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
            const order = r.orderRef ? orders.find(o => o.id === r.orderRef) : null;
            const buyer = order ? order.buyerAccount || '-' : '-';
            const buyerTotal = buyerMap[buyer] ? buyerMap[buyer].returns.length : 1;
            const currencyCode = r.orderCurrency || 'USD';

            return `
                <tr>
                    <td><strong>${r.id}</strong></td>
                    <td>${buyer}</td>
                    <td>${buyerTotal}</td>
                    <td><span class="badge ${Models.MALICIOUS_BADGE[r.maliciousFlag]}">${Models.MALICIOUS_LABEL[r.maliciousFlag]}</span></td>
                    <td>${r.remark || '-'}${r.arbitrationConclusionLocked ? ' 🔒' : ''}</td>
                    <td>${formatDateTime(r.createdAt)}</td>
                    <td>
                        <span class="action-link" onclick="ArbitrationModule.toggleMalicious('${r.id}')">切换标记</span>
                        ${r.status === 'arbitration' || r.status === 'arbitration_locked' ?
                            `<span class="action-link" onclick="ArbitrationModule.goToHandle('${r.id}')">查看</span>` : ''}
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
            tbody.innerHTML = '<tr><td colspan="9" class="empty-state">暂无仲裁历史记录</td></tr>';
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

        tbody.innerHTML = arbitrations.map(a => {
            const returnItem = Storage.getById(Storage.KEYS.RETURNS, a.returnId);
            const currencyCode = returnItem ? returnItem.orderCurrency : 'USD';

            return `
                <tr>
                    <td><strong>${a.id}</strong></td>
                    <td>${a.returnId}</td>
                    <td>${a.officer || '-'}<br><small>${this.roleLabels[a.submitterRole] || ''}</small></td>
                    <td><span class="badge badge-purple">${resultLabels[a.result] || a.result}</span></td>
                    <td>${formatCurrency(a.refundAmount, currencyCode)}</td>
                    <td>${formatDateTime(a.createdAt)}</td>
                    <td><span class="badge ${statusBadges[a.status] || 'badge-default'}">${statusLabels[a.status] || a.status}</span></td>
                    <td>${a.conclusionLocked ? '<span class="badge badge-danger">🔒</span>' : '-'}</td>
                    <td>
                        ${a.status === 'pending_review' && (this.currentUserRole === 'supervisor' || this.currentUserRole === 'arbitrator') ?
                            `<span class="action-link" onclick="ArbitrationModule.goToReview('${a.id}')">复核</span>` :
                            '<span style="color:#999;">-</span>'
                        }
                    </td>
                </tr>
            `;
        }).join('');
    },

    goToReview(arbitrationId) {
        document.querySelectorAll('.sub-tab-btn[data-subtab="arb-review"]').forEach(btn => btn.click());
        showToast(`请在待复核列表中找到 ${arbitrationId} 进行处理`, 'info');
    },

    refreshSelects() {
        const returns = Storage.get(Storage.KEYS.RETURNS);
        const arbPending = returns.filter(r =>
            r.status === 'arbitration' ||
            r.status === 'arbitration_locked' ||
            r.qcResult === 'arbitration' ||
            r.maliciousFlag === 'malicious' ||
            (r.qcResult && !r.arbitrationInfo)
        );

        const arbEl = document.getElementById('arbReturnId');
        if (arbEl) {
            const currentVal = arbEl.value;
            arbEl.innerHTML = '<option value="">请选择案件</option>' +
                arbPending.map(r => {
                    const locked = r.arbitrationConclusionLocked ? ' 🔒' : '';
                    return `<option value="${r.id}">${r.id} (${r.orderId || ''})${locked}</option>`;
                }).join('');
            arbEl.value = currentVal;
        }

        const evidenceReturnEl = document.getElementById('evidenceReturnId');
        if (evidenceReturnEl) {
            const currentVal2 = evidenceReturnEl.value;
            evidenceReturnEl.innerHTML = '<option value="">请选择案件</option>' +
                arbPending.map(r => {
                    const locked = r.arbitrationConclusionLocked ? ' 🔒' : '';
                    return `<option value="${r.id}">${r.id} (${r.orderId || ''})${locked}</option>`;
                }).join('');
            evidenceReturnEl.value = currentVal2;
        }
    },

    refreshAll() {
        this.refreshSelects();
        this.renderPendingList();
        this.renderReviewList();
        this.renderMaliciousList();
        this.renderHistoryList();
        this.renderEvidenceList();
    },

    refreshOthers() {
        if (typeof CustomerService !== 'undefined') CustomerService.renderReturnList();
        if (typeof WarehouseModule !== 'undefined') WarehouseModule.renderWarehouseList();
        if (typeof RefundModule !== 'undefined') RefundModule.refreshAll();
    }
};
