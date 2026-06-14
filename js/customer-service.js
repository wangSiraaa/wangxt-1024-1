const CustomerService = {

    init() {
        this.bindOrderForm();
        this.bindSkuForm();
        this.bindReturnForm();
        this.renderOrderList();
        this.renderSkuList();
        this.renderReturnList();
        this.refreshOrderSelects();
        this.refreshSkuSelects();
    },

    bindOrderForm() {
        const form = document.getElementById('orderForm');
        if (!form) return;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveOrder();
        });
    },

    bindSkuForm() {
        const form = document.getElementById('skuForm');
        if (!form) return;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSku();
        });
    },

    bindReturnForm() {
        const form = document.getElementById('returnForm');
        if (!form) return;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitReturn();
        });
    },

    saveOrder() {
        const data = {
            orderId: document.getElementById('orderId').value.trim(),
            buyerAccount: document.getElementById('buyerAccount').value.trim(),
            country: document.getElementById('country').value,
            orderTime: document.getElementById('orderTime').value,
            receiveTime: document.getElementById('receiveTime').value || null,
            returnDeadline: document.getElementById('returnDeadline').value,
            orderAmount: document.getElementById('orderAmount').value,
            shippingFee: document.getElementById('shippingFee').value
        };

        if (!data.orderId || !data.country || !data.orderTime) {
            showToast('请填写必填项', 'error');
            return;
        }

        const orders = Storage.get(Storage.KEYS.ORDERS);
        const exists = orders.find(o => o.orderId === data.orderId);
        if (exists) {
            showToast('订单号已存在', 'error');
            return;
        }

        const order = Models.createOrder(data);
        Storage.add(Storage.KEYS.ORDERS, order);
        showToast('订单保存成功', 'success');
        document.getElementById('orderForm').reset();
        this.renderOrderList();
        this.refreshOrderSelects();
    },

    saveSku() {
        const data = {
            skuCode: document.getElementById('skuCode').value.trim(),
            skuName: document.getElementById('skuName').value.trim(),
            size: document.getElementById('skuSize').value,
            color: document.getElementById('skuColor').value.trim(),
            stock: document.getElementById('skuStock').value,
            safeStock: document.getElementById('skuSafeStock').value,
            price: document.getElementById('skuPrice').value,
            weight: document.getElementById('skuWeight').value
        };

        if (!data.skuCode || !data.size) {
            showToast('请填写必填项', 'error');
            return;
        }

        const skus = Storage.get(Storage.KEYS.SKUS);
        const exists = skus.find(s => s.skuCode === data.skuCode);
        if (exists) {
            Storage.update(Storage.KEYS.SKUS, exists.id, data);
            showToast('SKU已更新', 'success');
        } else {
            const sku = Models.createSku(data);
            Storage.add(Storage.KEYS.SKUS, sku);
            showToast('SKU保存成功', 'success');
        }

        document.getElementById('skuForm').reset();
        this.renderSkuList();
        this.refreshSkuSelects();
    },

    submitReturn() {
        const orderSelect = document.getElementById('returnOrderId');
        const skuSelect = document.getElementById('returnSkuCode');

        const orderRef = orderSelect.value;
        const skuRef = skuSelect.value;

        if (!orderRef || !skuRef) {
            showToast('请选择订单和SKU', 'error');
            return;
        }

        const order = Storage.getById(Storage.KEYS.ORDERS, orderRef);
        const sku = Storage.getById(Storage.KEYS.SKUS, skuRef);

        const data = {
            orderId: order ? order.orderId : '',
            orderRef: orderRef,
            skuCode: sku ? sku.skuCode : '',
            skuRef: skuRef,
            returnType: document.getElementById('returnType').value,
            quantity: document.getElementById('returnQty').value,
            reason: document.getElementById('returnReason').value,
            exchangeSize: document.getElementById('exchangeSize').value || null,
            maliciousFlag: document.getElementById('maliciousFlag').value,
            applyTime: document.getElementById('applyTime').value || new Date().toISOString(),
            remark: document.getElementById('returnRemark').value
        };

        const validation = Rules.validateReturnSubmission(order, data);
        if (!validation.valid) {
            showToast(validation.errors[0], 'error');
            return;
        }

        if (validation.warnings.length > 0) {
            const confirmed = confirm(validation.warnings.join('\n') + '\n\n是否继续提交？');
            if (!confirmed) return;
        }

        const returnItem = Models.createReturn(data);

        const deadline = Rules.getOrderDeadline(order);
        returnItem.deadlineTime = deadline ? deadline.toISOString() : null;

        if (Rules.checkNeedFeedback(returnItem)) {
            returnItem.status = 'pending';
        } else {
            returnItem.status = 'warehouse_pending';
        }

        if (data.maliciousFlag === 'malicious') {
            returnItem.status = 'arbitration';
        }

        Storage.add(Storage.KEYS.RETURNS, returnItem);
        showToast(`退换申请提交成功，编号：${returnItem.id}`, 'success');
        document.getElementById('returnForm').reset();
        this.renderReturnList();
        this.refreshAllSelects();
    },

    renderOrderList() {
        const tbody = document.getElementById('orderList');
        if (!tbody) return;
        const orders = Storage.get(Storage.KEYS.ORDERS);

        if (orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="empty-state">暂无订单数据，请先录入订单</td></tr>';
            return;
        }

        tbody.innerHTML = orders.map(order => {
            const remaining = Rules.getRemainingDays(order);
            const deadline = Rules.getOrderDeadline(order);
            let statusBadge = 'badge-success';
            let statusText = '正常';
            if (remaining < 0) {
                statusBadge = 'badge-danger';
                statusText = '已超期';
            } else if (remaining <= 3) {
                statusBadge = 'badge-warning';
                statusText = '即将到期';
            }

            return `
                <tr>
                    <td><strong>${order.orderId}</strong></td>
                    <td>${order.buyerAccount || '-'}</td>
                    <td>${order.country}</td>
                    <td>${formatDateTime(order.orderTime)}</td>
                    <td>${order.receiveTime ? formatDateTime(order.receiveTime) : '-'}</td>
                    <td>${order.returnDeadline}天</td>
                    <td><span class="badge ${remaining < 0 ? 'badge-danger' : 'badge-info'}">${remaining >= 0 ? remaining + '天' : '超期' + Math.abs(remaining) + '天'}</span></td>
                    <td>$${(parseFloat(order.orderAmount) || 0).toFixed(2)}</td>
                    <td><span class="badge ${statusBadge}">${statusText}</span></td>
                </tr>
            `;
        }).join('');
    },

    renderSkuList() {
        const tbody = document.getElementById('skuList');
        if (!tbody) return;
        const skus = Storage.get(Storage.KEYS.SKUS);

        if (skus.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state">暂无SKU数据，请先录入SKU</td></tr>';
            return;
        }

        tbody.innerHTML = skus.map(sku => {
            const stock = parseInt(sku.stock) || 0;
            const safeStock = parseInt(sku.safeStock) || 0;
            let statusBadge = 'badge-success';
            let statusText = '正常';
            if (stock === 0) {
                statusBadge = 'badge-danger';
                statusText = '缺货';
            } else if (stock <= safeStock) {
                statusBadge = 'badge-warning';
                statusText = '库存不足';
            }

            return `
                <tr>
                    <td><strong>${sku.skuCode}</strong></td>
                    <td>${sku.skuName || '-'}</td>
                    <td><span class="badge badge-info">${sku.size}</span></td>
                    <td>${sku.color || '-'}</td>
                    <td><strong>${stock}</strong></td>
                    <td>${safeStock}</td>
                    <td>$${(parseFloat(sku.price) || 0).toFixed(2)}</td>
                    <td><span class="badge ${statusBadge}">${statusText}</span></td>
                </tr>
            `;
        }).join('');
    },

    renderReturnList() {
        const tbody = document.getElementById('returnList');
        if (!tbody) return;

        const filterStatus = document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : '';
        const filterKeyword = document.getElementById('filterKeyword') ? document.getElementById('filterKeyword').value.trim().toLowerCase() : '';

        let returns = Storage.get(Storage.KEYS.RETURNS);

        if (filterStatus) {
            returns = returns.filter(r => r.status === filterStatus);
        }
        if (filterKeyword) {
            returns = returns.filter(r =>
                (r.orderId && r.orderId.toLowerCase().includes(filterKeyword)) ||
                (r.skuCode && r.skuCode.toLowerCase().includes(filterKeyword))
            );
        }

        if (returns.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="empty-state">暂无退换申请数据</td></tr>';
            return;
        }

        tbody.innerHTML = returns.map(r => {
            const canModifyReason = Rules.canModifyReason(r);
            const reasonInfo = Models.REASON_MAP[r.reason] || { zh: r.reason };
            return `
                <tr>
                    <td><strong>${r.id}</strong></td>
                    <td>${r.orderId || '-'}</td>
                    <td>${r.skuCode || '-'}</td>
                    <td>${Models.RETURN_TYPE_LABEL[r.returnType] || r.returnType}</td>
                    <td>${reasonInfo.zh}${r.reasonLocked ? ' 🔒' : ''}</td>
                    <td>${r.quantity}</td>
                    <td><span class="badge ${Models.MALICIOUS_BADGE[r.maliciousFlag]}">${Models.MALICIOUS_LABEL[r.maliciousFlag]}</span></td>
                    <td><span class="badge ${Models.RETURN_STATUS_BADGE[r.status]}">${Models.RETURN_STATUS_LABEL[r.status]}</span></td>
                    <td>${r.deadlineTime ? formatDateTime(r.deadlineTime) : '-'}</td>
                    <td>
                        <span class="action-link ${canModifyReason ? '' : 'disabled'}"
                              onclick="${canModifyReason ? `CustomerService.editReturnReason('${r.id}')` : 'void(0)'}">
                            改原因
                        </span>
                        <span class="action-link danger" onclick="CustomerService.deleteReturn('${r.id}')">删除</span>
                    </td>
                </tr>
            `;
        }).join('');
    },

    editReturnReason(returnId) {
        const returnItem = Storage.getById(Storage.KEYS.RETURNS, returnId);
        if (!returnItem) return;

        const check = Rules.validateReasonModification(returnItem);
        if (!check.allowed) {
            showToast(check.reason, 'error');
            return;
        }

        const reasonOptions = Object.entries(Models.REASON_MAP).map(([code, info]) =>
            `<option value="${code}" ${code === returnItem.reason ? 'selected' : ''}>${info.zh}</option>`
        ).join('');

        const newReason = prompt(`请选择新的退换原因：\n\n(输入对应编号：\n${Object.entries(Models.REASON_MAP).map(([c, i]) => `${c} - ${i.zh}`).join('\n')})`, returnItem.reason);

        if (newReason && Models.REASON_MAP[newReason]) {
            Storage.update(Storage.KEYS.RETURNS, returnId, { reason: newReason });
            showToast('原因修改成功', 'success');
            this.renderReturnList();
        } else if (newReason) {
            showToast('原因编号无效', 'error');
        }
    },

    deleteReturn(returnId) {
        if (!confirm('确定删除此退换申请？此操作不可撤销。')) return;
        Storage.remove(Storage.KEYS.RETURNS, returnId);
        showToast('已删除', 'success');
        this.renderReturnList();
        this.refreshAllSelects();
    },

    refreshOrderSelects() {
        const orders = Storage.get(Storage.KEYS.ORDERS);
        const options = orders.map(o => `<option value="${o.id}">${o.orderId} (${o.country})</option>`).join('');

        ['returnOrderId'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const current = el.value;
                el.innerHTML = '<option value="">请选择订单</option>' + options;
                el.value = current;
            }
        });
    },

    refreshSkuSelects() {
        const skus = Storage.get(Storage.KEYS.SKUS);
        const options = skus.map(s => `<option value="${s.id}">${s.skuCode} (${s.size})</option>`).join('');

        ['returnSkuCode'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const current = el.value;
                el.innerHTML = '<option value="">请选择SKU</option>' + options;
                el.value = current;
            }
        });
    },

    refreshAllSelects() {
        this.refreshOrderSelects();
        this.refreshSkuSelects();
    }
};
