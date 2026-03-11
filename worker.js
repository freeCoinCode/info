// src/worker.js
import { 
    batchUpsertCoinInfo, 
    queryCoinInfo, 
    deleteCoinInfoByIds 
} from './coininfo.js';

// 简单的 HTML 页面内容 (Bootstrap 5)
import indexHtml from './index.html';
import tableHtml from './table.html'

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    console.log("currenct Path",path)
    // 1. 处理首页 (返回 HTML)
    const value = request.headers.get("x-time");
    const hr=getUTC8YMDH()
    if ((path === '/' && method === 'GET')||!value || value !== hr) {
      return new Response(indexHtml, {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      });
    }
   if (path === '/table' && method === 'GET') {
      return new Response(tableHtml, {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      });
    }
    
    if (path === '/cron'){
      const url = await env.K.get("url");
      const token = await env.K.get("token");
      const parts = path.split('/');
      const key=parts[2]
      let acId=key;
      if(!key){
        acId='1019';
      }
      await doTask(url,token,acId,env.DB)
      return new Response("Suce", {
            headers: { 'Content-Type': 'text/html;charset=UTF-8' },
          });
    }

    if (path.startsWith("/get/")){
      console.log("get")
      const parts = path.split('/');
      const key=parts[2]
      if (!key) {
        return new Response('错误: Key 不能为空 (路径应为 /get/{key})', { status: 400 });
      }
      const v=await env.K.get(key);
     return new Response(JSON.stringify({
          success: true,
          method: 'split_string',
          path_parts: parts, // 调试用：展示分割结果
          extracted_key: key,
          value: v,
          message: '成功'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
    }
    if (path.startsWith("/set/")){
      const parts = path.split('/');
      const key=parts[2]
      if (!key) {

        return new Response('错误: Key 不能为空 (路径应为 /set/{key})', { status: 400 });

      }


      // 4. 构造 Header 名称: x-{key}

      const headerName = `x-${key}`;

      const value = request.headers.get(headerName);


      if (!value) {

        return new Response(`错误: 缺少请求头 "${headerName}"`, { 

          status: 400,

          headers: { 'Content-Type': 'text/plain' }

        });

      }


      // 5. 写入 KV (确保已绑定 MY_KV)

      if (!env.K) {
        return new Response('错误: 服务端未配置 KV 绑定', { status: 500 });

      }

      try {
        await env.K.put(key, value);
        
        return new Response(JSON.stringify({
          success: true,
          method: 'split_string',
          path_parts: parts, // 调试用：展示分割结果
          extracted_key: key,
          header_used: headerName,
          message: '写入成功'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(`KV 错误: ${e.message}`, { status: 500 });
      }
    }
    if (path === '/clean' && method === 'DELETE') {
      const stmt = env.DB.prepare("DELETE FROM coin_info ");
      await stmt.run();
      return new Response(`Clean done`, { status: 200 });
    }
    // 2. API: 查询 (GET /api/coins)
    if (path === '/api/coins' && method === 'GET') {
      try {
        const filters = {
          day: url.searchParams.get('day'),
          account: url.searchParams.get('account'),
          currency: url.searchParams.get('currency'),
          search: url.searchParams.get('search'),
          limit: url.searchParams.get('limit'),
          offset: url.searchParams.get('offset'),
        };
        const results = await queryCoinInfo(env.DB, filters);
        return jsonResponse({ success: true, data: results });
      } catch (e) {
        return jsonResponse({ success: false, error: e.message }, 500);
      }
    }

    // 3. API: 批量写入 (POST /api/coins/batch)
    if (path === '/api/coins/batch' && method === 'POST') {
      try {
        const body = await request.json();
        if (!body.items || !Array.isArray(body.items)) {
          return jsonResponse({ success: false, error: "Invalid format" }, 400);
        }
        const result = await batchUpsertCoinInfo(env.DB, body.items);
        return jsonResponse({ success: true, data: result });
      } catch (e) {
        return jsonResponse({ success: false, error: e.message }, 500);
      }
    }

    // 4. API: 批量删除 (POST /api/coins/delete)
    if (path === '/api/coins/delete' && method === 'POST') {
      try {
        const body = await request.json();
        if (!body.ids || !Array.isArray(body.ids)) {
          return jsonResponse({ success: false, error: "Invalid format" }, 400);
        }
        const result = await deleteCoinInfoByIds(env.DB, body.ids);
        return jsonResponse({ success: true, deletedCount: result.meta.changes });
      } catch (e) {
        return jsonResponse({ success: false, error: e.message }, 500);
      }
    }

    // 404 Not Found
    return new Response('Not Found', { status: 404 });
  },async scheduled(event, env, ctx) {
    const cronPattern = event.cron; // 获取触发当前的 cron 表达式字符串
    console.log(`⏰ 定时任务触发: ${cronPattern}, 时间: ${event.scheduledTime}`);
   try {

      // 根据 cron 表达式路由到不同的处理函数
      switch (cronPattern) {
        case '1 */1 * * *':
           {
            const url = await env.K.get("url");
            const token = await env.K.get("token");
            const max=await env.K.get("end")||1030;
            for(let ac=1000;ac<max;ac++){
              await doTask(url,token,ac,env.DB)
            }
             break;
          }
         
        case '0 8 * * *':
          await handleHourlyCleanup(env, ctx);
          break;
        
        default:
          console.warn(`未知的 Cron 表达式: ${cronPattern}`);
      }
    } catch (error) {
      console.error(`❌ 任务执行失败 (${cronPattern}):`, error);
      // 这里可以添加错误报警逻辑
    }

    console.log(`⏰ 任务结束 ${event.scheduledTime}`);
  },
};
// --- 任务 3: 每小时清理旧数据 ---
async function handleHourlyCleanup(env, ctx) {
  console.log('🧹 开始执行：清理过期数据...');
  // 在这里编写 DELETE 逻辑，例如删除 30 天前的数据
  const stmt = env.DB.prepare("DELETE FROM coin_info WHERE created_at < datetime('now', '-3 days')");
  await stmt.run();
}
async function doTask(url,token,acId,db) {
  try {
     
      // 步骤 A: 抓取数据
      const apiData = await fetchAccountData(url,token,acId);
      
      if (!apiData || apiData.code !== 0 || !apiData.data) {
        console.error('API 返回错误或无数据:', apiData);
        return;
      }

      // 步骤 B: 过滤数据 (type === 1 且 balance > 0)
      // 注意：balance 是字符串，需要转为数字比较
      const filteredItems = apiData.data.filter(item => {
        const balanceNum = parseFloat(item.balance);
        return item.type === 1 && balanceNum > 0;
      });

      if (filteredItems.length === 0) {
        console.log('✅ 没有符合条件的数据 (type=1 且 balance>0)，跳过写入。');
        return;
      }

      // 步骤 C: 转换数据格式以适配 D1 表结构
      // 生成 day 字段: YYYYMMDDHH
      
      const dayStr = getUTC8YMDH()

      const dbItems = filteredItems.map(item => ({
        day: dayStr,
        account: String(item.accountId), // 将 accountId 映射为 account
        currency: item.currency,
        amount: parseFloat(item.balance),
        remark: `UID:${item.uid}|Type:${item.typeName}`, // 将有用信息存入备注
        // id 和 created_at 由数据库自动生成
      }));

      // 步骤 D: 批量写入 D1
      const result = await batchUpsertCoinInfo(db, dbItems);
      
      console.log(`✅ 成功写入 ${dbItems.length} 条数据到 D1。`, result);

    } catch (error) {
      console.error('❌ 定时任务执行失败:', error);
      // 可以在这里添加错误报警逻辑 (如发送 webhook)
    }
  
}
// --- 辅助函数 ---
async function buildDid(){
  // 1. 获取当前时间戳 (秒级)
    // 如果你需要毫秒级，可以使用 Date.now()
    const now = Math.floor(Date.now() / 1000);
    const timestampString = now.toString();

    // 2. 将字符串转换为 ArrayBuffer (TextEncoder)
    const encoder = new TextEncoder();
    const data = encoder.encode(timestampString);

    // 3. 计算 SHA-256 哈希
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    // 4. 将 ArrayBuffer 转换为十六进制字符串
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

function getUTC8YMDH(){
  // 1. 获取当前时间对象
    const now = new Date();

    // 2. 配置格式化选项

    // timeZone: 'Asia/Shanghai' 代表 UTC+8 (中国标准时间)

    const options = {

      timeZone: 'Asia/Shanghai',

      year: 'numeric',    // 4位年份

      month: '2-digit',   // 2位月份 (自动补零)

      day: '2-digit',     // 2位日期 (自动补零)

      hour: '2-digit',    // 2位小时 (24小时制，自动补零)

      hour12: false       // 强制使用24小时制

    };


    // 3. 创建格式化器

    const formatter = new Intl.DateTimeFormat('zh-CN', options);


    // 4. 获取格式化后的部分

    // formatToParts 返回数组，我们需要提取数值并拼接

    const parts = formatter.formatToParts(now);

    

    // 辅助函数：从 parts 数组中提取特定类型的值

    const getPart = (type) => parts.find(p => p.type === type).value;


    const yyyy = getPart('year');

    const MM = getPart('month');

    const dd = getPart('day');

    const HH = getPart('hour');


    // 5. 拼接字符串

    const timeString = `${yyyy}${MM}${dd}${HH}`;
    return timeString;
}
/**
 * 调用外部 API 抓取数据
 */
async function fetchAccountData(url,token,accid) {
  // 在实际生产中，建议从 env 读取敏感信息: env.ACC_ID, env.DEVICE_ID
  if(!url || !token || !accid ){
    throw new Error(`API 请求失败: Please check config.`);
  }
  const did=await buildDid();
  console.log(`url:${url};token:${token}`)
  // 调用函数
fetchTTXUserInfo(url,token, did)
  .then(userInfo => {
    console.log('获取到的用户信息:', userInfo);
    // 在这里处理你的业务逻辑，例如：
    // console.log('用户名:', userInfo.data.nickname);
  })
  .catch(err => {
    console.error('发生错误:', err.message);
  });
  const response = await fetch(`${url}/api/spot/batchAccountList`, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'exch-client-type': 'PC',
      'exch-device-id': did,
      'exch-id': '1',
      'exch-token':token,
      'exch-language': 'en_US',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.7020.89 Safari/537.36 OPR/116.0.5302.50',
      // 其他 header 可根据需要补充
    },
    body: `{"accountIds":[{"accountId":${accid},"accountType":1}]}`
  });

  if (!response.ok) {
    throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

async function fetchTTXUserInfo(u,token, deviceId="") {

  const url = `${u}/v2/user/base/info`;


  // 构建请求头

  const headers = {


    'authorization': `Bearer ${token}`,

    'content-type': 'application/json', // 虽然 body 为空，但通常建议带上

    'content-length': '0',

    'exch-client-type': 'PC',

    'exch-device-id': deviceId,

    'exch-id': '1',

    'exch-language': 'en_US',

    'exch-token': token,


    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.7020.89 Safari/537.36 OPR/116.0.5302.50'

  };


  try {

    const response = await fetch(url, {

      method: 'POST',

      headers: headers,

      body: '' // 显式指定空 body，对应 content-length: 0

    });


    if (!response.ok) {

      // 如果状态码不是 2xx，抛出错误

      throw new Error(`HTTP error! status: ${response.status}, message: ${response.statusText}`);

    }


    // 尝试解析 JSON

    const data = await response.json();

    return data;


  } catch (error) {

    console.error('请求失败:', error);

    throw error; // 重新抛出以便调用者处理

  }

}
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
