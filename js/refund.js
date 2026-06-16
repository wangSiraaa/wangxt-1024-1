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

        const orderCurrency = returnItem.orderCurrency || (order ? order.orderCurrency : 'USD');
        const refundCurrency = returnItem.refundCurrency || orderCurrency;
        const orderCurrEl = document.getElementById('refundOrderCurrency');
        const refundCurrEl = document.getElementById('refundRefundCurrency');
        if (orderCurrEl) orderCurrEl.value = orderCurrency;
        if (refundCurrEl) refundCurrEl.value = refundCurrency;

        const orderCurrDisplayEl = document.getElementById('refundOrderCurrencyDisplay');
        const refundCurrDisplayEl = document.getElementById('refundRefundCurrencyDisplay');
        const rateDisplayEl2 = document.getElementById('refundExchangeRateDisplay');
        if (orderCurrDisplayEl) orderCurrDisplayEl.value = orderCurrency;
        if (refundCurrDisplayEl) refundCurrDisplayEl.value = refundCurrency;

        const crossWarehouseFee = returnItem.crossWarehouseShippingCost || 0;
        const tariffFee = returnItem.tariffAmount || 0;
        const crossWarehouseFeeEl = document.getElementById('refundCrossWarehouseFee');
        const tariffFeeEl = document.getElementById('refundTariffFee');
        if (crossWarehouseFeeEl) crossWarehouseFeeEl.value = crossWarehouseFee;
        if (tariffFeeEl) tariffFeeEl.value = tariffFee;

        let exchangeRate = 1;
        if (orderCurrency !== refundCurrency) {
            const fromRate = Models.EXCHANGE_RATES[orderCurrency] || 1;
            const toRate = Models.EXCHANGE_RATES[refundCurrency] || 1;
            exchangeRate = Number((toRate / fromRate).toFixed(6));
        }
        const rateEl = document.getElementById('refundExchangeRate');
        if (rateEl) rateEl.value = exchangeRate;
        const rateDisplayEl = document.getElementById('calcExchangeRateDisplay');
        if (rateDisplayEl) {
            rateDisplayEl.textContent = orderCurrency !== refundCurrency
                ? `1 ${orderCurrency} = ${exchangeRate} ${refundCurrency}`
                : `${orderCurrency} = ${refundCurrency} (同币种)`;
        }
        if (rateDisplayEl2) {
            rateDisplayEl2.value = orderCurrency !== refundCurrency
                ? `1 ${orderCurrency} = ${exchangeRate} ${refundCurrency}`
                : `${orderCurrency} (同币种)`;
        }

        const responsibility = Rules.calculateShippingResponsibility(returnItem, returnItem.qcResult);
        document.getElementById('shippingPayer').value = responsibility.shippingPayer;

        this.calculateRefund();
    },

    calculateRefund() {
        const orderCurrency = (document.getElementById('refundOrderCurrency') || {}).value || 'USD';
        const refundCurrency = (document.getElementById('refundRefundCurrency') || {}).value || 'USD';
        const crossWarehouseFee = (document.getElementById('refundCrossWarehouseFee') || {}).value || 0;
        const tariffFee = (document.getElementById('refundTariffFee') || {}).value || 0;

        let exchangeRate = 1;
        if (orderCurrency !== refundCurrency) {
            const fromRate = Models.EXCHANGE_RATES[orderCurrency] || 1;
            const toRate = Models.EXCHANGE_RATES[refundCurrency] || 1;
            exchangeRate = Number((toRate / fromRate).toFixed(6));
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
            taxPayer: document.getElementById('taxPayer').value,
            orderCurrency: orderCurrency,
            refundCurrency: refundCurrency,
            crossWarehouseFee: crossWarehouseFee,
            tariffFee: tariffFee
        };

        const result = Rules.calculateRefund(data);

        document.getElementById('refundGoodsAmount').value = formatCurrency(result.goodsRefund, orderCurrency);
        document.getElementById('calcGoodsRefund').textContent = formatCurrency(result.goodsRefund, orderCurrency);
        document.getElementById('calcShippingRefund').textContent = formatCurrency(result.shippingRefund, orderCurrency);
        document.getElementById('calcTaxRefund').textContent = formatCurrency(result.taxRefund, orderCurrency);

        const totalEl = document.getElementById('calcTotalRefund');
        if (totalEl) totalEl.textContent = formatCurrency(result.totalRefund, orderCurrency);

        const totalInRefundEl = document.getElementById('calcTotalInRefundCurrency');
        const totalInRefundRowEl = document.getElementById('calcTotalInRefundCurrencyRow');
        if (totalInRefundEl) {
            totalInRefundEl.textContent = orderCurrency !== refundCurrency
                ? formatCurrency(result.totalInRefundCurrency, refundCurrency)
                : '';
        }
        if (totalInRefundRowEl) {
            totalInRefundRowEl.style.display = (orderCurrency !== refundCurrency && result.totalInRefundCurrency) ? 'flex' : 'none';
        }

        const crossFeeDisplayEl = document.getElementById('calcCrossWarehouseFee');
        if (crossFeeDisplayEl) crossFeeDisplayEl.textContent = formatCurrency(result.crossWarehouseFee, orderCurrency);

        const tariffDisplayEl = document.getElementById('calcTariffFee');
        if (tariffDisplayEl) tariffDisplayEl.textContent = formatCurrency(result.tariffFee, orderCurrency);
    },

    submitRefundCalc() {
        const returnId = document.getElementById('refundCalcReturnId').value;
        if (!returnId) {
            showToast('请选择退换申请', 'error');
            return;
        }

        const orderCurrency = (document.getElementById('refundOrderCurrency') || {}).value || 'USD';
        const refundCurrency = (document.getElementById('refundRefundCurrency') || {}).value || 'USD';
        const crossWarehouseFee = (document.getElementById('refundCrossWarehouseFee') || {}).value || 0;
        const tariffFee = (document.getElementById('refundTariffFee') || {}).value || 0;

        let exchangeRate = 1;
        if (orderCurrency !== refundCurrency) {
            const fromRate = Models.EXCHANGE_RATES[orderCurrency] || 1;
            const toRate = Models.EXCHANGE_RATES[refundCurrency] || 1;
            exchangeRate = Number((toRate / fromRate).toFixed(6));
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
            taxPayer: document.getElementById('taxPayer').value,
            orderCurrency: orderCurrency,
            refundCurrency: refundCurrency,
            crossWarehouseFee: crossWarehouseFee,
            tariffFee: tariffFee
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
            totalAmount: calc.totalRefund,
            orderCurrency: orderCurrency,
            refundCurrency: refundCurrency,
            exchangeRate: exchangeRate,
            totalInRefundCurrency: calc.totalInRefundCurrency,
            crossWarehouseFee: calc.crossWarehouseFee,
            tariffFee: calc.tariffFee
        };

        const refund = Models.createRefund(refundData);
        Storage.add(Storage.KEYS.REFUNDS, refund);

        Storage.update(Storage.KEYS.RETURNS, returnId, {
            status: 'refund_pending',
            refundRecordId: refund.id,
            refundInfo: refundData,
            orderCurrency: orderCurrency,
            refundCurrency: refundCurrency,
            exchangeRate: exchangeRate
        });

        const totalMsg = orderCurrency !== refundCurrency
            ? `${formatCurrency(calc.totalRefund, orderCurrency)} / ${formatCurrency(calc.totalInRefundCurrency, refundCurrency)}`
            : formatCurrency(calc.totalRefund, orderCurrency);
        showToast(`退款试算完成，预计退款 ${totalMsg}`, 'success');
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
            const returnItem = Storage.getById(Storage.KEYS.RETURNS, returnId);
            const orderCurrency = returnItem ? (returnItem.orderCurrency || 'USD') : 'USD';
            const refundCurrency = returnItem ? (returnItem.refundCurrency || orderCurrency) : 'USD';

            const refund = Models.createRefund({
                returnId: returnId,
                totalAmount: parseFloat(amount) || 0,
                channel: channel,
                externalTxnId: externalTxnId,
                remark: remark,
                orderCurrency: orderCurrency,
                refundCurrency: refundCurrency
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
            tbody.innerHTML = '<tr><td colspan="11" class="empty-state">暂无退款数据</td></tr>';
            return;
        }

        const channelLabels = {
            'original': '原路退回', 'paypal': 'PayPal', 'stripe': 'Stripe',
            'alipay': '支付宝', 'wechat': '微信支付', 'bank_transfer': '银行转账',
            'store_credit': '店铺余额', 'coupon': '优惠券'
        };

        tbody.innerHTML = refundReturns.map(r => {
            const refund = refunds.find(rf => rf.returnId === r.id);
            const refundInfo = r.refundInfo || {};
            const orderCurrency = (refund && refund.orderCurrency) || refundInfo.orderCurrency || 'USD';
            const refundCurrency = (refund && refund.refundCurrency) || refundInfo.refundCurrency || orderCurrency;

            const goodsAmount = refund ? refund.goodsAmount : refundInfo.goodsAmount || 0;
            const shippingFee = refund ? refund.shippingFee : refundInfo.shippingFee || 0;
            const taxFee = refund ? refund.taxFee : refundInfo.taxFee || 0;
            const totalAmount = refund ? refund.totalAmount : refundInfo.totalAmount || 0;
            const crossWarehouseFee = refund ? refund.crossWarehouseFee : refundInfo.crossWarehouseFee || 0;
            const tariffFee = refund ? refund.tariffFee : refundInfo.tariffFee || 0;
            const totalInRefundCurrency = refund ? refund.totalInRefundCurrency : refundInfo.totalInRefundCurrency || 0;

            const statusBadge = r.status === 'refunded' ? 'badge-success' :
                               r.status === 'refund_pending' ? 'badge-warning' : 'badge-info';
            const statusText = r.status === 'refunded' ? '已退款' :
                               r.status === 'refund_pending' ? '待退款' : '已完成';

            let refundCurrencyCol = '';
            if (orderCurrency !== refundCurrency && totalInRefundCurrency) {
                refundCurrencyCol = `<br><small class="text-muted">${formatCurrency(totalInRefundCurrency, refundCurrency)}</small>`;
            }

            return `
                <tr>
                    <td><strong>${r.id}</strong></td>
                    <td>${r.orderId || '-'}</td>
                    <td>${formatCurrency(goodsAmount, orderCurrency)}</td>
                    <td>${formatCurrency(shippingFee, orderCurrency)}</td>
                    <td>${formatCurrency(taxFee, orderCurrency)}</td>
                    <td>${formatCurrency(crossWarehouseFee, orderCurrency)}</td>
                    <td>${formatCurrency(tariffFee, orderCurrency)}</td>
                    <td><strong>${formatCurrency(totalAmount, orderCurrency)}${refundCurrencyCol}</strong></td>
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
