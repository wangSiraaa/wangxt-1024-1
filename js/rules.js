const Rules = {

    getOrderDeadline(order) {
        if (!order) return null;
        const baseTime = order.receiveTime || order.orderTime;
        if (!baseTime) return null;
        const deadline = new Date(baseTime);
        deadline.setDate(deadline.getDate() + parseInt(order.returnDeadline || 30));
        return deadline;
    },

    getLocalDeadline(order, applyTime) {
        const deadline = this.getOrderDeadline(order);
        if (!deadline) return null;
        const tzOffset = Models.TIMEZONE_OFFSETS[order.country] || 0;
        const localDeadline = new Date(deadline.getTime() + tzOffset * 60 * 60 * 1000);
        return localDeadline;
    },

    getRemainingDays(order, applyTime) {
        const deadline = this.getOrderDeadline(order);
        if (!deadline) return -1;
        const now = applyTime ? new Date(applyTime) : new Date();
        const diffMs = deadline.getTime() - now.getTime();
        return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    },

    checkOverdue(order, applyTime) {
        const remainingDays = this.getRemainingDays(order, applyTime);
        const overdue = remainingDays < 0;
        return {
            overdue: overdue,
            remainingDays: remainingDays,
            deadline: this.getOrderDeadline(order),
            localDeadline: this.getLocalDeadline(order, applyTime),
            status: overdue ? 'overdue_intercepted' : null
        };
    },

    isSizeRelatedReason(reason) {
        return Models.SIZE_RELATED_REASONS.includes(reason);
    },

    checkNeedFeedback(returnItem) {
        const needFeedback = this.isSizeRelatedReason(returnItem.reason) ||
            returnItem.reason === 'quality' ||
            returnItem.reason === 'damaged';
        return needFeedback;
    },

    checkFeedbackRequired(returnItem) {
        const needFeedback = this.checkNeedFeedback(returnItem);
        const hasFeedback = returnItem.hasFeedback;
        return {
            required: needFeedback,
            hasFeedback: hasFeedback,
            canProceed: !needFeedback || hasFeedback,
            reason: needFeedback ? '尺码/质量争议必须有试穿反馈' : '无需试穿反馈'
        };
    },

    canModifyReason(returnItem) {
        if (returnItem.reasonLocked) return false;
        if (returnItem.hasInbound) return false;
        if (returnItem.status === 'arbitration') return false;
        if (returnItem.status === 'qc_pass' || returnItem.status === 'qc_reject') return false;
        if (returnItem.status === 'overdue_intercepted') return false;
        return true;
    },

    validateReasonModification(returnItem) {
        if (!this.canModifyReason(returnItem)) {
            let reason = '当前状态不允许修改退换原因';
            if (returnItem.reasonLocked) reason = '退换原因已锁定，无法修改';
            else if (returnItem.hasInbound) reason = '退货已入库，退换原因无法修改';
            else if (returnItem.status === 'arbitration') reason = '案件已进入仲裁，无法修改原因';
            else if (returnItem.status === 'overdue_intercepted') reason = '案件已超期拦截，无法修改原因';
            return { allowed: false, reason };
        }
        return { allowed: true };
    },

    checkStockAvailable(sku, lockQty) {
        if (!sku) return { available: false, availableStock: 0, lockQty: lockQty, reason: 'SKU不存在' };
        const availableStock = parseInt(sku.stock) || 0;
        const needQty = parseInt(lockQty) || 1;
        return {
            available: availableStock >= needQty,
            availableStock: availableStock,
            lockQty: needQty,
            shortage: Math.max(0, needQty - availableStock),
            reason: availableStock >= needQty ? '库存充足' : `库存不足，还差${Math.max(0, needQty - availableStock)}件`
        };
    },

    checkCrossWarehouseStock(returnItem, targetSku, targetWarehouse) {
        if (!targetSku) {
            return {
                available: false,
                stock: 0,
                crossWarehouse: false,
                crossWarehouseType: 'same',
                crossWarehouseShippingCost: 0,
                reason: '目标SKU不存在'
            };
        }

        const warehouseStocks = targetSku.warehouseStocks || {};
        const targetStock = parseInt(warehouseStocks[targetWarehouse]) || 0;
        const available = targetStock > 0;

        const originWarehouse = returnItem.originWarehouse || returnItem.warehouseCode;
        const crossWarehouseType = Models.getWarehouseCrossType(originWarehouse, targetWarehouse);
        const isCrossWarehouse = crossWarehouseType !== 'same';

        let crossWarehouseShippingCost = 0;
        if (isCrossWarehouse) {
            const costMap = {
                'domestic_to_bonded': 15,
                'overseas_to_domestic': 80,
                'overseas_to_bonded': 75,
                'bonded_to_overseas': 70,
                'cross_overseas': 100
            };
            crossWarehouseShippingCost = costMap[crossWarehouseType] || 50;
        }

        return {
            available: available,
            stock: targetStock,
            crossWarehouse: isCrossWarehouse,
            crossWarehouseType: crossWarehouseType,
            crossWarehouseShippingCost: crossWarehouseShippingCost,
            crossWarehouseTypeLabel: Models.WAREHOUSE_CROSS_TYPES[crossWarehouseType] || crossWarehouseType,
            reason: available
                ? (isCrossWarehouse ? `跨仓调货(${Models.WAREHOUSE_CROSS_TYPES[crossWarehouseType]})，运费${crossWarehouseShippingCost}` : '同仓库存充足')
                : `目标仓库${targetWarehouse}库存不足`
        };
    },

    calculateShippingResponsibility(returnItem, qcResult) {
        const reason = returnItem.reason;
        const flag = returnItem.maliciousFlag;

        if (flag === 'malicious' || flag === 'suspected') {
            return { shippingPayer: 'buyer', reason: '恶意退换，买家承担运费' };
        }

        const sellerReasons = ['quality', 'wrong_item', 'damaged', 'not_as_described', 'size_mismatch'];
        if (sellerReasons.includes(reason)) {
            return { shippingPayer: 'seller', reason: '卖家责任，卖家承担运费' };
        }

        if (qcResult && qcResult === 'reject') {
            return { shippingPayer: 'buyer', reason: '质检不通过，买家承担运费' };
        }

        let tariffPayer = 'seller';
        if (returnItem.tariffResponsibility === 'buyer') {
            tariffPayer = 'buyer';
        } else if (returnItem.tariffResponsibility === 'split') {
            tariffPayer = 'split';
        }

        if (returnItem.crossWarehouseShippingCost > 0 && tariffPayer === 'buyer') {
            return { shippingPayer: 'buyer', tariffPayer: tariffPayer, reason: '买家承担关税，运费由买家承担' };
        }

        if (returnItem.crossWarehouseShippingCost > 0 && tariffPayer === 'split') {
            return { shippingPayer: 'split', tariffPayer: tariffPayer, reason: '双方分担关税，运费双方分担' };
        }

        return { shippingPayer: 'split', tariffPayer: tariffPayer, reason: '无责任方判定，双方分担运费' };
    },

    calculateRefund(data) {
        const {
            unitPrice, quantity, shippingFee, returnShipping, taxFee,
            adjustAmount, platformFee, shippingPayer, taxPayer,
            orderCurrency, refundCurrency,
            crossWarehouseFee, tariffFee
        } = data;

        const goodsRefund = (parseFloat(unitPrice) || 0) * (parseInt(quantity) || 0);

        let shippingRefund = 0;
        if (shippingPayer === 'seller') {
            shippingRefund = (parseFloat(shippingFee) || 0) + (parseFloat(returnShipping) || 0);
        } else if (shippingPayer === 'split') {
            shippingRefund = ((parseFloat(shippingFee) || 0) + (parseFloat(returnShipping) || 0)) / 2;
        }

        let taxRefund = 0;
        if (taxPayer === 'seller') {
            taxRefund = parseFloat(taxFee) || 0;
        }

        const adjust = parseFloat(adjustAmount) || 0;
        const platform = parseFloat(platformFee) || 0;
        const crossFee = parseFloat(crossWarehouseFee) || 0;
        const tariff = parseFloat(tariffFee) || 0;

        const totalRefund = goodsRefund + shippingRefund + taxRefund + adjust - platform - crossFee - tariff;

        let totalInRefundCurrency = 0;
        const fromCurr = orderCurrency || 'USD';
        const toCurr = refundCurrency || 'USD';
        if (fromCurr !== toCurr) {
            totalInRefundCurrency = Models.convertCurrency(Math.max(0, totalRefund), fromCurr, toCurr);
        } else {
            totalInRefundCurrency = Number(Math.max(0, totalRefund).toFixed(2));
        }

        return {
            goodsRefund: Number(goodsRefund.toFixed(2)),
            shippingRefund: Number(shippingRefund.toFixed(2)),
            taxRefund: Number(taxRefund.toFixed(2)),
            adjustAmount: adjust,
            platformFee: platform,
            crossWarehouseFee: crossFee,
            tariffFee: tariff,
            totalRefund: Number(Math.max(0, totalRefund).toFixed(2)),
            totalInRefundCurrency: Number(totalInRefundCurrency.toFixed(2))
        };
    },

    checkQcMismatch(returnItem, inboundRecord, feedback, qcResult) {
        if (!returnItem || !inboundRecord) {
            return { triggered: false, reason: '' };
        }

        if (inboundRecord.matchStatus !== 'yes') {
            return {
                triggered: true,
                reason: `入库不一致：入库匹配状态为${inboundRecord.matchStatus === 'no' ? '不匹配' : '部分匹配'}`
            };
        }

        if (feedback && qcResult) {
            if (feedback.hasDamage === 'yes' && (qcResult.wear === 'none' || qcResult.stain === 'none')) {
                return {
                    triggered: true,
                    reason: '反馈与质检不一致：买家反馈有损坏，但质检结果无明显磨损/污渍'
                };
            }

            if (feedback.hasDamage !== 'yes' && (qcResult.wear === 'serious' || qcResult.stain === 'serious')) {
                return {
                    triggered: true,
                    reason: '反馈与质检不一致：买家反馈无损坏，但质检结果存在严重磨损/污渍'
                };
            }
        }

        return { triggered: false, reason: '' };
    },

    estimateMismatchCost(returnItem, qcMismatchReason) {
        if (!returnItem) {
            return { totalCost: 0, breakdown: {} };
        }

        const recheckCost = 30;
        let crossWarehouseCost = 0;
        let tariffCost = 0;

        const originWarehouse = returnItem.originWarehouse || '';
        const targetWarehouse = returnItem.targetWarehouse || '';
        if (originWarehouse && targetWarehouse && originWarehouse !== targetWarehouse) {
            const crossType = Models.getWarehouseCrossType(originWarehouse, targetWarehouse);
            const costMap = {
                'domestic_to_bonded': 15,
                'overseas_to_domestic': 80,
                'overseas_to_bonded': 75,
                'bonded_to_overseas': 70,
                'cross_overseas': 100
            };
            crossWarehouseCost = costMap[crossType] || 50;
        }

        if (returnItem.tariffResponsibility === 'seller' || returnItem.tariffResponsibility === 'split') {
            tariffCost = parseFloat(returnItem.tariffAmount) || 0;
            if (returnItem.tariffResponsibility === 'split') {
                tariffCost = tariffCost / 2;
            }
        }

        const totalCost = recheckCost + crossWarehouseCost + tariffCost;

        return {
            totalCost: Number(totalCost.toFixed(2)),
            breakdown: {
                recheckCost: recheckCost,
                crossWarehouseShippingCost: crossWarehouseCost,
                tariffCost: Number(tariffCost.toFixed(2))
            }
        };
    },

    validateArbitration(returnItem, userRole, mode) {
        const errors = [];
        const warnings = [];

        if (!returnItem) {
            errors.push('退换申请不存在');
            return { valid: false, errors, warnings, canFinalize: false, canModifyConclusion: false };
        }

        mode = mode || 'submit';

        const isArbitrated = returnItem.status === 'arbitration' ||
            returnItem.status === 'arbitration_locked' ||
            returnItem.maliciousFlag === 'malicious' ||
            returnItem.qcResult === 'arbitration';

        if (!isArbitrated) {
            warnings.push('该申请尚未进入仲裁流程，提交后将自动转为仲裁状态');
        }

        let canFinalize = false;
        let canSubmitDraft = false;
        let canModifyConclusion = false;
        const conclusionLocked = returnItem.arbitrationConclusionLocked === true;

        if (userRole === 'arbitrator') {
            canFinalize = true;
            canSubmitDraft = true;
            canModifyConclusion = true;
        } else if (userRole === 'supervisor') {
            canFinalize = true;
            canSubmitDraft = true;
            canModifyConclusion = true;
        } else if (userRole === 'cs' || userRole === 'warehouse') {
            canSubmitDraft = true;
            if (conclusionLocked) {
                canModifyConclusion = false;
                if (mode === 'submit' || mode === 'finalize') {
                    warnings.push('仲裁结论已锁定，当前角色仅可补充证据，不可修改结论');
                }
            } else {
                canModifyConclusion = true;
            }
            if (isArbitrated && !conclusionLocked) {
                warnings.push('普通权限：提交的结论需主管或仲裁员复核后生效');
            }
        }

        if (mode === 'finalize' && !canFinalize) {
            errors.push('当前角色无权限直接生效仲裁结论');
        }

        if (mode === 'submit' && !canSubmitDraft) {
            errors.push('当前角色无权限提交仲裁结论');
        }

        if (conclusionLocked && (userRole === 'cs' || userRole === 'warehouse') && mode !== 'evidence') {
            warnings.push('仲裁结论已锁定，仅可添加证据');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            canFinalize,
            canSubmitDraft,
            canModifyConclusion,
            conclusionLocked
        };
    },

    canCsModifyConclusion(returnItem) {
        if (!returnItem) return false;
        if (returnItem.arbitrationConclusionLocked) return false;
        if (returnItem.status === 'arbitration' ||
            returnItem.status === 'arbitration_locked') {
            return false;
        }
        if (returnItem.arbitrationInfo) return false;
        return true;
    },

    canModifyArbitrationConclusion(returnItem, userRole) {
        if (!returnItem) return false;
        const locked = returnItem.arbitrationConclusionLocked === true;
        if (userRole === 'arbitrator' || userRole === 'supervisor') return true;
        if (userRole === 'cs' || userRole === 'warehouse') {
            return !locked;
        }
        return false;
    },

    getCrossWarehouseType(originWarehouse, targetWarehouse) {
        if (!originWarehouse || !targetWarehouse) return 'same';
        if (originWarehouse === targetWarehouse) return 'same';
        const origin = Models.WAREHOUSES[originWarehouse];
        const target = Models.WAREHOUSES[targetWarehouse];
        if (!origin || !target) return 'same';
        if (origin.type === 'domestic' && target.type === 'bonded') return 'domestic_to_bonded';
        if (origin.type === 'overseas' && (target.type === 'domestic' || target.type === 'bonded')) {
            return target.type === 'bonded' ? 'overseas_to_bonded' : 'overseas_to_domestic';
        }
        if (origin.type === 'bonded' && target.type === 'overseas') return 'bonded_to_overseas';
        if (origin.type === 'overseas' && target.type === 'overseas') return 'cross_overseas';
        return 'same';
    },

    calculateCrossWarehouseShipping(originWarehouse, targetWarehouse) {
        const crossType = this.getCrossWarehouseType(originWarehouse, targetWarehouse);
        const costs = {
            'same': 0,
            'domestic_to_bonded': 5,
            'overseas_to_domestic': 25,
            'overseas_to_bonded': 20,
            'bonded_to_overseas': 22,
            'cross_overseas': 30
        };
        return costs[crossType] || 0;
    },

    validateReturnSubmission(order, returnData) {
        const errors = [];
        const warnings = [];

        if (!order) {
            errors.push('关联订单不存在');
            return { valid: false, errors, warnings };
        }

        const overdueCheck = this.checkOverdue(order, returnData.applyTime);
        if (overdueCheck.overdue) {
            errors.push(`超过退换期限${Math.abs(overdueCheck.remainingDays)}天，截止时间：${formatDateTime(overdueCheck.deadline)}`);
        } else if (overdueCheck.remainingDays <= 3) {
            warnings.push(`退换期限仅剩${overdueCheck.remainingDays}天，请尽快处理`);
        }

        if (returnData.returnType === 'exchange' && !returnData.exchangeSize) {
            errors.push('换货申请必须选择目标尺码');
        }

        if (this.isSizeRelatedReason(returnData.reason)) {
            warnings.push('尺码争议案件需要买家补充试穿反馈后才能继续');
        }

        if (returnData.maliciousFlag === 'suspected') {
            warnings.push('该申请标记为疑似恶意退换，建议密切关注');
        }
        if (returnData.maliciousFlag === 'malicious') {
            warnings.push('该申请标记为确认恶意退换，将进入仲裁流程');
        }

        if (!returnData.originWarehouse) {
            errors.push('请选择发货仓库');
        }

        if (!returnData.orderCurrency) {
            errors.push('订单币种不能为空');
        }

        let warehouseCrossType = 'same';
        if (returnData.originWarehouse && returnData.targetWarehouse) {
            warehouseCrossType = Models.getWarehouseCrossType(returnData.originWarehouse, returnData.targetWarehouse);
        }
        returnData.warehouseCrossType = warehouseCrossType;

        if (warehouseCrossType !== 'same') {
            warnings.push(`换货涉及跨仓调货(${Models.WAREHOUSE_CROSS_TYPES[warehouseCrossType]})，将产生额外运费`);
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            overdueCheck,
            warehouseCrossType
        };
    },

    validateWarehouseInbound(returnItem) {
        const errors = [];

        if (!returnItem) {
            errors.push('退换申请不存在');
            return { valid: false, errors };
        }

        if (returnItem.hasInbound) {
            errors.push('该申请已入库，不能重复入库');
        }

        if (returnItem.status === 'rejected' || returnItem.status === 'returned') {
            errors.push('该申请已被驳回/退回，无法入库');
        }

        if (returnItem.status === 'overdue_intercepted') {
            errors.push('该申请已超期拦截，无法入库');
        }

        return { valid: errors.length === 0, errors };
    },

    validateQcSubmission(returnItem, inboundRecord, feedback, qcResult) {
        const errors = [];

        if (!returnItem) {
            errors.push('退换申请不存在');
            return { valid: false, errors };
        }

        if (!returnItem.hasInbound) {
            errors.push('该申请尚未入库，请先完成入库操作');
        }

        if (returnItem.qcResult) {
            errors.push('该申请已完成质检，如需修改请走仲裁流程');
        }

        const feedbackCheck = this.checkFeedbackRequired(returnItem);
        if (!feedbackCheck.canProceed) {
            errors.push(feedbackCheck.reason + '，请先补充试穿反馈');
        }

        const mismatchCheck = this.checkQcMismatch(returnItem, inboundRecord, feedback, qcResult);
        if (mismatchCheck.triggered) {
            returnItem.qcMismatchTriggered = true;
            returnItem.qcMismatchReason = mismatchCheck.reason;
            returnItem.status = 'qc_mismatch_recheck';
        }

        return {
            valid: errors.length === 0,
            errors,
            qcMismatch: mismatchCheck
        };
    },

    validateExchangeLock(returnItem, targetSku, lockQty, targetWarehouse) {
        const errors = [];

        if (!returnItem) {
            errors.push('退换申请不存在');
            return { valid: false, errors };
        }

        if (returnItem.returnType !== 'exchange') {
            errors.push('只有换货申请才能执行锁库操作');
        }

        if (returnItem.stockLocked) {
            errors.push('该换货申请已锁库，不能重复锁库');
        }

        let stockCheck = null;
        let crossWarehouseCheck = null;

        if (targetWarehouse) {
            crossWarehouseCheck = this.checkCrossWarehouseStock(returnItem, targetSku, targetWarehouse);
            if (!crossWarehouseCheck.available) {
                errors.push(crossWarehouseCheck.reason);
            }
            stockCheck = {
                available: crossWarehouseCheck.available,
                availableStock: crossWarehouseCheck.stock,
                lockQty: parseInt(lockQty) || 1,
                shortage: Math.max(0, (parseInt(lockQty) || 1) - crossWarehouseCheck.stock),
                reason: crossWarehouseCheck.available ? '库存充足' : crossWarehouseCheck.reason
            };
        } else {
            stockCheck = this.checkStockAvailable(targetSku, lockQty);
            if (!stockCheck.available) {
                errors.push(stockCheck.reason);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            stockCheck,
            crossWarehouseCheck
        };
    },

    getArbitrationRequired(returnItem, qcData, inboundRecord) {
        if (!returnItem) return false;

        if (returnItem.maliciousFlag === 'malicious' || returnItem.maliciousFlag === 'suspected') {
            return true;
        }

        if (returnItem.status === 'arbitration' || returnItem.status === 'arbitration_locked') {
            return true;
        }

        if (qcData && qcData.result === 'arbitration') {
            return true;
        }

        if (returnItem.qcMismatchTriggered && returnItem.status === 'qc_mismatch_recheck') {
            const costEst = returnItem.costEstimation || {};
            if ((costEst.totalCost || 0) > 50) {
                return true;
            }
        }

        if (inboundRecord && inboundRecord.matchStatus && inboundRecord.matchStatus !== 'yes') {
            return true;
        }

        if (qcData) {
            const hasSeriousIssue = qcData.wear === 'serious' || qcData.stain === 'serious';
            const buyerSaidNoDamage = returnItem.hasFeedback === true;
            if (hasSeriousIssue && buyerSaidNoDamage) {
                return true;
            }
        }

        if (returnItem.reason === 'quality' || returnItem.reason === 'damaged') {
            if (returnItem.hasFeedback && qcData && qcData.result === 'reject') {
                return true;
            }
        }

        if (returnItem.tariffAmount && parseFloat(returnItem.tariffAmount) > 50) {
            return true;
        }

        if (returnItem.crossWarehouseShippingCost && parseFloat(returnItem.crossWarehouseShippingCost) > 60) {
            return true;
        }

        return false;
    }
};
