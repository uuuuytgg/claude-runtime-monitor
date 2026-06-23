#!/usr/bin/env node
// Claude Monitor 哨兵脚本 - 检查 server 状态并自动恢复
// 由 cron 每小时触发

import { execSync } from 'child_process';
import { existsSync } from 'fs';

const PROJECT = 'D:/ClaudeData/claude-runtime-monitor';
const PORT = 4377;
const HOST = '127.0.0.1';

const sh = (c) => { try { return execSync(c, { timeout: 30000, windowsHide: true }).toString().trim(); } catch { return ''; } };

// 1. Server 健康检查
let serverOk = false;
let healthData = '';
try {
  healthData = sh(`curl -sf --max-time 5 http://${HOST}:${PORT}/api/health`);
  serverOk = healthData.includes('"ok"');
} catch {}

// 2. 快照数据检查
let snapshotData = '';
let hasData = false;
try {
  snapshotData = sh(`curl -sf --max-time 5 http://${HOST}:${PORT}/api/snapshot`);
  hasData = snapshotData.length > 50;
} catch {}

// 3. DB 文件检查
const dbPath = `${PROJECT}/apps/server/storage/crm.db`;
const dbOk = existsSync(dbPath);

// 4. Node 进程检查
const psLines = sh('wmic process where "name=\'node.exe\'" get ProcessId,CommandLine /format:list 2>nul');
const monitorProcs = psLines.split(/\r?\n\r?\n/).filter(b =>
  b.includes('claude-runtime-monitor') || b.includes('crm')
);

const report = `===== CRON 哨兵报告 =====
时间: ${new Date().toISOString()}

Server:     ${serverOk ? '✅ 正常' : '❌ 异常'} (端口 ${PORT})
Health:     ${healthData.slice(0, 80)}
快照数据:   ${hasData ? '✅ 有数据' : '❌ 无数据'}
DB 文件:    ${dbOk ? '✅ 存在' : '❌ 缺失'}
监控进程:   ${monitorProcs.length} 个
`;

console.log(report);

// 5. 自动恢复
if (!serverOk) {
  console.log('⚠️ Server 不可达，尝试重启...');
  try {
    // 先杀掉可能残留的旧进程
    sh('taskkill /F /FI "WINDOWTITLE eq claude-monitor*" 2>nul');

    // 通过 pnpm dev:server 启动
    sh(`powershell -Command "Start-Process -FilePath 'powershell' -ArgumentList '-NoExit','-Command','cd ''${PROJECT}''; pnpm run dev:server' -WindowStyle Minimized"`);
    console.log('✅ 已发送重启命令，等待 10 秒后验证...');

    // 等待启动
    execSync('sleep 10', { timeout: 15000 });

    // 验证
    const recheck = sh(`curl -sf --max-time 5 http://${HOST}:${PORT}/api/health`);
    if (recheck.includes('"ok"')) {
      console.log('✅ 重启成功，Server 已恢复');
    } else {
      console.log('❌ 重启后仍不可达，需人工排查');
    }
  } catch (e) {
    console.log('❌ 自动恢复失败:', e.message);
  }
} else {
  console.log('✅ 所有服务正常');
}
