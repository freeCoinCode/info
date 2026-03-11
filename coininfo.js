// coininfo.js

/**
 * 插入或更新单条数据 (Upsert)
 * 由于有唯一约束，如果存在则更新，不存在则插入
 */
export async function upsertCoinInfo(db, data) {
    const { day, account, currency, amount, remark } = data;
    const created_at = new Date().toISOString();

    // SQLite UPSert 语法: ON CONFLICT DO UPDATE
    const stmt = db.prepare(`
        INSERT INTO coin_info (day, account, currency, amount, remark, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(day, account, currency) DO UPDATE SET
        amount = excluded.amount,
        remark = excluded.remark,
        created_at = excluded.created_at
    `);
    
    return await stmt.bind(day, account, currency, amount, remark || null, created_at).run();
}

/**
 * 批量插入/更新数据
 * @param {D1Database} db 
 * @param {Array} items - [{day, account, currency, amount, remark}, ...]
 */
export async function batchUpsertCoinInfo(db, items) {
    if (!items || items.length === 0) return { success: true, meta: { count: 0 } };

    const statements = items.map(item => {
        const created_at = new Date().toISOString();
        return db.prepare(`
            INSERT INTO coin_info (day, account, currency, amount, remark, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(day, account, currency) DO UPDATE SET
            amount = excluded.amount,
            remark = excluded.remark,
            created_at = excluded.created_at
        `).bind(
            item.day, 
            item.account, 
            item.currency, 
            parseFloat(item.amount), 
            item.remark || null, 
            created_at
        );
    });

    return await db.batch(statements);
}

/**
 * 查询数据 (支持分页、过滤、模糊查询)
 * @param {D1Database} db
 * @param {Object} filters - { day, account, currency, search (模糊), limit, offset }
 */
export async function queryCoinInfo(db, filters = {}) {
    let sql = `SELECT * FROM coin_info WHERE 1=1`;
    const params = [];

    // 精确匹配
    if (filters.day) {
        sql += ` AND day = ?`;
        params.push(filters.day);
    }
    if (filters.account) {
        sql += ` AND account = ?`;
        params.push(filters.account);
    }
    if (filters.currency) {
        sql += ` AND currency = ?`;
        params.push(filters.currency);
    }

    // 模糊查询 (搜索 remark, account, currency)
    if (filters.search) {
        const searchTerm = `%${filters.search}%`;
        sql += ` AND (remark LIKE ? OR account LIKE ? OR currency LIKE ?)`;
        params.push(searchTerm, searchTerm, searchTerm);
    }

    sql += ` ORDER BY day DESC, created_at DESC`;

    // 分页
    const limit = filters.limit ? parseInt(filters.limit) : 1000;
    const offset = filters.offset ? parseInt(filters.offset) : 0;
    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const { results } = await db.prepare(sql).bind(...params).all();
    
    // 获取总数 (用于前端分页显示)
    // 注意：为了性能，生产环境通常单独写一个 count 查询，这里简化处理
    let countSql = sql.replace(/SELECT \* FROM/, "SELECT COUNT(*) as total FROM").replace(/LIMIT \? OFFSET \?$/, "");
    // 移除最后的 limit/offset 参数绑定需要重新构建参数数组，这里简单起见只返回结果列表
    // 如果需要精确总数，建议单独执行一次 count 查询
    
    return results;
}

/**
 * 批量删除
 * @param {D1Database} db
 * @param {Array} ids - [id1, id2, ...] 或者根据条件删除
 */
export async function deleteCoinInfoByIds(db, ids) {
    if (!ids || ids.length === 0) return { success: true, meta: { count: 0 } };
    
    // 构造 DELETE FROM table WHERE id IN (?, ?, ...)
    // 注意：SQLite 对绑定变量数量有限制，如果 ids 非常多需要分批
    const placeholders = ids.map(() => '?').join(',');
    const sql = `DELETE FROM coin_info WHERE id IN (${placeholders})`;
    
    return await db.prepare(sql).bind(...ids).run();
}

/**
 * 根据条件删除 (例如删除某天的所有数据)
 */
export async function deleteCoinInfoByCondition(db, conditions) {
    let sql = `DELETE FROM coin_info WHERE 1=1`;
    const params = [];
    
    if (conditions.day) {
        sql += ` AND day = ?`;
        params.push(conditions.day);
    }
    if (conditions.account) {
        sql += ` AND account = ?`;
        params.push(conditions.account);
    }
    
    return await db.prepare(sql).bind(...params).run();
}
