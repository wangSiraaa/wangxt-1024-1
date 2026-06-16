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
        const country = document.getElementById('country').value;
        const currencyInfo = Models.CURRENCIES[country] || { code: 'USD', symbol: '$' };

        const data = {
            orderId: document.getElementById('orderId').value.trim(),
            buyerAccount: document.getElementById('buyerAccount').value.trim(),
            country: country,
            orderTime: document.getElementById('orderTime').value,
            receiveTime: document.getElementById('receiveTime').value || null,
            returnDeadline: document.getElementById('returnDeadline').value,
            orderAmount: document.getElementById('orderAmount').value,
            shippingFee: document.getElementById('shippingFee').value,
            orderCurrency: currencyInfo.code,
            originWarehouse: document.getElementById('originWarehouse') ? document.getElementById('originWarehouse').value : 'CN_SZ'
        };

        if (!data.orderId || !data.country || !data.orderTime || !data.originWarehouse) {
            showToast('请填写必填项（订单号、国家、下单时间、发货仓库）', 'error');
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
        const stock = parseInt(document.getElementById('skuStock').value) || 0;

        const data = {
            skuCode: document.getElementById('skuCode').value.trim(),
            skuName: document.getElementById('skuName').value.trim(),
            size: document.getElementById('skuSize').value,
            color: document.getElementById('skuColor').value.trim(),
            stock: stock,
            safeStock: document.getElementById('skuSafeStock').value,
            price: document.getElementById('skuPrice').value,
            weight: document.getElementById('skuWeight').value,
            warehouseStocks: {
                'CN_SZ': stock,
                'CN_BONDED': 0,
                'US_LA': 0,
                'DE_FRA': 0,
                'JP_TYO': 0,
                'UK_LON': 0
            }
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

        const originWarehouse = order ? order.originWarehouse : 'CN_SZ';
        const targetWarehouseEl = document.getElementById('targetWarehouse');
        const targetWarehouse = targetWarehouseEl ? targetWarehouseEl.value : originWarehouse;
        const orderCurrency = order ? order.orderCurrency : 'USD';
        const refundCurrencyEl = document.getElementById('refundCurrency');
        let refundCurrency = refundCurrencyEl ? refundCurrencyEl.value : '';
        if (!refundCurrency) {
            refundCurrency = orderCurrency;
        }

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
            remark: document.getElementById('returnRemark').value,
            originWarehouse: originWarehouse,
            targetWarehouse: targetWarehouse,
            warehouseCrossType: Models.getWarehouseCrossType(originWarehouse, targetWarehouse),
            orderCurrency: orderCurrency,
            refundCurrency: refundCurrency,
            exchangeRate: Models.EXCHANGE_RATES && orderCurrency && refundCurrency
                ? Number((Models.EXCHANGE_RATES[refundCurrency] / Models.EXCHANGE_RATES[orderCurrency]).toFixed(6))
                : 1
        };

        const tariffResponsibilityEl = document.getElementById('tariffResponsibility');
        if (tariffResponsibilityEl) {
            data.tariffResponsibility = tariffResponsibilityEl.value;
        } else {
            data.tariffResponsibility = 'seller';
        }

        const tariffAmountEl = document.getElementById('tariffAmount');
        if (tariffAmountEl) {
            data.tariffAmount = parseFloat(tariffAmountEl.value) || 0;
        } else {
            data.tariffAmount = 0;
        }

        const validation = Rules.validateReturnSubmission(order, data);
        if (!validation.valid) {
            showToast(validation.errors[0], 'error');
            return;
        }

        if (validation.overdueCheck && validation.overdueCheck.overdue) {
            data.status = 'overdue_intercepted';
        }

        if (validation.warnings.length > 0) {
            const confirmed = confirm(validation.warnings.join('\n') + '\n\n是否继续提交？');
            if (!confirmed) return;
        }

        const returnItem = Models.createReturn(data);

        const deadline = Rules.getOrderDeadline(order);
        returnItem.deadlineTime = deadline ? deadline.toISOString() : null;

        if (validation.overdueCheck && validation.overdueCheck.overdue) {
            returnItem.status = 'overdue_intercepted';
        } else if (Rules.checkNeedFeedback(returnItem)) {
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
            tbody.innerHTML = '<tr><td colspan="10" class="empty-state">暂无订单数据，请先录入订单</td></tr>';
            return;
        }

        tbody.innerHTML = orders.map(order => {
            const remaining = Rules.getRemainingDays(order);
            const deadline = Rules.getOrderDeadline(order);
            const currencyInfo = Models.CURRENCIES[order.country] || { code: 'USD', symbol: '$' };
            const warehouseInfo = Models.WAREHOUSES[order.originWarehouse];
            const warehouseName = warehouseInfo ? warehouseInfo.name : (order.originWarehouse || '-');

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
                    <td>${formatCurrency(order.orderAmount, currencyInfo.code)}</td>
                    <td><span class="badge badge-info">${warehouseName}</span></td>
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
            const ws = sku.warehouseStocks || {};
            const warehouseSummary = Object.entries(ws)
                .filter(([, v]) => parseInt(v) > 0)
                .map(([k, v]) => {
                    const wh = Models.WAREHOUSES[k];
                    const label = wh ? wh.name.split('仓')[0] : k;
                    return `${label}:${v}`;
                })
                .join(' ') || '无库存分配';

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
                    <td title="${warehouseSummary}">${formatCurrency(sku.price, 'USD')}</td>
                    <td><span class="badge ${statusBadge}">${statusText}</span><br><small class="warehouse-summary">${warehouseSummary}</small></td>
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

            const statusBadge = `<span class="badge ${Models.RETURN_STATUS_BADGE[r.status] || 'badge-default'}">${Models.RETURN_STATUS_LABEL[r.status] || r.status}</span>`;

            const originWh = Models.WAREHOUSES[r.originWarehouse];
            const targetWh = Models.WAREHOUSES[r.targetWarehouse];
            const originLabel = originWh ? originWh.name.split('仓')[0] : (r.originWarehouse || '-');
            const targetLabel = targetWh ? targetWh.name.split('仓')[0] : (r.targetWarehouse || '-');
            const crossTypeLabel = r.warehouseCrossType ? (Models.WAREHOUSE_CROSS_TYPES[r.warehouseCrossType] || '') : '';
            let warehouseInfo = `${originLabel}→${targetLabel}`;
            if (crossTypeLabel && r.warehouseCrossType !== 'same') {
                warehouseInfo += `<br><small class="cross-type">${crossTypeLabel}</small>`;
            }

            const orderCurr = r.orderCurrency || 'USD';
            const refundCurr = r.refundCurrency || orderCurr;
            const rateInfo = r.exchangeRate ? ` (×${r.exchangeRate})` : '';
            const currencyInfo = orderCurr === refundCurr
                ? `<span class="badge badge-info">${orderCurr}</span>`
                : `<span class="badge badge-info">${orderCurr}</span>→<span class="badge badge-warning">${refundCurr}${rateInfo}</span>`;

            const tariffLabel = Models.TARIFF_LABEL[r.tariffResponsibility] || r.tariffResponsibility;
            const tariffBadge = `<span class="badge ${r.tariffResponsibility === 'seller' ? 'badge-success' : r.tariffResponsibility === 'buyer' ? 'badge-danger' : 'badge-warning'}">${tariffLabel}</span>`;

            const qcMismatchIcon = r.qcMismatchTriggered ? ' ⚠️' : '';
            const arbitrationLockIcon = r.arbitrationConclusionLocked ? ' 🔒' : '';

            return `
                <tr>
                    <td><strong>${r.id}</strong></td>
                    <td>${r.orderId || '-'}</td>
                    <td>${r.skuCode || '-'}</td>
                    <td>${statusBadge}${qcMismatchIcon}${arbitrationLockIcon}</td>
                    <td>${warehouseInfo}</td>
                    <td><span class="badge badge-info">${currencyInfo}</span></td>
                    <td>${tariffBadge}</td>
                    <td>${reasonInfo.zh}${r.reasonLocked ? ' 🔒' : ''}</td>
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

        const returnOrderEl = document.getElementById('returnOrderId');
        if (returnOrderEl) {
            returnOrderEl.removeEventListener('change', this._onReturnOrderChange);
            this._onReturnOrderChange = () => {
                const orderId = returnOrderEl.value;
                const order = Storage.getById(Storage.KEYS.ORDERS, orderId);
                const targetWhEl = document.getElementById('targetWarehouse');
                if (order && targetWhEl) {
                    const originWh = order.originWarehouse || 'CN_SZ';
                    targetWhEl.value = '';
                }
                const currencyInfo = order && Models.CURRENCIES[order.country]
                    ? Models.CURRENCIES[order.country]
                    : { code: 'USD', name: '美元', symbol: '$' };
                const orderCurrencyDisplayEl = document.getElementById('orderCurrencyDisplay');
                if (orderCurrencyDisplayEl && order) {
                    orderCurrencyDisplayEl.value = `${currencyInfo.code} (${currencyInfo.name} ${currencyInfo.symbol})`;
                } else if (orderCurrencyDisplayEl) {
                    orderCurrencyDisplayEl.value = '';
                }
                const refundCurrencyEl = document.getElementById('refundCurrency');
                if (refundCurrencyEl && order) {
                    if (!refundCurrencyEl.value || refundCurrencyEl.dataset.touched !== 'true') {
                        refundCurrencyEl.value = currencyInfo.code;
                    }
                }
                const tariffAmountEl = document.getElementById('tariffAmount');
                if (tariffAmountEl && !tariffAmountEl.value) {
                    tariffAmountEl.value = '0';
                }
            };
            returnOrderEl.addEventListener('change', this._onReturnOrderChange);
        }

        const refundCurrencyEl = document.getElementById('refundCurrency');
        if (refundCurrencyEl) {
            refundCurrencyEl.addEventListener('change', () => {
                refundCurrencyEl.dataset.touched = 'true';
            });
        }
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
