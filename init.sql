-- 创建表
CREATE TABLE IF NOT EXISTS coin_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,          
    account TEXT NOT NULL,
    currency TEXT NOT NULL,
    amount REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    remark TEXT,
    UNIQUE(day, account, currency)
);

-- 创建索引以加速查询 (可选但推荐)
CREATE INDEX IF NOT EXISTS idx_day ON coin_info(day);
CREATE INDEX IF NOT EXISTS idx_account ON coin_info(account);
CREATE INDEX IF NOT EXISTS idx_currency ON coin_info(currency);
