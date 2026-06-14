const RefundModule = {

    init() {
        this.bindCalcForm();
        this.bindChannelForm();
        this.renderRefundList();
        this.refreshSelects();
    },

    bindCalcForm() {
        const form = document.getElementById('refundCalcForm');
        if (!form) return;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitRefundCalc();
        });
    },

    bindChannelForm() {
        const form = document.getElementById('refundChannelForm');
        if (!form) return;
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitRefundChannel();
        });
    },

    autoFillRefundData() {
        const returnId = document.getElementById('refundCalcReturnId').value;
        if (!returnId) return;

        const returnItem = Storage.getById(Storage.KEYS.RETURNS, returnId);
        if (!returnItem) return;

        const sku = Storage.getById(Storage.KEYS.SKUS, returnItem.skuRef);
        const order = Storage.getById(Storage.KEYS.ORDERS, returnItem.orderRef);

        document.getElementById('refundUnitPrice').value = sku ? sku.price : 0;
        document.getElementById('refundQty').value = returnItem.quantity || 1;
        document.getElementById('refundShippingFee').value = order ? order.shippingFee : 0;

        const responsibility = Rules.calculateShippingResponsibility(returnItem, returnItem.qcResult);
        document.getElementById('shippingPayer').value = responsibility.shippingPayer;

        this.calculateRefund();
    },

    calculateRefund() {
        const data = {
            unitPrice: document.getElementById('refundUnitPrice').value,
            quantity: document.getElementById('refundQty').value,
            shippingFee: document.getElementById('refundShippingFee').value,
            returnShipping: document.getElementById('refundReturnShipping').value,
            taxFee: document.getElementById('refundTaxFee').value,
            adjustAmount: document.getElementById('refundAdjust').value,
            platformFee: document.getElementById('refundPlatformFee').value,
            shippingPayer: document.getElementById('shippingPayer').value,
            taxPayer: document.getElementById('taxPayer').value
        };

        const result = Rules.calculateRefund(data);

        document.getElementById('refundGoodsAmount').value = '$' + result.goodsRefund.toFixed(2);
        document.getElementById('calcGoodsRefund').textContent = '$' + result.goodsRefund.toFixed(2);
        document.getElementById('calcShippingRefund').textContent = '$' + result.shippingRefund.toFixed(2);
        document.getElementById('calcTaxRefund').textContent = '$' + result.taxRefund.toFixed(2);
        document.getElementById('calcTotalRefund').textContent = '$' + result.totalRefund.toFixed(2);
    },

    submitRefundCalc() {
        const returnId = document.getElementById('refundCalcReturnId').value;
        if (!returnId) {
            showToast('请选择退换申请', 'error');
            return;
        }

        const data = {
            unitPrice: document.getElementById('refundUnitPrice').value,
            quantity: document.getElementById('refundQty').value,
            shippingFee: document.getElementById('refundShippingFee').value,
            returnShipping: document.getElementById('refundReturnShipping').value,
            taxFee: document.getElementById('refundTaxFee').value,
            adjustAmount: document.getElementById('refundAdjust').value,
            platformFee: document.getElementById('refundPlatformFee').value,
            shippingPayer: document.getElementById('shippingPayer').value,
            taxPayer: document.getElementById('taxPayer').value
        };

        const calc = Rules.calculateRefund(data);

        const refundData = {
            returnId: returnId,
            goodsAmount: calc.goodsRefund,
            shippingFee: calc.shippingRefund,
            returnShipping: parseFloat(data.returnShipping) || 0,
            taxFee: calc.taxRefund,
            adjustAmount: parseFloat(data.adjustAmount) || 0,
            platformFee: parseFloat(data.platformFee) || 0,
            shippingPayer: data.shippingPayer,
            taxPayer: data.taxPayer,
            totalAmount: calc.totalRefund
        };

        const refund = Models.createRefund(refundData);
        Storage.add(Storage.KEYS.REFUNDS, refund);

        Storage.update(Storage.KEYS.RETURNS, returnId, {
            status: 'refund_pending',
            refundRecordId: refund.id,
            refundInfo: refundData
        });

        showToast(`退款试算完成，预计退款 $${calc.totalRefund.toFixed(2)}`, 'success');
        this.renderRefundList();
        this.refreshSelects();
        this.refreshOthers();
    },

    submitRefundChannel() {
        const returnId = document.getElementById('channelReturnId').value;
        const channel = document.getElementById('refundChannel').value;
        const amount = document.getElementById('channelAmount').value;
        const externalTxnId = document.getElementById('externalTxnId').value;
        const remark = document.getElementById('channelRemark').value;

        if (!returnId || !channel || !amount) {
            showToast('请填写必填项', 'error');
            return;
        }

        const refunds = Storage.get(Storage.KEYS.REFUNDS);
        const returnRefund = refunds.find(r => r.returnId === returnId);

        if (returnRefund) {
            Storage.update(Storage.KEYS.REFUNDS, returnRefund.id, {
                channel: channel,
                externalTxnId: externalTxnId,
                remark: remark,
                status: 'completed'
            });
        } else {
            const refund = Models.createRefund({
                returnId: returnId,
                totalAmount: parseFloat(amount) || 0,
                channel: channel,
                externalTxnId: externalTxnId,
                remark: remark
            });
            refund.status = 'completed';
            Storage.add(Storage.KEYS.REFUNDS, refund);
        }

        Storage.update(Storage.KEYS.RETURNS, returnId, {
            status: 'refunded'
        });

        showToast('退款已提交执行', 'success');
        document.getElementById('refundChannelForm').reset();
        this.renderRefundList();
        this.refreshSelects();
        this.refreshOthers();
    },

    renderRefundList() {
        const tbody = document.getElementById('refundList');
        if (!tbody) return;

        const returns = Storage.get(Storage.KEYS.RETURNS);
        const refunds = Storage.get(Storage.KEYS.REFUNDS);

        const refundReturns = returns.filter(r =>
            r.status === 'refund_pending' ||
            r.status === 'refunded' ||
            r.status === 'completed' ||
            r.refundInfo
        );

        if (refundReturns.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="empty-state">暂无退款数据</td></tr>';
            return;
        }

        const channelLabels = {
            'original': '原路退回', 'paypal': 'PayPal', 'stripe': 'Stripe',
            'alipay': '支付宝', 'wechat': '微信支付', 'bank_transfer': '银行转账',
            'store_credit': '店铺余额', 'coupon': '优惠券'
        };

        tbody.innerHTML = refundReturns.map(r => {
            const refund = refunds.find(rf => rf.returnId === r.id);
            const statusBadge = r.status === 'refunded' ? 'badge-success' :
                               r.status === 'refund_pending' ? 'badge-warning' : 'badge-info';
            const statusText = r.status === 'refunded' ? '已退款' :
                               r.status === 'refund_pending' ? '待退款' : '已完成';

            return `
                <tr>
                    <td><strong>${r.id}</strong></td>
                    <td>${r.orderId || '-'}</td>
                    <td>$${refund ? refund.goodsAmount.toFixed(2) : (r.refundInfo ? r.refundInfo.goodsAmount.toFixed(2) : '0.00')}</td>
                    <td>$${refund ? refund.shippingFee.toFixed(2) : '0.00'}</td>
                    <td>$${refund ? refund.taxFee.toFixed(2) : '0.00'}</td>
                    <td><strong>$${refund ? refund.totalAmount.toFixed(2) : (r.refundInfo ? r.refundInfo.totalAmount.toFixed(2) : '0.00')}</strong></td>
                    <td>${refund && refund.channel ? channelLabels[refund.channel] || refund.channel : '-'}</td>
                    <td><span class="badge ${statusBadge}">${statusText}</span></td>
                    <td>
                        ${r.status === 'refund_pending' ? `<span class="action-link" onclick="RefundModule.goToChannel('${r.id}')">执行退款</span>` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    },

    goToChannel(returnId) {
        document.querySelectorAll('.sub-tab-btn[data-subtab="refund-channel"]').forEach(btn => btn.click());
        setTimeout(() => {
            const el = document.getElementById('channelReturnId');
            if (el) el.value = returnId;
        }, 100);
    },

    refreshSelects() {
        const returns = Storage.get(Storage.KEYS.RETURNS);

        const calcPending = returns.filter(r =>
            (r.qcResult === 'pass' || r.status === 'qc_pass' || r.status === 'refund_pending') &&
            r.returnType !== 'exchange' &&
            r.status !== 'refunded' &&
            r.status !== 'completed'
        );
        const calcEl = document.getElementById('refundCalcReturnId');
        if (calcEl) {
            calcEl.innerHTML = '<option value="">请选择申请</option>' +
                calcPending.map(r => `<option value="${r.id}">${r.id} (${r.orderId || ''})</option>`).join('');
        }

        const channelPending = returns.filter(r => r.status === 'refund_pending');
        const channelEl = document.getElementById('channelReturnId');
        if (channelEl) {
            channelEl.innerHTML = '<option value="">请选择申请</option>' +
                channelPending.map(r => `<option value="${r.id}">${r.id} (${r.orderId || ''})</option>`).join('');
        }
    },

    refreshAll() {
        this.refreshSelects();
        this.renderRefundList();
    },

    refreshOthers() {
        if (typeof CustomerService !== 'undefined') CustomerService.renderReturnList();
        if (typeof WarehouseModule !== 'undefined') WarehouseModule.renderWarehouseList();
    }
};
