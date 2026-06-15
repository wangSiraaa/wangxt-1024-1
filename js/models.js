const Models = {
    TIMEZONE_OFFSETS: {
        'US': -5, 'UK': 0, 'DE': 1, 'FR': 1,
        'JP': 9, 'AU': 10, 'CA': -5, 'SG': 8
    },

    RETURN_STATUS: {
        PENDING: 'pending',
        BUYER_SUBMITTED: 'buyer_submitted',
        WAREHOUSE_PENDING: 'warehouse_pending',
        WAREHOUSE_IN: 'warehouse_in',
        QC_PENDING: 'qc_pending',
        QC_PASS: 'qc_pass',
        QC_REJECT: 'qc_reject',
        EXCHANGE_LOCKED: 'exchange_locked',
        REFUND_PENDING: 'refund_pending',
        REFUNDED: 'refunded',
        ARBITRATION: 'arbitration',
        COMPLETED: 'completed',
        REJECTED: 'rejected',
        RETURNED: 'returned'
    },

    RETURN_STATUS_LABEL: {
        'pending': '待买家反馈',
        'buyer_submitted': '买家已提交',
        'warehouse_pending': '待仓库入库',
        'warehouse_in': '已入库',
        'qc_pending': '待质检',
        'qc_pass': '质检通过',
        'qc_reject': '质检不通过',
        'exchange_locked': '换货已锁库',
        'refund_pending': '待退款',
        'refunded': '已退款',
        'arbitration': '争议仲裁中',
        'completed': '已完成',
        'rejected': '已驳回',
        'returned': '已退回'
    },

    RETURN_STATUS_BADGE: {
        'pending': 'badge-warning',
        'buyer_submitted': 'badge-info',
        'warehouse_pending': 'badge-warning',
        'warehouse_in': 'badge-info',
        'qc_pending': 'badge-warning',
        'qc_pass': 'badge-success',
        'qc_reject': 'badge-danger',
        'exchange_locked': 'badge-info',
        'refund_pending': 'badge-warning',
        'refunded': 'badge-success',
        'arbitration': 'badge-purple',
        'completed': 'badge-success',
        'rejected': 'badge-danger',
        'returned': 'badge-danger'
    },

    RETURN_TYPES: {
        EXCHANGE: 'exchange',
        REFUND: 'refund',
        REFUND_ONLY: 'refund_only'
    },

    RETURN_TYPE_LABEL: {
        'exchange': '换货',
        'refund': '退款',
        'refund_only': '仅退款'
    },

    REASON_MAP: {
        'size_big': { zh: '尺码偏大', en: 'Size Too Large' },
        'size_small': { zh: '尺码偏小', en: 'Size Too Small' },
        'size_mismatch': { zh: '尺码不符', en: 'Size Mismatch' },
        'quality': { zh: '质量问题', en: 'Quality Issue' },
        'wrong_item': { zh: '发错商品', en: 'Wrong Item Sent' },
        'damaged': { zh: '运输损坏', en: 'Shipping Damage' },
        'not_as_described': { zh: '与描述不符', en: 'Not As Described' },
        'no_longer_needed': { zh: '不再需要', en: 'No Longer Needed' },
        'other': { zh: '其他', en: 'Other' }
    },

    SIZE_RELATED_REASONS: ['size_big', 'size_small', 'size_mismatch'],

    MALICIOUS_FLAG: {
        NORMAL: 'normal',
        SUSPECTED: 'suspected',
        MALICIOUS: 'malicious'
    },

    MALICIOUS_LABEL: {
        'normal': '正常',
        'suspected': '疑似恶意',
        'malicious': '确认恶意'
    },

    MALICIOUS_BADGE: {
        'normal': 'badge-success',
        'suspected': 'badge-warning',
        'malicious': 'badge-danger'
    },

    createOrder(data) {
        return {
            id: generateId('ORD'),
            orderId: data.orderId,
            buyerAccount: data.buyerAccount || '',
            country: data.country,
            orderTime: data.orderTime,
            receiveTime: data.receiveTime || null,
            returnDeadline: parseInt(data.returnDeadline) || 30,
            orderAmount: parseFloat(data.orderAmount) || 0,
            shippingFee: parseFloat(data.shippingFee) || 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    },

    createSku(data) {
        return {
            id: generateId('SKU'),
            skuCode: data.skuCode,
            skuName: data.skuName || '',
            size: data.size,
            color: data.color || '',
            stock: parseInt(data.stock) || 0,
            safeStock: parseInt(data.safeStock) || 5,
            price: parseFloat(data.price) || 0,
            weight: parseFloat(data.weight) || 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    },

    createReturn(data) {
        return {
            id: generateId('RET'),
            orderId: data.orderId,
            orderRef: data.orderRef || null,
            skuCode: data.skuCode,
            skuRef: data.skuRef || null,
            returnType: data.returnType,
            quantity: parseInt(data.quantity) || 1,
            reason: data.reason,
            exchangeSize: data.exchangeSize || null,
            maliciousFlag: data.maliciousFlag || 'normal',
            applyTime: data.applyTime || new Date().toISOString(),
            remark: data.remark || '',
            status: 'pending',
            deadlineTime: null,
            reasonLocked: false,
            hasFeedback: false,
            hasInbound: false,
            qcResult: null,
            stockLocked: false,
            refundInfo: null,
            arbitrationInfo: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    },

    createFeedback(data) {
        return {
            id: generateId('FB'),
            returnId: data.returnId,
            tryOnDuration: data.tryOnDuration || '',
            hasDamage: data.hasDamage || 'no',
            tagKept: data.tagKept || 'yes',
            packageOk: data.packageOk || 'yes',
            fitFeeling: data.fitFeeling || '',
            descriptionZh: data.descriptionZh || '',
            descriptionEn: data.descriptionEn || '',
            images: data.images || '',
            createdAt: new Date().toISOString()
        };
    },

    createLogistics(data) {
        return {
            id: generateId('LOG'),
            returnId: data.returnId,
            trackingNo: data.trackingNo || '',
            carrier: data.carrier || '',
            trackTime: data.trackTime,
            trackNode: data.trackNode,
            trackLocation: data.trackLocation || '',
            description: data.description || '',
            createdAt: new Date().toISOString()
        };
    },

    createInbound(data) {
        return {
            id: generateId('INB'),
            returnId: data.returnId,
            warehouseCode: data.warehouseCode,
            receivedQty: parseInt(data.receivedQty) || 0,
            inboundTime: data.inboundTime || new Date().toISOString(),
            packageStatus: data.packageStatus || 'good',
            matchStatus: data.matchStatus || 'yes',
            remark: data.remark || '',
            createdAt: new Date().toISOString()
        };
    },

    createQcResult(data) {
        return {
            id: generateId('QC'),
            returnId: data.returnId,
            result: data.result,
            sizeCheck: data.sizeCheck || 'not_applicable',
            resellable: data.resellable || 'yes',
            stain: data.stain || 'none',
            wear: data.wear || 'none',
            inspector: data.inspector || '',
            qcTime: data.qcTime || new Date().toISOString(),
            remark: data.remark || '',
            createdAt: new Date().toISOString()
        };
    },

    createRefund(data) {
        return {
            id: generateId('REF'),
            returnId: data.returnId,
            goodsAmount: parseFloat(data.goodsAmount) || 0,
            shippingFee: parseFloat(data.shippingFee) || 0,
            returnShipping: parseFloat(data.returnShipping) || 0,
            taxFee: parseFloat(data.taxFee) || 0,
            adjustAmount: parseFloat(data.adjustAmount) || 0,
            platformFee: parseFloat(data.platformFee) || 0,
            shippingPayer: data.shippingPayer || 'seller',
            taxPayer: data.taxPayer || 'seller',
            totalAmount: parseFloat(data.totalAmount) || 0,
            channel: data.channel || '',
            externalTxnId: data.externalTxnId || '',
            remark: data.remark || '',
            status: 'pending',
            createdAt: new Date().toISOString()
        };
    },

    createArbitration(data) {
        return {
            id: generateId('ARB'),
            returnId: data.returnId,
            officer: data.officer || '',
            result: data.result,
            level: data.level || 'normal',
            refundAmount: parseFloat(data.refundAmount) || 0,
            compensation: parseFloat(data.compensation) || 0,
            reason: data.reason,
            status: data.status || 'final',
            submitterRole: data.submitterRole || '',
            submittedBy: data.submittedBy || '',
            reviewedBy: data.reviewedBy || '',
            reviewTime: data.reviewTime || '',
            rejectReason: data.rejectReason || '',
            createdAt: new Date().toISOString()
        };
    }
};
