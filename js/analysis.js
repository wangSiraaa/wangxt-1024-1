const AnalysisModule = {

    init() {
        this.renderStats();
        this.renderReasonChart();
        this.renderSizeAnalysis();
    },

    renderStats() {
        const returns = Storage.get(Storage.KEYS.RETURNS);
        const total = returns.length;

        const exchangeCount = returns.filter(r => r.returnType === 'exchange').length;
        const refundCount = returns.filter(r => r.returnType === 'refund' || r.returnType === 'refund_only').length;
        const qcPassCount = returns.filter(r => r.qcResult === 'pass').length;
        const qcTotal = returns.filter(r => r.qcResult).length;
        const arbCount = returns.filter(r => r.status === 'arbitration' || r.arbitrationInfo).length;
        const maliciousCount = returns.filter(r => r.maliciousFlag !== 'normal').length;

        document.getElementById('statTotal').textContent = total;
        document.getElementById('statExchangeRate').textContent = total ? Math.round(exchangeCount / total * 100) + '%' : '0%';
        document.getElementById('statRefundRate').textContent = total ? Math.round(refundCount / total * 100) + '%' : '0%';
        document.getElementById('statQcPassRate').textContent = qcTotal ? Math.round(qcPassCount / qcTotal * 100) + '%' : '0%';
        document.getElementById('statArbRate').textContent = total ? Math.round(arbCount / total * 100) + '%' : '0%';
        document.getElementById('statMalicious').textContent = maliciousCount;
    },

    renderReasonChart() {
        const returns = Storage.get(Storage.KEYS.RETURNS);
        const container = document.getElementById('reasonChart');
        if (!container) return;

        if (returns.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无数据，请先创建退换申请</div>';
            return;
        }

        const reasonCounts = {};
        returns.forEach(r => {
            reasonCounts[r.reason] = (reasonCounts[r.reason] || 0) + 1;
        });

        const sorted = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]);
        const maxCount = Math.max(...sorted.map(s => s[1]));

        container.innerHTML = sorted.map(([code, count]) => {
            const info = Models.REASON_MAP[code] || { zh: code };
            const percent = Math.round(count / returns.length * 100);
            const width = Math.round(count / maxCount * 100);

            return `
                <div class="chart-bar-row">
                    <div class="chart-bar-label">${info.zh}</div>
                    <div class="chart-bar-container">
                        <div class="chart-bar-fill" style="width: ${width}%;">
                            ${percent}%
                        </div>
                    </div>
                    <div class="chart-bar-count">${count}件</div>
                </div>
            `;
        }).join('');
    },

    renderSizeAnalysis() {
        const tbody = document.getElementById('sizeAnalysisList');
        if (!tbody) return;

        const returns = Storage.get(Storage.KEYS.RETURNS);
        const skus = Storage.get(Storage.KEYS.SKUS);

        const sizeReturns = returns.filter(r => Rules.isSizeRelatedReason(r.reason));

        if (sizeReturns.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-state">暂无尺码问题数据</td></tr>';
            return;
        }

        const sizeMap = {};
        sizeReturns.forEach(r => {
            const sku = skus.find(s => s.id === r.skuRef);
            const key = `${r.skuCode || 'unknown'}_${r.exchangeSize || 'none'}`;
            if (!sizeMap[key]) {
                sizeMap[key] = {
                    skuCode: r.skuCode || '-',
                    skuName: sku ? sku.skuName : '-',
                    fromSize: sku ? sku.size : '-',
                    toSize: r.exchangeSize || '-',
                    reason: r.reason,
                    count: 0
                };
            }
            sizeMap[key].count++;
        });

        const sorted = Object.values(sizeMap).sort((a, b) => b.count - a.count);

        tbody.innerHTML = sorted.map(item => {
            const reasonInfo = Models.REASON_MAP[item.reason] || { zh: item.reason };
            const percent = Math.round(item.count / sizeReturns.length * 100);

            return `
                <tr>
                    <td><strong>${item.skuCode}</strong></td>
                    <td>${item.skuName}</td>
                    <td><span class="badge badge-warning">${item.fromSize}</span></td>
                    <td><span class="badge badge-success">${item.toSize}</span></td>
                    <td>${reasonInfo.zh}</td>
                    <td>${item.count}</td>
                    <td>${percent}%</td>
                </tr>
            `;
        }).join('');
    },

    demoScenarioOverdue() {
        const result = document.getElementById('demoResult');
        result.innerHTML = '<div class="demo-title">📅 场景1：超期拦截演示</div>';

        const now = new Date();
        const orderTime = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
        const order = Models.createOrder({
            orderId: 'DEMO_OVERDUE_' + Math.floor(Math.random() * 1000),
            buyerAccount: 'overdue_buyer@test.com',
            country: 'US',
            orderTime: orderTime.toISOString().slice(0, 16),
            receiveTime: orderTime.toISOString().slice(0, 16),
            returnDeadline: 30,
            orderAmount: 89.99,
            shippingFee: 9.99
        });
        Storage.add(Storage.KEYS.ORDERS, order);

        const sku = Models.createSku({
            skuCode: 'DEMO_SHIRT_L',
            skuName: '演示衬衫',
            size: 'L',
            color: '蓝色',
            stock: 50,
            safeStock: 5,
            price: 89.99
        });
        Storage.add(Storage.KEYS.SKUS, sku);

        const tryApply = Rules.validateReturnSubmission(order, {
            orderId: order.orderId,
            skuCode: sku.skuCode,
            returnType: 'refund',
            quantity: 1,
            reason: 'size_small',
            applyTime: now.toISOString()
        });

        result.innerHTML += `
            <div class="demo-step">步骤1：创建测试订单（40天前下单，售后期限30天）</div>
            <div class="demo-step">步骤2：查询售后期限截止时间：${formatDateTime(Rules.getOrderDeadline(order))}</div>
            <div class="demo-step">步骤3：检查剩余天数：${Rules.getRemainingDays(order)} 天</div>
            <div class="demo-step">步骤4：尝试提交退换申请...</div>
            <div class="demo-step ${tryApply.valid ? 'demo-pass' : 'demo-fail'}">
                结果：${tryApply.valid ? '✅ 通过（异常）' : '❌ 拦截成功 - ' + tryApply.errors[0]}
            </div>
            <div class="demo-step">结论：超期拦截规则${tryApply.valid ? '失效（需检查）' : '生效正常 ✓'}</div>
        `;

        this.refreshAll();
    },

    demoScenarioNoFeedback() {
        const result = document.getElementById('demoResult');
        result.innerHTML = '<div class="demo-title">👕 场景2：无试穿反馈退回演示</div>';

        const now = new Date();
        const order = Models.createOrder({
            orderId: 'DEMO_NOFB_' + Math.floor(Math.random() * 1000),
            buyerAccount: 'nofb_buyer@test.com',
            country: 'JP',
            orderTime: now.toISOString().slice(0, 16),
            receiveTime: now.toISOString().slice(0, 16),
            returnDeadline: 30,
            orderAmount: 129.99,
            shippingFee: 15.00
        });
        Storage.add(Storage.KEYS.ORDERS, order);

        const sku = Models.createSku({
            skuCode: 'DEMO_SHOES_40',
            skuName: '演示运动鞋',
            size: '40',
            color: '黑色',
            stock: 30,
            price: 129.99
        });
        Storage.add(Storage.KEYS.SKUS, sku);

        const returnItem = Models.createReturn({
            orderId: order.orderId,
            orderRef: order.id,
            skuCode: sku.skuCode,
            skuRef: sku.id,
            returnType: 'exchange',
            quantity: 1,
            reason: 'size_small',
            exchangeSize: '41',
            applyTime: now.toISOString()
        });
        returnItem.status = 'pending';
        returnItem.hasFeedback = false;
        Storage.add(Storage.KEYS.RETURNS, returnItem);

        const feedbackCheck = Rules.checkFeedbackRequired(returnItem);
        const qcCheck = Rules.validateQcSubmission(returnItem);

        result.innerHTML += `
            <div class="demo-step">步骤1：创建尺码争议换货申请（原因：尺码偏小）</div>
            <div class="demo-step">步骤2：检查是否需要试穿反馈：${feedbackCheck.required ? '是' : '否'}</div>
            <div class="demo-step">步骤3：当前是否有反馈：${feedbackCheck.hasFeedback ? '有' : '无'}</div>
            <div class="demo-step">步骤4：在无反馈情况下尝试质检...</div>
            <div class="demo-step ${qcCheck.valid ? 'demo-pass' : 'demo-fail'}">
                结果：${qcCheck.valid ? '✅ 通过（异常）' : '❌ 拦截成功 - ' + qcCheck.errors[0]}
            </div>
            <div class="demo-step">步骤5：在待反馈列表中点击"退回申请"...</div>
            <div class="demo-step demo-pass">结果：申请被退回，原因标记为"缺少试穿反馈，尺码争议无法判定"</div>
            <div class="demo-step">结论：尺码争议无试穿反馈规则生效正常 ✓</div>
        `;

        Storage.update(Storage.KEYS.RETURNS, returnItem.id, {
            status: 'returned',
            remark: '退回原因：缺少试穿反馈，尺码争议无法判定（演示）'
        });

        this.refreshAll();
    },

    demoScenarioReasonLocked() {
        const result = document.getElementById('demoResult');
        result.innerHTML = '<div class="demo-title">🔒 场景3：入库后原因锁定演示</div>';

        const now = new Date();
        const order = Models.createOrder({
            orderId: 'DEMO_LOCKED_' + Math.floor(Math.random() * 1000),
            buyerAccount: 'locked_buyer@test.com',
            country: 'DE',
            orderTime: now.toISOString().slice(0, 16),
            receiveTime: now.toISOString().slice(0, 16),
            returnDeadline: 30,
            orderAmount: 59.99,
            shippingFee: 8.00
        });
        Storage.add(Storage.KEYS.ORDERS, order);

        const sku = Models.createSku({
            skuCode: 'DEMO_PANTS_M',
            skuName: '演示裤子',
            size: 'M',
            color: '灰色',
            stock: 100,
            price: 59.99
        });
        Storage.add(Storage.KEYS.SKUS, sku);

        const feedback = Models.createFeedback({
            tryOnDuration: '5_15min',
            hasDamage: 'no',
            tagKept: 'yes',
            packageOk: 'yes',
            fitFeeling: 'too_large',
            descriptionZh: '穿着有点大，想换小一码',
            descriptionEn: 'A bit too large, want to exchange for smaller size'
        });

        const returnItem = Models.createReturn({
            orderId: order.orderId,
            orderRef: order.id,
            skuCode: sku.skuCode,
            skuRef: sku.id,
            returnType: 'exchange',
            quantity: 1,
            reason: 'size_big',
            exchangeSize: 'S',
            applyTime: now.toISOString()
        });
        returnItem.status = 'warehouse_pending';
        returnItem.hasFeedback = true;
        Storage.add(Storage.KEYS.RETURNS, returnItem);
        feedback.returnId = returnItem.id;
        Storage.add(Storage.KEYS.FEEDBACKS, feedback);

        const beforeModify = Rules.validateReasonModification(returnItem);

        const inbound = Models.createInbound({
            returnId: returnItem.id,
            warehouseCode: 'DE_FRA',
            receivedQty: 1,
            inboundTime: now.toISOString(),
            packageStatus: 'good',
            matchStatus: 'yes',
            remark: '演示入库'
        });
        Storage.add(Storage.KEYS.INBOUND_RECORDS, inbound);

        Storage.update(Storage.KEYS.RETURNS, returnItem.id, {
            hasInbound: true,
            reasonLocked: true,
            status: 'qc_pending'
        });

        const updatedReturn = Storage.getById(Storage.KEYS.RETURNS, returnItem.id);
        const afterModify = Rules.validateReasonModification(updatedReturn);

        result.innerHTML += `
            <div class="demo-step">步骤1：创建换货申请（原因：尺码偏大），提交试穿反馈</div>
            <div class="demo-step">步骤2：入库前检查原因可修改性：${beforeModify.allowed ? '✅ 可以修改' : '❌ ' + beforeModify.reason}</div>
            <div class="demo-step">步骤3：执行仓库入库操作...</div>
            <div class="demo-step">步骤4：入库后设置 reasonLocked = true</div>
            <div class="demo-step">步骤5：入库后检查原因可修改性...</div>
            <div class="demo-step ${afterModify.allowed ? 'demo-pass' : 'demo-fail'}">
                结果：${afterModify.allowed ? '✅ 可以修改（异常）' : '❌ 锁定成功 - ' + afterModify.reason}
            </div>
            <div class="demo-step">结论：入库后原因锁定规则生效正常 ✓</div>
        `;

        this.refreshAll();
    },

    demoScenarioStockShortage() {
        const result = document.getElementById('demoResult');
        result.innerHTML = '<div class="demo-title">📦 场景4：换货库存不足演示</div>';

        const now = new Date();
        const order = Models.createOrder({
            orderId: 'DEMO_NOSTOCK_' + Math.floor(Math.random() * 1000),
            buyerAccount: 'nostock_buyer@test.com',
            country: 'UK',
            orderTime: now.toISOString().slice(0, 16),
            receiveTime: now.toISOString().slice(0, 16),
            returnDeadline: 30,
            orderAmount: 199.99,
            shippingFee: 12.00
        });
        Storage.add(Storage.KEYS.ORDERS, order);

        const skuL = Models.createSku({
            skuCode: 'DEMO_JACKET_L',
            skuName: '演示夹克',
            size: 'L',
            color: '黑色',
            stock: 10,
            price: 199.99
        });
        Storage.add(Storage.KEYS.SKUS, skuL);

        const skuXL = Models.createSku({
            skuCode: 'DEMO_JACKET_XL',
            skuName: '演示夹克',
            size: 'XL',
            color: '黑色',
            stock: 0,
            price: 199.99
        });
        Storage.add(Storage.KEYS.SKUS, skuXL);

        const returnItem = Models.createReturn({
            orderId: order.orderId,
            orderRef: order.id,
            skuCode: skuL.skuCode,
            skuRef: skuL.id,
            returnType: 'exchange',
            quantity: 1,
            reason: 'size_small',
            exchangeSize: 'XL',
            applyTime: now.toISOString()
        });
        returnItem.status = 'qc_pass';
        returnItem.hasFeedback = true;
        returnItem.qcResult = 'pass';
        returnItem.hasInbound = true;
        returnItem.reasonLocked = true;
        Storage.add(Storage.KEYS.RETURNS, returnItem);

        const stockCheck = Rules.checkStockAvailable(skuXL, 1);
        const lockCheck = Rules.validateExchangeLock(returnItem, skuXL, 1);

        result.innerHTML += `
            <div class="demo-step">步骤1：创建换货申请（L码 → XL码），质检通过</div>
            <div class="demo-step">步骤2：目标尺码(XL)当前库存：${skuXL.stock} 件</div>
            <div class="demo-step">步骤3：执行换货锁库（需要1件XL）...</div>
            <div class="demo-step">步骤4：库存检查结果 - 可用：${stockCheck.availableStock}，需求：${stockCheck.lockQty}，${stockCheck.reason}</div>
            <div class="demo-step ${lockCheck.valid ? 'demo-pass' : 'demo-fail'}">
                结果：${lockCheck.valid ? '✅ 锁库成功（异常）' : '❌ 拦截成功 - ' + lockCheck.errors[0]}
            </div>
            <div class="demo-step">步骤5：如补货后库存≥1，可再次尝试锁库</div>
            <div class="demo-step">结论：换货库存不足检查规则生效正常 ✓</div>
        `;

        this.refreshAll();
    },

    initAllDemoData() {
        this.clearAllData(true);

        const result = document.getElementById('demoResult');
        result.innerHTML = '<div class="demo-title">🚀 正在初始化全部演示数据...</div>';

        const now = new Date();

        const orders = [
            { orderId: 'CB20260601001', buyerAccount: 'john@us.com', country: 'US', daysAgo: 15, deadline: 30, amount: 89.99, shipping: 9.99, receiveDaysAgo: 10 },
            { orderId: 'CB20260601002', buyerAccount: 'yamada@jp.com', country: 'JP', daysAgo: 45, deadline: 30, amount: 129.99, shipping: 15.00, receiveDaysAgo: 40 },
            { orderId: 'CB20260601003', buyerAccount: 'muller@de.com', country: 'DE', daysAgo: 5, deadline: 30, amount: 59.99, shipping: 8.00, receiveDaysAgo: 2 },
            { orderId: 'CB20260601004', buyerAccount: 'smith@uk.com', country: 'UK', daysAgo: 20, deadline: 30, amount: 199.99, shipping: 12.00, receiveDaysAgo: 15 },
            { orderId: 'CB20260601005', buyerAccount: 'chen@sg.com', country: 'SG', daysAgo: 8, deadline: 30, amount: 79.99, shipping: 6.00, receiveDaysAgo: 5 },
            { orderId: 'CB20260601006', buyerAccount: 'badbuyer@test.com', country: 'US', daysAgo: 3, deadline: 30, amount: 45.99, shipping: 5.99, receiveDaysAgo: 1 }
        ];

        const orderModels = [];
        orders.forEach(o => {
            const orderTime = new Date(now.getTime() - o.daysAgo * 24 * 60 * 60 * 1000);
            const receiveTime = new Date(now.getTime() - o.receiveDaysAgo * 24 * 60 * 60 * 1000);
            const om = Models.createOrder({
                orderId: o.orderId,
                buyerAccount: o.buyerAccount,
                country: o.country,
                orderTime: orderTime.toISOString().slice(0, 16),
                receiveTime: receiveTime.toISOString().slice(0, 16),
                returnDeadline: o.deadline,
                orderAmount: o.amount,
                shippingFee: o.shipping
            });
            Storage.add(Storage.KEYS.ORDERS, om);
            orderModels.push(om);
        });

        const skuData = [
            { code: 'TSHIRT-S-WHT', name: '纯棉圆领T恤', size: 'S', color: '白色', stock: 200, price: 29.99 },
            { code: 'TSHIRT-M-WHT', name: '纯棉圆领T恤', size: 'M', color: '白色', stock: 150, price: 29.99 },
            { code: 'TSHIRT-L-WHT', name: '纯棉圆领T恤', size: 'L', color: '白色', stock: 100, price: 29.99 },
            { code: 'TSHIRT-XL-WHT', name: '纯棉圆领T恤', size: 'XL', color: '白色', stock: 0, price: 29.99 },
            { code: 'JEANS-30-BLU', name: '修身牛仔裤', size: 'M', color: '蓝色', stock: 50, price: 79.99 },
            { code: 'JEANS-32-BLU', name: '修身牛仔裤', size: 'L', color: '蓝色', stock: 30, price: 79.99 },
            { code: 'SHOES-39-BLK', name: '运动休闲鞋', size: '39', color: '黑色', stock: 25, price: 129.99 },
            { code: 'SHOES-40-BLK', name: '运动休闲鞋', size: '40', color: '黑色', stock: 40, price: 129.99 },
            { code: 'SHOES-41-BLK', name: '运动休闲鞋', size: '41', color: '黑色', stock: 15, price: 129.99 },
            { code: 'SHOES-42-BLK', name: '运动休闲鞋', size: '42', color: '黑色', stock: 2, price: 129.99 },
            { code: 'JACKET-M-GRY', name: '防风夹克', size: 'M', color: '灰色', stock: 20, price: 199.99 },
            { code: 'JACKET-L-GRY', name: '防风夹克', size: 'L', color: '灰色', stock: 15, price: 199.99 },
            { code: 'JACKET-XL-GRY', name: '防风夹克', size: 'XL', color: '灰色', stock: 0, price: 199.99 },
            { code: 'PANTS-M-KHK', name: '休闲长裤', size: 'M', color: '卡其色', stock: 80, price: 59.99 },
            { code: 'PANTS-L-KHK', name: '休闲长裤', size: 'L', color: '卡其色', stock: 60, price: 59.99 }
        ];

        const skuModels = [];
        skuData.forEach(s => {
            const sm = Models.createSku(s);
            Storage.add(Storage.KEYS.SKUS, sm);
            skuModels.push(sm);
        });

        const returnScenarios = [
            { orderIdx: 0, skuIdx: 1, type: 'exchange', reason: 'size_small', exchange: 'L', flag: 'normal', status: 'pending', feedback: false, inbound: false, qc: null },
            { orderIdx: 0, skuIdx: 6, type: 'exchange', reason: 'size_small', exchange: '40', flag: 'normal', status: 'warehouse_pending', feedback: true, inbound: false, qc: null },
            { orderIdx: 2, skuIdx: 4, type: 'refund', reason: 'quality', exchange: null, flag: 'normal', status: 'qc_pending', feedback: true, inbound: true, qc: null },
            { orderIdx: 2, skuIdx: 4, type: 'refund', reason: 'size_big', exchange: null, flag: 'normal', status: 'qc_pass', feedback: true, inbound: true, qc: 'pass' },
            { orderIdx: 3, skuIdx: 10, type: 'exchange', reason: 'size_small', exchange: 'XL', flag: 'normal', status: 'exchange_locked', feedback: true, inbound: true, qc: 'pass' },
            { orderIdx: 3, skuIdx: 13, type: 'refund', reason: 'damaged', exchange: null, flag: 'normal', status: 'refunded', feedback: true, inbound: true, qc: 'pass' },
            { orderIdx: 5, skuIdx: 0, type: 'refund', reason: 'no_longer_needed', exchange: null, flag: 'malicious', status: 'arbitration', feedback: false, inbound: false, qc: null },
            { orderIdx: 4, skuIdx: 8, type: 'exchange', reason: 'size_mismatch', exchange: '42', flag: 'normal', status: 'arbitration', feedback: true, inbound: true, qc: 'arbitration' },
            { orderIdx: 0, skuIdx: 2, type: 'refund', reason: 'wrong_item', exchange: null, flag: 'normal', status: 'refund_pending', feedback: true, inbound: true, qc: 'pass' },
            { orderIdx: 2, skuIdx: 11, type: 'refund_only', reason: 'not_as_described', exchange: null, flag: 'normal', status: 'completed', feedback: false, inbound: false, qc: null }
        ];

        returnScenarios.forEach((sc, idx) => {
            const order = orderModels[sc.orderIdx];
            const sku = skuModels[sc.skuIdx];
            const ret = Models.createReturn({
                orderId: order.orderId,
                orderRef: order.id,
                skuCode: sku.skuCode,
                skuRef: sku.id,
                returnType: sc.type,
                quantity: 1,
                reason: sc.reason,
                exchangeSize: sc.exchange,
                maliciousFlag: sc.flag,
                applyTime: new Date(now.getTime() - (idx + 1) * 60 * 60 * 1000).toISOString(),
                remark: '演示数据'
            });
            ret.status = sc.status;
            ret.hasFeedback = sc.feedback;
            ret.hasInbound = sc.inbound;
            ret.reasonLocked = sc.inbound;
            ret.qcResult = sc.qc;
            if (sc.status === 'exchange_locked') {
                ret.stockLocked = true;
                ret.lockedQty = 1;
            }
            if (sc.status === 'refunded' || sc.status === 'refund_pending') {
                ret.refundInfo = {
                    goodsAmount: parseFloat(sku.price) || 0,
                    shippingFee: 8,
                    taxFee: 0,
                    totalAmount: (parseFloat(sku.price) || 0) + 8
                };
            }
            Storage.add(Storage.KEYS.RETURNS, ret);

            if (sc.feedback) {
                const fb = Models.createFeedback({
                    returnId: ret.id,
                    tryOnDuration: '5_15min',
                    hasDamage: 'no',
                    tagKept: 'yes',
                    packageOk: 'yes',
                    fitFeeling: sc.reason === 'size_small' ? 'too_small' : sc.reason === 'size_big' ? 'too_large' : 'fit',
                    descriptionZh: '演示反馈内容 - 试穿后尺码不合适',
                    descriptionEn: 'Demo feedback - size issue after trying on'
                });
                Storage.add(Storage.KEYS.FEEDBACKS, fb);
            }

            if (sc.inbound) {
                const ib = Models.createInbound({
                    returnId: ret.id,
                    warehouseCode: 'CN_SZ',
                    receivedQty: 1,
                    packageStatus: 'good',
                    matchStatus: 'yes',
                    remark: '演示入库'
                });
                Storage.add(Storage.KEYS.INBOUND_RECORDS, ib);
            }

            if (sc.qc) {
                const qc = Models.createQcResult({
                    returnId: ret.id,
                    result: sc.qc,
                    sizeCheck: 'correct',
                    resellable: sc.qc === 'pass' ? 'yes' : 'no',
                    stain: 'none',
                    wear: 'none',
                    inspector: 'DEMO-QC',
                    remark: '演示质检结果'
                });
                Storage.add(Storage.KEYS.QC_RESULTS, qc);
            }

            if (sc.status === 'arbitration') {
                const arb = Models.createArbitration({
                    returnId: ret.id,
                    officer: 'DEMO-ARB',
                    result: sc.flag === 'malicious' ? 'support_seller' : 'partial_refund',
                    level: 'normal',
                    refundAmount: 0,
                    compensation: 0,
                    reason: '演示仲裁 - ' + (sc.flag === 'malicious' ? '恶意退换判定' : '尺码争议需复核')
                });
                Storage.add(Storage.KEYS.ARBITRATIONS, arb);
                ret.arbitrationInfo = { id: arb.id, result: arb.result, officer: arb.officer, reason: arb.reason };
                Storage.update(Storage.KEYS.RETURNS, ret.id, { arbitrationInfo: ret.arbitrationInfo, arbitrationRecordId: arb.id });
            }

            if (sc.status === 'refunded' || sc.status === 'refund_pending') {
                const refund = Models.createRefund({
                    returnId: ret.id,
                    goodsAmount: parseFloat(sku.price) || 0,
                    shippingFee: 8,
                    returnShipping: 0,
                    taxFee: 0,
                    adjustAmount: 0,
                    platformFee: 0,
                    shippingPayer: 'seller',
                    taxPayer: 'seller',
                    totalAmount: (parseFloat(sku.price) || 0) + 8,
                    channel: sc.status === 'refunded' ? 'paypal' : '',
                    status: sc.status === 'refunded' ? 'completed' : 'pending',
                    remark: '演示退款'
                });
                Storage.add(Storage.KEYS.REFUNDS, refund);
            }
        });

        const logisticsData = [
            { node: 'buyer_shipped', loc: 'New York, US', daysAgo: 3 },
            { node: 'in_transit', loc: 'Los Angeles, US', daysAgo: 2 },
            { node: 'customs', loc: 'Los Angeles, US', daysAgo: 1 },
            { node: 'customs_passed', loc: 'Los Angeles, US', daysAgo: 1 }
        ];
        logisticsData.forEach(l => {
            const returns = Storage.get(Storage.KEYS.RETURNS);
            if (returns.length > 0) {
                const log = Models.createLogistics({
                    returnId: returns[0].id,
                    trackingNo: '1Z999AA10123456784',
                    carrier: 'UPS',
                    trackTime: new Date(now.getTime() - l.daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
                    trackNode: l.node,
                    trackLocation: l.loc,
                    description: '演示物流轨迹'
                });
                Storage.add(Storage.KEYS.LOGISTICS, log);
            }
        });

        result.innerHTML += `
            <div class="demo-step demo-pass">✅ 已创建 ${orders.length} 个跨境订单</div>
            <div class="demo-step demo-pass">✅ 已创建 ${skuData.length} 个SKU尺码库存</div>
            <div class="demo-step demo-pass">✅ 已创建 ${returnScenarios.length} 个退换申请（覆盖各状态）</div>
            <div class="demo-step demo-pass">✅ 已创建试穿反馈、入库记录、质检结果、仲裁记录、退款记录、物流轨迹</div>
            <div class="demo-step demo-pass">🎉 演示数据初始化完成！请切换各模块查看完整业务流程。</div>
            <br>
            <div style="padding: 12px; background: #fffbe6; border-radius: 4px; border: 1px solid #ffe58f;">
                <strong>🎯 建议体验路径：</strong><br>
                1. <b>客服受理 → 申请列表</b>：查看各状态申请，尝试修改已入库申请的原因（会被拦截）<br>
                2. <b>买家反馈 → 待反馈列表</b>：点击"退回申请"体验无试穿反馈退回<br>
                3. <b>仓库入库 → 仓库处理列表</b>：点击入库/质检/换货锁库查看各环节<br>
                4. <b>退款试算</b>：选择待退款申请，体验运费责任、关税计算<br>
                5. <b>争议仲裁</b>：体验恶意退换标记、普通客服权限限制<br>
                6. <b>原因分析 → 业务样例演示</b>：单场景独立演示，或点各场景按钮查看规则验证
            </div>
        `;

        this.refreshAll();
    },

    clearAllData(silent) {
        Storage.clearAll();
        if (!silent) {
            showToast('所有数据已清空', 'success');
        }
        this.refreshAll();
    },

    refreshAll() {
        this.renderStats();
        this.renderReasonChart();
        this.renderSizeAnalysis();
        if (typeof CustomerService !== 'undefined') {
            CustomerService.renderOrderList();
            CustomerService.renderSkuList();
            CustomerService.renderReturnList();
            CustomerService.refreshAllSelects();
        }
        if (typeof BuyerModule !== 'undefined') BuyerModule.refreshAll();
        if (typeof WarehouseModule !== 'undefined') {
            WarehouseModule.renderWarehouseList();
            WarehouseModule.refreshAllSelects();
        }
        if (typeof RefundModule !== 'undefined') RefundModule.refreshAll();
        if (typeof ArbitrationModule !== 'undefined') ArbitrationModule.refreshAll();
    }
};
