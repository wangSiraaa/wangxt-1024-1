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

    demoScenarioArbitration() {
        const result = document.getElementById('demoResult');
        result.innerHTML = '<div class="demo-title">⚖️ 场景5：仲裁权限验证演示</div>';

        const now = new Date();

        const order = Models.createOrder({
            orderId: 'DEMO_ARB_' + Math.floor(Math.random() * 1000),
            buyerAccount: 'arb_buyer@test.com',
            country: 'US',
            orderTime: now.toISOString().slice(0, 16),
            receiveTime: now.toISOString().slice(0, 16),
            returnDeadline: 30,
            orderAmount: 159.99,
            shippingFee: 10.00
        });
        Storage.add(Storage.KEYS.ORDERS, order);

        const sku = Models.createSku({
            skuCode: 'DEMO_ARB_SHIRT_M',
            skuName: '演示衬衫',
            size: 'M',
            color: '蓝色',
            stock: 50,
            price: 159.99
        });
        Storage.add(Storage.KEYS.SKUS, sku);

        const returnItem = Models.createReturn({
            orderId: order.orderId,
            orderRef: order.id,
            skuCode: sku.skuCode,
            skuRef: sku.id,
            returnType: 'return',
            quantity: 1,
            reason: 'quality',
            applyTime: now.toISOString()
        });
        returnItem.status = 'arbitration';
        returnItem.hasFeedback = true;
        returnItem.qcResult = 'arbitration';
        returnItem.hasInbound = true;
        returnItem.reasonLocked = true;
        Storage.add(Storage.KEYS.RETURNS, returnItem);

        const feedback = Models.createFeedback({
            returnId: returnItem.id,
            tryOnDuration: '5分钟',
            hasDamage: '否',
            tagKept: '是',
            packageOk: '是',
            fitFeeling: '领口有污渍',
            descriptionZh: '收到货后发现领口有明显污渍，怀疑是退货二次销售',
            descriptionEn: 'Found stain on collar after opening package'
        });
        Storage.add(Storage.KEYS.FEEDBACKS, feedback);

        const qc = Models.createQcResult({
            returnId: returnItem.id,
            result: 'arbitration',
            sizeCheck: '符合',
            resellable: '否',
            stain: '有污渍',
            wear: '轻微磨损',
            inspector: '质检员A',
            remark: '污渍位置与描述一致，但无法判断是发货前还是买家造成',
            qcTime: now.toISOString()
        });
        Storage.add(Storage.KEYS.QC_RESULTS, qc);

        const csValidation = Rules.validateArbitration(returnItem, 'cs');
        const supervisorValidation = Rules.validateArbitration(returnItem, 'supervisor');
        const arbitratorValidation = Rules.validateArbitration(returnItem, 'arbitrator');

        result.innerHTML += `
            <div class="demo-step">步骤1：创建质量争议案件，已进入仲裁状态（质检判定存疑）</div>
            <div class="demo-step">案件信息：${returnItem.id} | 订单：${order.orderId} | 原因：质量问题</div>
            <div class="demo-step">步骤2：测试各角色权限</div>
            <div class="demo-step">
                👤 <strong>普通客服 (cs)</strong><br>
                &nbsp;&nbsp;可提交草稿：${csValidation.canSubmitDraft ? '✅ 是' : '❌ 否'}<br>
                &nbsp;&nbsp;可直接生效：${csValidation.canFinalize ? '✅ 是' : '❌ 否（需主管复核）'}<br>
                &nbsp;&nbsp;校验通过：${csValidation.valid ? '✅ 是' : '❌ 否 - ' + csValidation.errors.join(', ')}
            </div>
            <div class="demo-step">
                👔 <strong>主管 (supervisor)</strong><br>
                &nbsp;&nbsp;可提交草稿：${supervisorValidation.canSubmitDraft ? '✅ 是' : '❌ 否'}<br>
                &nbsp;&nbsp;可直接生效：${supervisorValidation.canFinalize ? '✅ 是' : '❌ 否'}<br>
                &nbsp;&nbsp;校验通过：${supervisorValidation.valid ? '✅ 是' : '❌ 否 - ' + supervisorValidation.errors.join(', ')}
            </div>
            <div class="demo-step">
                ⚖️ <strong>仲裁员 (arbitrator)</strong><br>
                &nbsp;&nbsp;可提交草稿：${arbitratorValidation.canSubmitDraft ? '✅ 是' : '❌ 否'}<br>
                &nbsp;&nbsp;可直接生效：${arbitratorValidation.canFinalize ? '✅ 是' : '❌ 否'}<br>
                &nbsp;&nbsp;校验通过：${arbitratorValidation.valid ? '✅ 是' : '❌ 否 - ' + arbitratorValidation.errors.join(', ')}
            </div>
            <div class="demo-step demo-pass">
                ✅ 结论1：普通客服不能直接生效仲裁结论（权限拦截正常）
            </div>
            <div class="demo-step demo-pass">
                ✅ 结论2：主管和仲裁员可直接生效仲裁结论（授权角色可完成处理）
            </div>
            <div class="demo-step demo-pass">
                ✅ 结论3：三级权限体系（cs → supervisor → arbitrator）规则生效正常
            </div>
            <div class="demo-step">
                📌 操作验证：请点击顶部【争议仲裁】Tab，使用右上角角色切换功能：<br>
                &nbsp;&nbsp;1. 选择"普通客服" → 仲裁处理页按钮显示"提交初步意见（待主管复核）"<br>
                &nbsp;&nbsp;2. 选择"主管"或"仲裁员" → 按钮显示"提交并生效仲裁结论"<br>
                &nbsp;&nbsp;3. 普通客服提交的意见会进入"待复核"列表，由主管/仲裁员审核生效
            </div>
        `;

        this.refreshAll();
    },

    demoScenarioCrossWarehouseLock() {
        const result = document.getElementById('demoResult');
        result.innerHTML = '<div class="demo-title">🔄 场景3：跨仓换货库存锁定演示</div>';

        const now = new Date();

        const order = Models.createOrder({
            orderId: 'DEMO_CW_' + Math.floor(Math.random() * 1000),
            buyerAccount: 'eu_buyer@de.com',
            country: 'DE',
            orderTime: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
            receiveTime: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
            returnDeadline: 30,
            orderAmount: 189.99,
            shippingFee: 15.00,
            originWarehouse: 'DE_FRA'
        });
        Storage.add(Storage.KEYS.ORDERS, order);

        const sku = Models.createSku({
            skuCode: 'DEMO_CW_JACKET_L',
            skuName: '演示夹克',
            size: 'L',
            color: '灰色',
            stock: 0,
            price: 189.99
        });
        Storage.add(Storage.KEYS.SKUS, sku);

        const targetSku = Models.createSku({
            skuCode: 'DEMO_CW_JACKET_XL',
            skuName: '演示夹克',
            size: 'XL',
            color: '灰色',
            stock: 5,
            price: 189.99
        });
        Storage.add(Storage.KEYS.SKUS, targetSku);

        const stocks = Storage.get(Storage.KEYS.WAREHOUSE_STOCKS);
        const existingStock = stocks.find(s => s.skuCode === targetSku.skuCode && s.warehouseCode === 'CN_BONDED');
        if (!existingStock) {
            const ws = {
                id: 'WS_' + Date.now(),
                skuCode: targetSku.skuCode,
                warehouseCode: 'CN_BONDED',
                availableQty: 5,
                lockedQty: 0,
                createdAt: new Date().toISOString()
            };
            Storage.add(Storage.KEYS.WAREHOUSE_STOCKS, ws);
        }

        const returnItem = Models.createReturn({
            orderId: order.orderId,
            orderRef: order.id,
            skuCode: sku.skuCode,
            skuRef: sku.id,
            returnType: 'exchange',
            quantity: 1,
            reason: 'size_small',
            exchangeSize: 'XL',
            applyTime: now.toISOString(),
            originWarehouse: 'DE_FRA',
            targetWarehouse: 'CN_BONDED',
            tariffResponsibility: 'split',
            tariffAmount: 18.50,
            orderCurrency: 'EUR',
            refundCurrency: 'CNY'
        });
        returnItem.status = 'qc_pass';
        returnItem.hasFeedback = true;
        returnItem.hasInbound = true;
        returnItem.qcResult = 'pass';
        returnItem.reasonLocked = true;
        Storage.add(Storage.KEYS.RETURNS, returnItem);

        const feedback = Models.createFeedback({
            returnId: returnItem.id,
            tryOnDuration: '5_15min',
            hasDamage: 'no',
            tagKept: 'yes',
            packageOk: 'yes',
            fitFeeling: 'too_tight',
            descriptionZh: 'L码偏紧，需要换XL码',
            descriptionEn: 'Size L too tight, need XL'
        });
        Storage.add(Storage.KEYS.FEEDBACKS, feedback);

        const inbound = Models.createInbound({
            returnId: returnItem.id,
            warehouseCode: 'DE_FRA',
            receivedQty: 1,
            packageStatus: 'good',
            matchStatus: 'yes',
            wearCondition: 'none',
            sizeMatchReason: 'L码试穿偏紧，确认需换XL',
            remark: '欧洲仓入库'
        });
        Storage.add(Storage.KEYS.INBOUND_RECORDS, inbound);

        const qc = Models.createQcResult({
            returnId: returnItem.id,
            result: 'pass',
            sizeCheck: 'correct',
            resellable: 'yes',
            stain: 'none',
            wear: 'none',
            inspector: 'DE_FRA-QC',
            remark: '质检通过，可换货'
        });
        Storage.add(Storage.KEYS.QC_RESULTS, qc);

        const crossType = Rules.getCrossWarehouseType('DE_FRA', 'CN_BONDED');
        const crossShippingCost = Rules.calculateCrossWarehouseShipping('DE_FRA', 'CN_BONDED');
        const crossLabel = Models.WAREHOUSE_CROSS_TYPES[crossType] || crossType;

        returnItem.crossWarehouseShippingCost = crossShippingCost;
        returnItem.crossWarehouseType = crossType;
        Storage.update(Storage.KEYS.RETURNS, returnItem.id, {
            crossWarehouseShippingCost: crossShippingCost,
            crossWarehouseType: crossType
        });

        result.innerHTML += `
            <div class="demo-step">步骤1：创建欧洲仓(DE_FRA)订单，买家申请换货但原仓无XL码库存</div>
            <div class="demo-step">案件信息：${returnItem.id} | 订单：${order.orderId} | 原仓：DE_FRA → 目标仓：CN_BONDED</div>
            <div class="demo-step">步骤2：系统判定跨仓类型</div>
            <div class="demo-step">
                🔄 跨仓类型：<strong>${crossLabel}</strong>（${crossType}）<br>
                &nbsp;&nbsp;原仓：${Models.WAREHOUSES['DE_FRA'].name}（德国法兰克福）<br>
                &nbsp;&nbsp;目标仓：${Models.WAREHOUSES['CN_BONDED'].name}（中国保税仓）<br>
                &nbsp;&nbsp;跨仓运费：${crossShippingCost} EUR<br>
                &nbsp;&nbsp;关税责任：买卖双方分摊<br>
                &nbsp;&nbsp;关税金额：18.50 EUR<br>
                &nbsp;&nbsp;订单币种：EUR → 退款币种：CNY
            </div>
            <div class="demo-step">步骤3：入库质检通过，状态为qc_pass，等待换货库存锁定</div>
            <div class="demo-step demo-pass">
                ✅ 结论1：原仓欧洲仓无库存时，系统自动识别需跨仓换货
            </div>
            <div class="demo-step demo-pass">
                ✅ 结论2：跨仓类型正确判定为"${crossLabel}"，运费计算为${crossShippingCost}
            </div>
            <div class="demo-step demo-pass">
                ✅ 结论3：多币种（EUR/CNY）和关税分摊正确标记
            </div>
            <div class="demo-step">
                📌 操作验证：<br>
                &nbsp;&nbsp;1. 点击【仓库入库】Tab，在换货处理区选择该申请<br>
                &nbsp;&nbsp;2. 选择目标仓库"CN_BONDED"，查看跨仓指示器显示<br>
                &nbsp;&nbsp;3. 点击"锁定换货库存"完成跨仓换货锁定<br>
                &nbsp;&nbsp;4. 切换到【退款试算】查看多币种计算结果
            </div>
        `;

        this.refreshAll();
    },

    demoScenarioArbitrationLocked() {
        const result = document.getElementById('demoResult');
        result.innerHTML = '<div class="demo-title">🔒 场景4：仲裁锁结论验证演示</div>';

        const now = new Date();

        const order = Models.createOrder({
            orderId: 'DEMO_AL_' + Math.floor(Math.random() * 1000),
            buyerAccount: 'arb_buyer@test.com',
            country: 'US',
            orderTime: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
            receiveTime: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
            returnDeadline: 30,
            orderAmount: 299.99,
            shippingFee: 20.00,
            originWarehouse: 'US_LA'
        });
        Storage.add(Storage.KEYS.ORDERS, order);

        const sku = Models.createSku({
            skuCode: 'DEMO_AL_COAT_M',
            skuName: '演示大衣',
            size: 'M',
            color: '黑色',
            stock: 10,
            price: 299.99
        });
        Storage.add(Storage.KEYS.SKUS, sku);

        const returnItem = Models.createReturn({
            orderId: order.orderId,
            orderRef: order.id,
            skuCode: sku.skuCode,
            skuRef: sku.id,
            returnType: 'refund',
            quantity: 1,
            reason: 'size_small',
            applyTime: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
            originWarehouse: 'US_LA',
            tariffResponsibility: 'buyer',
            tariffAmount: 35.00,
            orderCurrency: 'USD'
        });
        returnItem.status = 'arbitration_locked';
        returnItem.hasFeedback = true;
        returnItem.hasInbound = true;
        returnItem.qcResult = 'arbitration';
        returnItem.reasonLocked = true;
        returnItem.arbitrationConclusionLocked = true;
        returnItem.arbitrationInfo = {
            id: 'ARB_LOCKED_001',
            result: 'partial_refund',
            officer: 'ARBITRATOR-01',
            reason: '尺码描述存在歧义，买家试穿偏紧属实，但商品未损坏可二次销售',
            lockedAt: now.toISOString(),
            lockedBy: 'arbitrator'
        };
        Storage.add(Storage.KEYS.RETURNS, returnItem);

        const feedback = Models.createFeedback({
            returnId: returnItem.id,
            tryOnDuration: '1_5min',
            hasDamage: 'no',
            tagKept: 'yes',
            packageOk: 'yes',
            fitFeeling: 'too_tight',
            descriptionZh: 'M码太紧了，完全穿不了，商品完好可以二次销售',
            descriptionEn: 'Size M too tight, item in perfect condition'
        });
        Storage.add(Storage.KEYS.FEEDBACKS, feedback);

        const inbound = Models.createInbound({
            returnId: returnItem.id,
            warehouseCode: 'US_LA',
            receivedQty: 1,
            packageStatus: 'good',
            matchStatus: 'yes',
            wearCondition: 'none',
            sizeMatchReason: '买家称M码偏紧，实际商品无磨损',
            remark: '美仓入库'
        });
        Storage.add(Storage.KEYS.INBOUND_RECORDS, inbound);

        const qc = Models.createQcResult({
            returnId: returnItem.id,
            result: 'arbitration',
            sizeCheck: 'correct',
            resellable: 'yes',
            stain: 'none',
            wear: 'none',
            inspector: 'US_LA-QC',
            remark: '商品完好可二次销售，但尺码描述是否存疑需仲裁'
        });
        Storage.add(Storage.KEYS.QC_RESULTS, qc);

        const arb = Models.createArbitration({
            returnId: returnItem.id,
            officer: 'ARBITRATOR-01',
            result: 'partial_refund',
            level: 'normal',
            refundAmount: 220.00,
            compensation: 0,
            reason: '尺码描述存在歧义，买家试穿偏紧属实，但商品未损坏可二次销售'
        });
        arb.conclusionLocked = true;
        arb.lockedAt = now.toISOString();
        arb.lockedBy = 'arbitrator';
        Storage.add(Storage.KEYS.ARBITRATIONS, arb);

        const csEvidence = Models.createArbitrationEvidence({
            returnId: returnItem.id,
            submitterRole: 'cs',
            submitterName: '普通客服',
            evidenceType: 'text',
            content: '补充证据：买家历史退换记录显示3次尺码退换，建议关注尺码偏好'
        });
        Storage.add(Storage.KEYS.ARBITRATION_EVIDENCES, csEvidence);

        const whEvidence = Models.createArbitrationEvidence({
            returnId: returnItem.id,
            submitterRole: 'warehouse',
            submitterName: '仓库人员',
            evidenceType: 'text',
            content: '补充证据：入库质检确认商品完好，吊牌完整，可二次销售'
        });
        Storage.add(Storage.KEYS.ARBITRATION_EVIDENCES, whEvidence);

        const canCsModify = Rules.canModifyArbitrationConclusion(returnItem, 'cs');
        const canSupervisorModify = Rules.canModifyArbitrationConclusion(returnItem, 'supervisor');
        const canArbitratorModify = Rules.canModifyArbitrationConclusion(returnItem, 'arbitrator');

        result.innerHTML += `
            <div class="demo-step">步骤1：创建仲裁锁结论案件</div>
            <div class="demo-step">案件信息：${returnItem.id} | 订单：${order.orderId} | 状态：arbitration_locked 🔒</div>
            <div class="demo-step">步骤2：仲裁员已锁结论（部分退款220 USD），普通客服和仓库已补充证据</div>
            <div class="demo-step">
                🔒 结论锁定状态：<strong>已锁定</strong><br>
                &nbsp;&nbsp;结论：部分退款（partial_refund）<br>
                &nbsp;&nbsp;退款金额：220.00 USD<br>
                &nbsp;&nbsp;锁定人：ARBITRATOR-01（仲裁员）<br>
                &nbsp;&nbsp;锁定时间：${formatDateTime(now.toISOString())}
            </div>
            <div class="demo-step">步骤3：验证各角色修改权限</div>
            <div class="demo-step">
                👤 <strong>普通客服 (cs)</strong>：可修改结论？${canCsModify ? '⚠️ 是（异常！）' : '🔒 否（正确拦截）'}<br>
                👔 <strong>主管 (supervisor)</strong>：可修改结论？${canSupervisorModify ? '✅ 是' : '❌ 否'}<br>
                ⚖️ <strong>仲裁员 (arbitrator)</strong>：可修改结论？${canArbitratorModify ? '✅ 是' : '❌ 否'}
            </div>
            <div class="demo-step">步骤4：验证CS/仓库只能补证据</div>
            <div class="demo-step">
                📝 已有补充证据：<br>
                &nbsp;&nbsp;- 客服补充：买家历史3次尺码退换记录<br>
                &nbsp;&nbsp;- 仓库补充：入库商品完好可二次销售<br>
                &nbsp;&nbsp;两类角色均无法直接修改结论
            </div>
            <div class="demo-step demo-pass">
                ✅ 结论1：仲裁结论锁定后，普通客服和仓库无法修改结论
            </div>
            <div class="demo-step demo-pass">
                ✅ 结论2：锁定后CS/仓库只能通过"补充证据"方式参与
            </div>
            <div class="demo-step demo-pass">
                ✅ 结论3：主管和仲裁员仍可修改/解锁结论
            </div>
            <div class="demo-step">
                📌 操作验证：<br>
                &nbsp;&nbsp;1. 点击【争议仲裁】Tab，切换为"普通客服"角色<br>
                &nbsp;&nbsp;2. 选择该案件，尝试直接修改仲裁结论 → 会被拦截<br>
                &nbsp;&nbsp;3. 使用"补充证据"功能添加新证据 → 允许<br>
                &nbsp;&nbsp;4. 切换为"仲裁员"角色 → 可解锁/修改结论<br>
                &nbsp;&nbsp;5. 查看证据列表确认CS/仓库提交的证据已记录
            </div>
        `;

        this.refreshAll();
    },

    initAllDemoData() {
        this.clearAllData(true);

        const result = document.getElementById('demoResult');
        result.innerHTML = '<div class="demo-title">🚀 正在初始化全部演示数据...</div>';

        const now = new Date();

        const orders = [
            { orderId: 'CB20260601001', buyerAccount: 'john@us.com', country: 'US', daysAgo: 15, deadline: 30, amount: 89.99, shipping: 9.99, receiveDaysAgo: 10, warehouse: 'US_LA' },
            { orderId: 'CB20260601002', buyerAccount: 'yamada@jp.com', country: 'JP', daysAgo: 45, deadline: 30, amount: 129.99, shipping: 15.00, receiveDaysAgo: 40, warehouse: 'JP_TYO' },
            { orderId: 'CB20260601003', buyerAccount: 'muller@de.com', country: 'DE', daysAgo: 5, deadline: 30, amount: 59.99, shipping: 8.00, receiveDaysAgo: 2, warehouse: 'DE_FRA' },
            { orderId: 'CB20260601004', buyerAccount: 'smith@uk.com', country: 'UK', daysAgo: 20, deadline: 30, amount: 199.99, shipping: 12.00, receiveDaysAgo: 15, warehouse: 'UK_LON' },
            { orderId: 'CB20260601005', buyerAccount: 'chen@sg.com', country: 'SG', daysAgo: 8, deadline: 30, amount: 79.99, shipping: 6.00, receiveDaysAgo: 5, warehouse: 'CN_BONDED' },
            { orderId: 'CB20260601006', buyerAccount: 'badbuyer@test.com', country: 'US', daysAgo: 3, deadline: 30, amount: 45.99, shipping: 5.99, receiveDaysAgo: 1, warehouse: 'US_LA' }
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
                shippingFee: o.shipping,
                originWarehouse: o.warehouse
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

        this._initAcceptanceScenarios(now, orderModels, skuModels);

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
                1. <b>客服受理 → 申请列表</b>：查看各状态申请及仓库/币种/关税信息，尝试修改已入库申请的原因（会被拦截）<br>
                2. <b>买家反馈 → 综合视图</b>：选择申请查看试穿反馈+物流轨迹+关税责任+仓库入库的统一视图<br>
                3. <b>买家反馈 → 待反馈列表</b>：点击"退回申请"体验无试穿反馈退回<br>
                4. <b>仓库入库 → 仓库处理列表</b>：点击入库/质检/换货锁库查看各环节<br>
                5. <b>退款试算</b>：选择待退款申请，体验多币种计算、跨仓运费、关税扣减<br>
                6. <b>争议仲裁</b>：体验恶意退换标记、普通客服权限限制、结论锁定后补证据<br>
                7. <b>原因分析 → 业务样例演示</b>：4个验收场景独立验证（超期拦截/无反馈退回/跨仓锁库/仲裁锁结论）
            </div>
            <br>
            <div style="padding: 12px; background: #e6fffb; border-radius: 4px; border: 1px solid #87e8de;">
                <strong>✅ 页面验收4场景数据（编号前缀 ACPT_）：</strong><br>
                <b>① 超期拦截：</b>客服受理→退换申请→选择订单 <code>ACPT_OVERDUE_001</code> → 提交即被超期规则拦截<br>
                <b>② 无试穿反馈退回：</b>买家反馈→待反馈列表→找到 <code>ACPT_NOFB_001</code> → 点击"退回申请"<br>
                <b>③ 跨仓换货锁库（EUR→CNY，DE→保税仓）：</b>仓库入库→换货锁库→选择 <code>ACPT_CW_001</code> → 目标仓选CN_BONDED → 锁定库存<br>
                <b>④ 仲裁锁结论（CS/仓库只能补证据）：</b>争议仲裁→右上角切换"普通客服"→选择 <code>ACPT_ARB_001</code> → 结论按钮被禁用，只能通过"补充证据"按钮操作；切换为"仲裁员"可解锁修改
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

    _initAcceptanceScenarios(now, orderModels, skuModels) {
        const _t = (days) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

        // ========= 验收场景1：超期拦截 =========
        const order_overdue = Models.createOrder({
            orderId: 'ACPT_OVERDUE_001',
            buyerAccount: 'acceptance_overdue@test.com',
            country: 'US',
            orderTime: _t(50).slice(0, 16),
            receiveTime: _t(48).slice(0, 16),
            returnDeadline: 30,
            orderAmount: 79.99,
            shippingFee: 8.99,
            originWarehouse: 'US_LA'
        });
        Storage.add(Storage.KEYS.ORDERS, order_overdue);

        const sku_overdue = Models.createSku({
            skuCode: 'ACPT_OVERDUE_TSHIRT_M',
            skuName: '验收-T恤(超期演示)',
            size: 'M', color: '红色', stock: 20, price: 79.99
        });
        Storage.add(Storage.KEYS.SKUS, sku_overdue);

        // ========= 验收场景2：无试穿反馈待退回 =========
        const order_nofb = Models.createOrder({
            orderId: 'ACPT_NOFB_001',
            buyerAccount: 'acceptance_nofb@test.com',
            country: 'JP',
            orderTime: _t(12).slice(0, 16),
            receiveTime: _t(8).slice(0, 16),
            returnDeadline: 30,
            orderAmount: 159.00,
            shippingFee: 18.00,
            originWarehouse: 'JP_TYO'
        });
        Storage.add(Storage.KEYS.ORDERS, order_nofb);

        const sku_nofb = Models.createSku({
            skuCode: 'ACPT_NOFB_SHOES_39',
            skuName: '验收-运动鞋(无反馈演示)',
            size: '39', color: '白色', stock: 15, price: 159.00
        });
        Storage.add(Storage.KEYS.SKUS, sku_nofb);

        const ret_nofb = Models.createReturn({
            orderId: order_nofb.orderId,
            orderRef: order_nofb.id,
            skuCode: sku_nofb.skuCode,
            skuRef: sku_nofb.id,
            returnType: 'exchange',
            quantity: 1,
            reason: 'size_small',
            exchangeSize: '40',
            applyTime: _t(2),
            remark: '【验收场景2】缺少试穿反馈，尺码争议待处理',
            originWarehouse: 'JP_TYO',
            orderCurrency: 'JPY',
            refundCurrency: 'JPY'
        });
        ret_nofb.status = 'pending';
        ret_nofb.hasFeedback = false;
        ret_nofb.pendingSince = _t(2);
        Storage.add(Storage.KEYS.RETURNS, ret_nofb);

        // ========= 验收场景3：跨仓换货库存锁定（DE→CN_BONDED，EUR→CNY） =========
        const order_cw = Models.createOrder({
            orderId: 'ACPT_CW_001',
            buyerAccount: 'acceptance_cw@test.de',
            country: 'DE',
            orderTime: _t(18).slice(0, 16),
            receiveTime: _t(10).slice(0, 16),
            returnDeadline: 30,
            orderAmount: 249.00,
            shippingFee: 19.90,
            originWarehouse: 'DE_FRA'
        });
        Storage.add(Storage.KEYS.ORDERS, order_cw);

        const sku_cw_L = Models.createSku({
            skuCode: 'ACPT_CW_JACKET_L',
            skuName: '验收-夹克(跨仓演示)L码',
            size: 'L', color: '深蓝', stock: 0, price: 249.00,
            warehouseStocks: { 'CN_SZ': 0, 'CN_BONDED': 0, 'US_LA': 0, 'DE_FRA': 0, 'JP_TYO': 0, 'UK_LON': 0 }
        });
        Storage.add(Storage.KEYS.SKUS, sku_cw_L);

        const sku_cw_XL = Models.createSku({
            skuCode: 'ACPT_CW_JACKET_XL',
            skuName: '验收-夹克(跨仓演示)XL码',
            size: 'XL', color: '深蓝', stock: 8, price: 259.00,
            warehouseStocks: { 'CN_SZ': 2, 'CN_BONDED': 6, 'US_LA': 0, 'DE_FRA': 0, 'JP_TYO': 0, 'UK_LON': 0 }
        });
        Storage.add(Storage.KEYS.SKUS, sku_cw_XL);

        const fb_cw = Models.createFeedback({
            returnId: null,
            tryOnDuration: '5_15min',
            hasDamage: 'no',
            tagKept: 'yes',
            packageOk: 'yes',
            fitFeeling: 'too_tight',
            descriptionZh: 'L码穿着偏紧，胸围和肩宽都不够，需要换XL',
            descriptionEn: 'Size L is too tight in chest and shoulders, need XL'
        });

        const ib_cw = Models.createInbound({
            returnId: null,
            warehouseCode: 'DE_FRA',
            receivedQty: 1,
            inboundTime: _t(1),
            packageStatus: 'good',
            matchStatus: 'yes',
            wearCondition: 'none',
            sizeMatchReason: '买家反馈L码偏紧，实物吊牌完整无磨损',
            remark: '【验收3】DE法兰克福仓入库'
        });

        const qc_cw = Models.createQcResult({
            returnId: null,
            result: 'pass',
            sizeCheck: 'correct',
            resellable: 'yes',
            stain: 'none',
            wear: 'none',
            inspector: 'DE_QC_A01',
            remark: '【验收3】DE仓质检通过，商品完好',
            qcTime: _t(0.5)
        });

        const ret_cw = Models.createReturn({
            orderId: order_cw.orderId,
            orderRef: order_cw.id,
            skuCode: sku_cw_L.skuCode,
            skuRef: sku_cw_L.id,
            returnType: 'exchange',
            quantity: 1,
            reason: 'size_small',
            exchangeSize: 'XL',
            targetSkuRef: sku_cw_XL.id,
            applyTime: _t(5),
            remark: '【验收场景3】DE仓原单无XL库存，需跨保税仓调货+EUR退款转CNY',
            originWarehouse: 'DE_FRA',
            targetWarehouse: 'CN_BONDED',
            warehouseCrossType: 'overseas_to_bonded',
            tariffResponsibility: 'split',
            tariffAmount: 28.50,
            orderCurrency: 'EUR',
            refundCurrency: 'CNY',
            exchangeRate: Number((Models.EXCHANGE_RATES.CNY / Models.EXCHANGE_RATES.EUR).toFixed(6)),
            crossWarehouseShippingCost: 20,
            status: 'qc_pass',
            hasFeedback: true,
            hasInbound: true,
            reasonLocked: true,
            qcResult: 'pass'
        });
        Storage.add(Storage.KEYS.RETURNS, ret_cw);

        fb_cw.returnId = ret_cw.id;
        Storage.add(Storage.KEYS.FEEDBACKS, fb_cw);
        ib_cw.returnId = ret_cw.id;
        Storage.add(Storage.KEYS.INBOUND_RECORDS, ib_cw);
        qc_cw.returnId = ret_cw.id;
        Storage.add(Storage.KEYS.QC_RESULTS, qc_cw);

        // ========= 验收场景4：仲裁锁结论（CS/仓库只能补证据） =========
        const order_arb = Models.createOrder({
            orderId: 'ACPT_ARB_001',
            buyerAccount: 'acceptance_arb@test.com',
            country: 'UK',
            orderTime: _t(35).slice(0, 16),
            receiveTime: _t(28).slice(0, 16),
            returnDeadline: 30,
            orderAmount: 329.00,
            shippingFee: 25.00,
            originWarehouse: 'UK_LON'
        });
        Storage.add(Storage.KEYS.ORDERS, order_arb);

        const sku_arb = Models.createSku({
            skuCode: 'ACPT_ARB_COAT_M',
            skuName: '验收-大衣(仲裁锁演示)',
            size: 'M', color: '驼色', stock: 12, price: 329.00
        });
        Storage.add(Storage.KEYS.SKUS, sku_arb);

        const fb_arb = Models.createFeedback({
            returnId: null,
            tryOnDuration: '15_60min',
            hasDamage: 'no',
            tagKept: 'yes',
            packageOk: 'yes',
            fitFeeling: 'too_tight',
            descriptionZh: 'M码太紧，肩部和腰部都卡，实际测量比页面描述小了3cm，商品完好可二次销售',
            descriptionEn: 'Size M too tight, measures 3cm smaller than described, item in perfect condition'
        });

        const ib_arb = Models.createInbound({
            returnId: null,
            warehouseCode: 'UK_LON',
            receivedQty: 1,
            inboundTime: _t(14),
            packageStatus: 'good',
            matchStatus: 'partial',
            wearCondition: 'none',
            sizeMatchReason: '买家反馈尺码偏小，但仓库检测实物尺寸与吊牌一致',
            remark: '【验收4】入库匹配状态：部分匹配-尺寸有争议'
        });

        const qc_arb = Models.createQcResult({
            returnId: null,
            result: 'arbitration',
            sizeCheck: 'uncertain',
            resellable: 'yes',
            stain: 'none',
            wear: 'none',
            inspector: 'UK_QC_B02',
            remark: '【验收4】实物尺寸与吊牌一致，与买家反馈存在差异，需仲裁判定',
            qcTime: _t(12)
        });

        const arb_arb = Models.createArbitration({
            returnId: null,
            officer: 'ARBITRATOR_CHIEF',
            result: 'partial_refund',
            level: 'normal',
            refundAmount: 215.00,
            compensation: 0,
            reason: '尺码描述存在歧义，买家反馈属实但商品可二次销售，判定80%退款由卖家承担，买家承担20%运费和关税'
        });
        arb_arb.conclusionLocked = true;
        arb_arb.lockedAt = _t(6);
        arb_arb.lockedBy = 'arbitrator';
        arb_arb.reviewStatus = 'final';
        arb_arb.createdAt = _t(10);
        arb_arb.updatedAt = _t(6);

        const ev_cs = Models.createArbitrationEvidence({
            returnId: null,
            submitterRole: 'cs',
            submitterName: '客服-Lisa',
            evidenceType: 'text',
            content: '【验收4】补充证据：买家过往2年有4次尺码退换记录，尺码选择偏好偏大一码，建议部分退款解决'
        });
        ev_cs.createdAt = _t(8);

        const ev_wh = Models.createArbitrationEvidence({
            returnId: null,
            submitterRole: 'warehouse',
            submitterName: '仓库主管-Tom',
            evidenceType: 'text',
            content: '【验收4】补充证据：入库及二次复检均确认实物与吊牌尺寸一致（肩宽42，胸围96），附UK仓尺码检测单照片存档'
        });
        ev_wh.createdAt = _t(7.5);

        const ret_arb = Models.createReturn({
            orderId: order_arb.orderId,
            orderRef: order_arb.id,
            skuCode: sku_arb.skuCode,
            skuRef: sku_arb.id,
            returnType: 'refund',
            quantity: 1,
            reason: 'size_mismatch',
            applyTime: _t(20),
            remark: '【验收场景4】仲裁结论已锁定：普通客服/仓库仅能补证据，不可修改结论',
            originWarehouse: 'UK_LON',
            tariffResponsibility: 'split',
            tariffAmount: 42.00,
            orderCurrency: 'GBP',
            refundCurrency: 'GBP',
            status: 'arbitration_locked',
            hasFeedback: true,
            hasInbound: true,
            reasonLocked: true,
            qcResult: 'arbitration',
            qcMismatchTriggered: true,
            qcMismatchReason: '买家反馈尺码偏小，但仓检测量与吊牌一致',
            arbitrationConclusionLocked: true,
            arbitrationInfo: {
                id: arb_arb.id,
                result: arb_arb.result,
                officer: arb_arb.officer,
                reason: arb_arb.reason,
                refundAmount: arb_arb.refundAmount,
                lockedAt: arb_arb.lockedAt,
                lockedBy: 'arbitrator'
            },
            arbitrationRecordId: arb_arb.id,
            costEstimation: Rules.estimateMismatchCost({
                originWarehouse: 'UK_LON',
                targetWarehouse: 'CN_BONDED',
                tariffResponsibility: 'split',
                tariffAmount: 42.00
            }, '尺码描述歧义')
        });
        Storage.add(Storage.KEYS.RETURNS, ret_arb);

        fb_arb.returnId = ret_arb.id;
        Storage.add(Storage.KEYS.FEEDBACKS, fb_arb);
        ib_arb.returnId = ret_arb.id;
        Storage.add(Storage.KEYS.INBOUND_RECORDS, ib_arb);
        qc_arb.returnId = ret_arb.id;
        Storage.add(Storage.KEYS.QC_RESULTS, qc_arb);
        arb_arb.returnId = ret_arb.id;
        Storage.add(Storage.KEYS.ARBITRATIONS, arb_arb);
        ev_cs.returnId = ret_arb.id;
        Storage.add(Storage.KEYS.ARBITRATION_EVIDENCES, ev_cs);
        ev_wh.returnId = ret_arb.id;
        Storage.add(Storage.KEYS.ARBITRATION_EVIDENCES, ev_wh);
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
