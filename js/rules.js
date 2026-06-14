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
        return {
            overdue: remainingDays < 0,
            remainingDays: remainingDays,
            deadline: this.getOrderDeadline(order),
            localDeadline: this.getLocalDeadline(order, applyTime)
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
        return true;
    },

    canCsModifyConclusion(returnItem) {
        if (returnItem.status === 'arbitration') return false;
        if (returnItem.arbitrationInfo) return false;
        return true;
    },

    canProceedWithoutFeedback(returnItem) {
        const check = this.checkFeedbackRequired(returnItem);
        return check.canProceed;
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

        return { shippingPayer: 'split', reason: '无责任方判定，双方分担运费' };
    },

    calculateRefund(data) {
        const {
            unitPrice, quantity, shippingFee, returnShipping, taxFee,
            adjustAmount, platformFee, shippingPayer, taxPayer
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

        const totalRefund = goodsRefund + shippingRefund + taxRefund + adjust - platform;

        return {
            goodsRefund: Number(goodsRefund.toFixed(2)),
            shippingRefund: Number(shippingRefund.toFixed(2)),
            taxRefund: Number(taxRefund.toFixed(2)),
            adjustAmount: adjust,
            platformFee: platform,
            totalRefund: Number(Math.max(0, totalRefund).toFixed(2))
        };
    },

    getArbitrationRequired(returnItem, qcResult, feedback) {
        if (returnItem.maliciousFlag === 'malicious') return true;
        if (qcResult && qcResult.result === 'arbitration') return true;
        if (returnItem.reason === 'quality' && feedback && feedback.hasDamage === 'yes') return true;
        if (this.isSizeRelatedReason(returnItem.reason) && qcResult && qcResult.sizeCheck === 'wrong') return true;
        return false;
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

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            overdueCheck
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

        return { valid: errors.length === 0, errors };
    },

    validateQcSubmission(returnItem) {
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

        return { valid: errors.length === 0, errors };
    },

    validateExchangeLock(returnItem, targetSku, lockQty) {
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

        const stockCheck = this.checkStockAvailable(targetSku, lockQty);
        if (!stockCheck.available) {
            errors.push(stockCheck.reason);
        }

        return {
            valid: errors.length === 0,
            errors,
            stockCheck
        };
    },

    validateArbitration(returnItem, userRole) {
        const errors = [];
        const warnings = [];

        if (!returnItem) {
            errors.push('退换申请不存在');
            return { valid: false, errors, warnings };
        }

        if (returnItem.status !== 'arbitration' && returnItem.maliciousFlag !== 'malicious') {
            if (!returnItem.qcResult || returnItem.qcResult !== 'arbitration') {
                warnings.push('该申请尚未进入仲裁流程，提交后将自动转为仲裁状态');
            }
        }

        if (userRole === 'cs' && returnItem.status === 'arbitration') {
            errors.push('该案件已进入仲裁，普通客服无法直接修改结论');
        }

        return { valid: errors.length === 0, errors, warnings };
    },

    validateReasonModification(returnItem) {
        if (!this.canModifyReason(returnItem)) {
            let reason = '当前状态不允许修改退换原因';
            if (returnItem.reasonLocked) reason = '退换原因已锁定，无法修改';
            else if (returnItem.hasInbound) reason = '退货已入库，退换原因无法修改';
            else if (returnItem.status === 'arbitration') reason = '案件已进入仲裁，无法修改原因';
            return { allowed: false, reason };
        }
        return { allowed: true };
    }
};
