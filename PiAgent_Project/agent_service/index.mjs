/**
 * PiAgent HTTP 服务
 * 
 * 将 PiAgent_Project 的 SDK 能力通过 HTTP 暴露给前端
 * 核心思路：复用 auto_code.js 的 SDK 模式，把 subscribe 事件转发为 SSE
 */

import express from 'express';
import cors from 'cors';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync, readFileSync, writeFileSync, createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const LOG_FILE = join(dirname(__filename), 'agent.log');

function getTimestamp() {
  return new Date().toISOString();
}

const originalLog = console.log;
const logStream = createWriteStream(LOG_FILE, { flags: 'a' });

console.log = (...args) => {
  const timestamp = `[${getTimestamp()}]`;
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
  const logLine = `${timestamp} ${message}\n`;
  logStream.write(logLine);
  originalLog.apply(console, args);
};

console.error = (...args) => {
  const timestamp = `[${getTimestamp()}]`;
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
  const logLine = `${timestamp} [ERROR] ${message}\n`;
  logStream.write(logLine);
  originalLog.apply(console, args);
};

const { scene3DTools } = await import('./scene3d_tools.js');
import { SYSTEM_PROMPT } from './systemPrompt.js';
import { getMCPTools, shutdownMCP } from './mcp_client.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 请求日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  const ip = req.ip || req.connection.remoteAddress;
  console.log(`[HTTP] ${req.method} ${req.path} - ${ip}`);

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[HTTP] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });

  next();
});

const PORT = process.env.AGENT_PORT || 3001;
const __dirname = dirname(fileURLToPath(import.meta.url));

// ===== 加载 PiAgent SDK =====

let createAgentSession, createCodingTools, createLsTool, createFindTool, createGrepTool, SessionManager, buildSystemPrompt;
let sdkLoaded = false;

async function loadSDK() {
  // 加载 .env
  try {
    const { config } = await import('dotenv');
    const result = config({ path: join(__dirname, '..', '.env') });
    if (result.error) {
      console.log('[PiAgent] No .env found, using system env');
    }
  } catch (e) {
    console.log('[PiAgent] dotenv not available, using system env');
  }

  // 动态加载 PiAgent 的 SDK（当前在 PiAgent_Project/agent_service 下）
  const paths = [
    join(__dirname, '..', 'pi-agent', 'node_modules', '@mariozechner', 'pi-coding-agent', 'dist', 'index.js'),
    join(__dirname, '..', 'node_modules', '@mariozechner', 'pi-coding-agent', 'dist', 'index.js'),
    join(__dirname, 'node_modules', '@mariozechner', 'pi-coding-agent', 'dist', 'index.js'),
  ];

  for (const p of paths) {
    try {
      const mod = await import(p);
      createAgentSession = mod.createAgentSession;
      createCodingTools = mod.createCodingTools;
      createLsTool = mod.createLsTool;
      createFindTool = mod.createFindTool;
      createGrepTool = mod.createGrepTool;
      SessionManager = mod.SessionManager;
      buildSystemPrompt = mod.buildSystemPrompt;
      sdkLoaded = true;
      console.log(`[PiAgent] SDK loaded from: ${p}`);
      return;
    } catch (e) {
      continue;
    }
  }

  try {
    const mod = await import('@mariozechner/pi-coding-agent');
    createAgentSession = mod.createAgentSession;
    createCodingTools = mod.createCodingTools;
    createLsTool = mod.createLsTool;
    createFindTool = mod.createFindTool;
    createGrepTool = mod.createGrepTool;
    SessionManager = mod.SessionManager;
    buildSystemPrompt = mod.buildSystemPrompt;
    sdkLoaded = true;
    console.log('[PiAgent] SDK loaded from package');
  } catch (e) {
    console.error('[PiAgent] Failed to load SDK:', e.message);
  }
}

// ===== 会话存储 =====

const agentSessions = new Map();

// ===== 会话映射（前端 sessionId ↔ PiAgent 会话文件路径） =====

const SESSION_MAP_FILE = join(__dirname, '.session-map.json');

function loadSessionMap() {
  try {
    if (existsSync(SESSION_MAP_FILE)) {
      const data = readFileSync(SESSION_MAP_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.warn('[PiAgent] Failed to load session map:', e.message);
  }
  return {};
}

function saveSessionMap(map) {
  try {
    writeFileSync(SESSION_MAP_FILE, JSON.stringify(map, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[PiAgent] Failed to save session map:', e.message);
  }
}

const sessionMap = loadSessionMap();

/**
 * 获取 PiAgent 会话文件路径（从映射中查找）
 */
function getSessionPath(sessionId) {
  return sessionMap[sessionId] || null;
}

/**
 * 记录前端 sessionId 与 PiAgent 会话文件路径的映射
 */
function setSessionPath(sessionId, path) {
  sessionMap[sessionId] = path;
  saveSessionMap(sessionMap);
}

/**
 * 创建或恢复 Agent 会话
 * - 如果内存中有，直接返回
 * - 如果映射中有 PiAgent 会话文件，恢复它
 * - 否则创建新会话
 */
async function getOrCreateSession(sessionId, options = {}) {
  // 1. 内存中已有
  if (agentSessions.has(sessionId)) {
    return agentSessions.get(sessionId);
  }

  if (!sdkLoaded) {
    throw new Error('PiAgent SDK not loaded');
  }

  // 工作目录：优先使用传入的 cwd，默认 PiAgent_Project（当前在 PiAgent_Project/agent_service 下）
  const cwd = options.cwd || join(__dirname, '..');

  // 创建完整的工具集：codingTools + ls/find/grep
  const tools = [
    ...createCodingTools(cwd),
    createLsTool(cwd),      // 列出目录内容
    createFindTool(cwd),    // 查找文件
    createGrepTool(cwd),    // 搜索文件内容
  ];

  // 2. 尝试恢复已有会话
  const existingPath = getSessionPath(sessionId);
  let sessionManager;

  if (existingPath && existsSync(existingPath)) {
    try {
      sessionManager = SessionManager.open(existingPath);
      console.log(`[PiAgent] Restoring session ${sessionId} from: ${existingPath}`);
    } catch (e) {
      console.warn(`[PiAgent] Failed to restore session ${sessionId}: ${e.message}`);
      sessionManager = null;
    }
  }

  if (!sessionManager) {
    sessionManager = SessionManager.create(cwd);
  }

  console.log('[PiAgent] Loading MCP tools...');
  const mcpTools = await getMCPTools();
  console.log(`[PiAgent] MCP tools loaded: ${mcpTools.length}`);

  const { session, modelFallbackMessage } = await createAgentSession({
    cwd,
    tools,
    sessionManager,
    customTools: [...scene3DTools, ...mcpTools, ...(options.customTools || [])],
  });

  if (modelFallbackMessage) {
    console.log('[PiAgent] Model fallback:', modelFallbackMessage);
  }

  // 3. 保存会话并记录映射
  agentSessions.set(sessionId, { session, cwd, createdAt: Date.now() });

  // 获取 PiAgent SDK 的实际会话文件路径，建立映射
  try {
    const sm = session.sessionManager || sessionManager;
    if (sm && sm.sessionFile) {
      setSessionPath(sessionId, sm.sessionFile);
      console.log(`[PiAgent] Session map: ${sessionId} -> ${sm.sessionFile}`);
    }
  } catch (e) {
    // ignore
  }

  console.log(`[PiAgent] Session ${existingPath ? 'restored' : 'created'}: ${sessionId}`);
  return { session, cwd, createdAt: Date.now() };
}

// ===== API 路由 =====

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    sdkLoaded,
    sessions: agentSessions.size,
  });
});

// 创建会话
app.post('/api/session', async (req, res) => {
  try {
    const { sessionId, cwd, customTools } = req.body;
    const id = sessionId || `web-${Date.now()}`;

    await getOrCreateSession(id, { cwd, customTools });

    res.json({ success: true, sessionId: id });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 发送消息 - SSE 事件流
app.post('/api/chat', async (req, res) => {
  const { sessionId, message, cwd: reqCwd } = req.body;
  const startTime = Date.now();
  let responseStarted = false;

  console.log(`\n[PiAgent] >>>> CHAT START [${sessionId}]`);
  console.log(`[PiAgent] Message: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`);

  try {
    const entry = await getOrCreateSession(sessionId, { cwd: reqCwd });
    const { session } = entry;
    console.log(`[PiAgent] Session loaded: ${sessionId}`);

    // 如果是第一次发送消息，添加系统提示词
    let finalMessage = message;
    if (!entry._hasSystemPrompt && SYSTEM_PROMPT) {
      finalMessage = `${SYSTEM_PROMPT}\n\n---\n\n用户需求：${message}`;
      entry._hasSystemPrompt = true;
      console.log(`[PiAgent] System prompt attached (first message)`);
    }
    // 后续消息直接发送，不添加额外提醒
    finalMessage = message;

    // 设置 SSE 头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let streamAlive = true;
    res.on('close', () => {
      streamAlive = false;
      console.log(`[PiAgent] <<<< SSE CLOSED by client [${sessionId}]`);
      // 客户端断开时自动 abort Agent，避免后台继续执行浪费资源
      if (entry) {
        entry.session.abort().catch(() => {});
      }
    });

    // 发送开始事件
    res.write(`data: ${JSON.stringify({ type: 'agent_start' })}\n\n`);
    console.log(`[PiAgent] Agent start event sent`);

    // 事件统计
    const eventStats = {
      totalRaw: 0,
      textDelta: 0,
      thinkingDelta: 0,
      toolCallStart: 0,
      toolExecutionStart: 0,
      toolExecutionEnd: 0,
      agentEnd: 0,
      lastEventTime: Date.now(),
      rawTypes: new Set(),
    };

    // 订阅事件并转发为 SSE
    session.subscribe((event) => {
      if (!streamAlive) return;
      try {
        responseStarted = true;
        eventStats.lastEventTime = Date.now();
        eventStats.totalRaw++;
        eventStats.rawTypes.add(event.type);

        // 详细日志：前20个事件打印完整对象，之后只打印类型
        if (eventStats.totalRaw <= 20) {
          const rawKeys = Object.keys(event);
          console.log(`[PiAgent] RAW EVENT #${eventStats.totalRaw}: type=${event.type}, keys=[${rawKeys.join(',')}]`);
          // 打印关键子字段
          if (event.assistantMessageEvent) {
            console.log(`[PiAgent]   assistantMessageEvent: type=${event.assistantMessageEvent.type}, keys=[${Object.keys(event.assistantMessageEvent).join(',')}]`);
          }
          if (event.delta) {
            console.log(`[PiAgent]   delta: type=${event.delta.type || typeof event.delta}, text=${typeof event.delta.text === 'string' ? event.delta.text.substring(0, 50) : JSON.stringify(event.delta).substring(0, 100)}`);
          }
          if (event.toolName) {
            console.log(`[PiAgent]   toolName=${event.toolName}`);
          }
        } else if (eventStats.totalRaw === 21) {
          console.log(`[PiAgent] ... (further events suppressed, total types seen: ${[...eventStats.rawTypes].join(', ')})`);
        }

        const out = { type: event.type, _raw: true };

        // 文本增量
        if (event.type === 'message_update' && event.assistantMessageEvent) {
          out.eventType = event.assistantMessageEvent.type;

          if (event.assistantMessageEvent.type === 'text_delta') {
            out.delta = event.assistantMessageEvent.delta;
            eventStats.textDelta++;
            if (eventStats.textDelta <= 3) console.log(`[PiAgent] text_delta: "${event.assistantMessageEvent.delta.substring(0, 50)}..."`);
          } else if (event.assistantMessageEvent.type === 'thinking_delta') {
            out.delta = event.assistantMessageEvent.delta;
            out.isThinking = true;
            eventStats.thinkingDelta++;
            if (eventStats.thinkingDelta <= 2) console.log(`[PiAgent] thinking_delta: ${event.assistantMessageEvent.delta.length} chars`);
          } else if (event.assistantMessageEvent.type === 'toolcall_start') {
            out.toolCallId = event.assistantMessageEvent.toolCallId;
            out.toolName = event.assistantMessageEvent.toolName;
            eventStats.toolCallStart++;
            console.log(`[PiAgent] toolcall_start: ${event.assistantMessageEvent.toolName}`);
          } else if (event.assistantMessageEvent.type === 'toolcall_delta') {
            out.toolCallId = event.assistantMessageEvent.toolCallId;
            out.delta = event.assistantMessageEvent.delta;
          }
        }

        // 兼容其他 SDK 事件格式：content_block_delta（Anthropic 风格）
        if (event.type === 'content_block_delta' && event.delta) {
          out.eventType = event.delta.type;
          out._sdkFormat = 'anthropic';
          if (event.delta.type === 'text_delta' && event.delta.text) {
            out.delta = event.delta.text;
            out.eventType = 'text_delta';
            eventStats.textDelta++;
            if (eventStats.textDelta <= 3) console.log(`[PiAgent] [Anthropic] text_delta: "${event.delta.text.substring(0, 50)}..."`);
          } else if (event.delta.type === 'input_json_delta' && event.delta.partial_json) {
            out.delta = event.delta.partial_json;
            out.eventType = 'toolcall_delta';
            console.log(`[PiAgent] [Anthropic] input_json_delta: ${event.delta.partial_json.length} chars`);
          }
        }

        // 兼容 message_delta 格式（OpenAI 风格）
        if (event.type === 'message_delta' && event.delta) {
          out._sdkFormat = 'openai';
          if (event.delta.type === 'text' && event.delta.text) {
            out.eventType = 'text_delta';
            out.delta = event.delta.text;
            eventStats.textDelta++;
            if (eventStats.textDelta <= 3) console.log(`[PiAgent] [OpenAI] text_delta: "${event.delta.text.substring(0, 50)}..."`);
          } else if (event.delta.type === 'tool_use' && event.delta.name) {
            out.eventType = 'toolcall_start';
            out.toolName = event.delta.name;
            eventStats.toolCallStart++;
            console.log(`[PiAgent] [OpenAI] tool_use: ${event.delta.name}`);
          }
        }

        // 兼容 tool_use 相关事件
        if (event.type === 'tool_use_start' || event.type === 'tool_use_end') {
          out._sdkFormat = 'anthropic_tool';
          out.toolName = event.name || event.toolName;
          if (event.type === 'tool_use_start') {
            out.eventType = 'toolcall_start';
            out.toolCallId = event.id;
            eventStats.toolCallStart++;
            console.log(`[PiAgent] [Alt] tool_use_start: ${out.toolName}`);
          }
        }

        // 工具执行事件
        if (event.type === 'tool_execution_start') {
          out.toolName = event.toolName;
          out.toolCallId = event.toolCallId;
          out.args = event.args;
          eventStats.toolExecutionStart++;
          console.log(`[PiAgent] tool_execution_start: ${event.toolName}`);
          if (event.args) {
            const argsStr = JSON.stringify(event.args);
            console.log(`[PiAgent]   args (${argsStr.length} chars): ${argsStr}`);
          }
        }
        if (event.type === 'tool_execution_update') {
          out.toolCallId = event.toolCallId;
          out.partialResult = event.partialResult;
        }
        if (event.type === 'tool_execution_end') {
          out.toolCallId = event.toolCallId;
          out.toolName = event.toolName;
          eventStats.toolExecutionEnd++;
          console.log(`[PiAgent] tool_execution_end: ${event.toolName}`);

          // 从 SDK 标准格式提取文本：result = { content: [{ type: "text", text: "..." }], details: {} }
          let resultText = '';
          const rawResult = event.result;
          if (rawResult && Array.isArray(rawResult.content)) {
            // 标准格式：提取 content 数组中的所有 text
            resultText = rawResult.content
              .filter(c => c.type === 'text' && c.text)
              .map(c => c.text)
              .join('\n');
          } else if (typeof rawResult === 'string') {
            resultText = rawResult;
          } else {
            resultText = JSON.stringify(rawResult);
          }

          // plan_3d_models 需要完整 JSON（包含 details 中的模型信息）
          if (event.toolName === 'plan_3d_models') {
            // 同时发送文本和完整的 details
            out.result = resultText;
            if (rawResult?.details) {
              out.resultDetails = JSON.stringify(rawResult.details);
            }
          } else {
            out.result = resultText.slice(0, 2000);
          }
          out.isError = event.isError;

          if (event.isError) {
            console.error(`[PiAgent] tool_execution_error: ${event.toolName}`);
            console.error(`[PiAgent]   error: ${event.result?.substring ? event.result.substring(0, 300) : JSON.stringify(event.result).substring(0, 300)}`);
          }
        }

        // Agent 完成
        if (event.type === 'agent_end') {
          out.messageCount = event.messages?.length;
          eventStats.agentEnd++;
          console.log(`[PiAgent] agent_end: ${event.messages?.length || 0} messages`);
        }

        // 附加原始事件的完整数据（供前端兼容不同 SDK 版本）
        // 只添加 PiAgent 服务没有处理到的原始字段
        const knownKeys = new Set(['type', 'eventType', 'delta', 'toolName', 'toolCallId', 'args', 'result', 'isError', 'messageCount', 'isThinking', 'partialResult', 'synthetic', '_raw', '_sdkFormat']);
        for (const key of Object.keys(event)) {
          if (!knownKeys.has(key) && event[key] !== undefined && event[key] !== null) {
            out[`_raw_${key}`] = event[key];
          }
        }

        res.write(`data: ${JSON.stringify(out)}\n\n`);
      } catch (writeErr) {
        console.error(`[PiAgent] ❌ SSE write error: ${writeErr.message}`);
      }
    });

    console.log(`[PiAgent] Calling session.prompt()...`);

    // 发送消息（带异常捕获）
    try {
      await session.prompt(finalMessage);
    } catch (promptErr) {
      console.error(`[PiAgent] session.prompt() threw: ${promptErr.message}`);
      console.error(`[PiAgent] Stack: ${promptErr.stack}`);
      // prompt 抛异常但未被上层 catch 捕获时（理论上不会发生，但保险起见）
    }

    // 检查是否在合理时间内收到了 agent_end 事件
    const timeSinceLastEvent = Date.now() - eventStats.lastEventTime;
    if (timeSinceLastEvent > 5000) {
      console.warn(`[PiAgent] WARN: No events for ${timeSinceLastEvent}ms after prompt completion`);
    }

    // 如果 SDK 未发送 agent_end 事件，手动补发（兼容 SDK 版本差异）
    if (eventStats.agentEnd === 0) {
      console.warn(`[PiAgent] WARN: No agent_end event from SDK, sending synthetic one`);
      res.write(`data: ${JSON.stringify({ type: 'agent_end', messageCount: 0, synthetic: true })}\n\n`);
      eventStats.agentEnd++;
    }

    // 检查是否有任何内容事件（零内容事件说明 SDK/模型出问题了）
    // 使用 totalRaw 而不是仅看内容事件类型，避免 SDK 格式变化导致误判
    const totalContentEvents = eventStats.textDelta + eventStats.thinkingDelta + eventStats.toolCallStart +
                               eventStats.toolExecutionStart + eventStats.toolExecutionEnd;

    if (totalContentEvents === 0 && eventStats.totalRaw === 0) {
      // 完全零事件：SDK 没有发出任何事件，session 确实损坏
      console.error(`[PiAgent] CRITICAL: No events at all from Agent! Session may be corrupted.`);
      console.error(`[PiAgent] Destroying session ${sessionId} and recreating...`);

      // 销毁损坏的 session
      agentSessions.delete(sessionId);
      try {
        // 重新创建 session 并重试
        console.log(`[PiAgent] Recreating session for retry...`);
        const newEntry = await getOrCreateSession(sessionId, { cwd: reqCwd });
        const newSession = newEntry.session;

        // 重新订阅事件（同样添加 raw event 日志和多格式兼容）
        newSession.subscribe((event) => {
          if (!streamAlive) return;
          try {
            responseStarted = true;
            eventStats.lastEventTime = Date.now();
            eventStats.totalRaw++;
            eventStats.rawTypes.add(event.type);

            if (eventStats.totalRaw <= 20) {
              console.log(`[PiAgent] [RETRY] RAW EVENT #${eventStats.totalRaw}: type=${event.type}`);
            }

            const out = { type: event.type, _raw: true };

            if (event.type === 'message_update' && event.assistantMessageEvent) {
              out.eventType = event.assistantMessageEvent.type;
              if (event.assistantMessageEvent.type === 'text_delta') {
                out.delta = event.assistantMessageEvent.delta;
                eventStats.textDelta++;
                console.log(`[PiAgent] [RETRY] text_delta: "${event.assistantMessageEvent.delta.substring(0, 50)}..."`);
              } else if (event.assistantMessageEvent.type === 'thinking_delta') {
                out.delta = event.assistantMessageEvent.delta;
                out.isThinking = true;
              } else if (event.assistantMessageEvent.type === 'toolcall_start') {
                out.toolCallId = event.assistantMessageEvent.toolCallId;
                out.toolName = event.assistantMessageEvent.toolName;
                eventStats.toolCallStart++;
                console.log(`[PiAgent] [RETRY] toolcall_start: ${event.assistantMessageEvent.toolName}`);
              } else if (event.assistantMessageEvent.type === 'toolcall_delta') {
                out.toolCallId = event.assistantMessageEvent.toolCallId;
                out.delta = event.assistantMessageEvent.delta;
              }
            }

            // 兼容其他 SDK 格式
            if (event.type === 'content_block_delta' && event.delta) {
              out.eventType = event.delta.type;
              out._sdkFormat = 'anthropic';
              if (event.delta.type === 'text_delta' && event.delta.text) {
                out.delta = event.delta.text;
                out.eventType = 'text_delta';
                eventStats.textDelta++;
              } else if (event.delta.type === 'input_json_delta' && event.delta.partial_json) {
                out.delta = event.delta.partial_json;
                out.eventType = 'toolcall_delta';
              }
            }

            if (event.type === 'message_delta' && event.delta) {
              out._sdkFormat = 'openai';
              if (event.delta.type === 'text' && event.delta.text) {
                out.eventType = 'text_delta';
                out.delta = event.delta.text;
                eventStats.textDelta++;
              } else if (event.delta.type === 'tool_use' && event.delta.name) {
                out.eventType = 'toolcall_start';
                out.toolName = event.delta.name;
                eventStats.toolCallStart++;
              }
            }

            if (event.type === 'tool_use_start' || event.type === 'tool_use_end') {
              out._sdkFormat = 'anthropic_tool';
              out.toolName = event.name || event.toolName;
              if (event.type === 'tool_use_start') {
                out.eventType = 'toolcall_start';
                out.toolCallId = event.id;
                eventStats.toolCallStart++;
              }
            }

            if (event.type === 'tool_execution_start') {
              out.toolName = event.toolName;
              out.toolCallId = event.toolCallId;
              out.args = event.args;
              eventStats.toolExecutionStart++;
              console.log(`[PiAgent] [RETRY] tool_execution_start: ${event.toolName}`);
              if (event.args) {
                const argsStr = JSON.stringify(event.args);
                console.log(`[PiAgent]   args (${argsStr.length} chars): ${argsStr}`);
              }
            }
            if (event.type === 'tool_execution_update') {
              out.toolCallId = event.toolCallId;
              out.partialResult = event.partialResult;
            }
            if (event.type === 'tool_execution_end') {
              out.toolCallId = event.toolCallId;
              out.toolName = event.toolName;
              eventStats.toolExecutionEnd++;
              // 从 SDK 标准格式提取文本
              let resultText = '';
              const rawResult = event.result;
              if (rawResult && Array.isArray(rawResult.content)) {
                resultText = rawResult.content.filter(c => c.type === 'text' && c.text).map(c => c.text).join('\n');
              } else if (typeof rawResult === 'string') {
                resultText = rawResult;
              } else {
                resultText = JSON.stringify(rawResult);
              }
              if (event.toolName === 'plan_3d_models') {
                out.result = resultText;
                if (rawResult?.details) out.resultDetails = JSON.stringify(rawResult.details);
              } else {
                out.result = resultText.slice(0, 2000);
              }
              out.isError = event.isError;
              console.log(`[PiAgent] [RETRY] tool_execution_end: ${event.toolName}`);
            }

            if (event.type === 'agent_end') {
              out.messageCount = event.messages?.length;
              eventStats.agentEnd++;
            }

            // 附加原始字段
            const knownKeys = new Set(['type', 'eventType', 'delta', 'toolName', 'toolCallId', 'args', 'result', 'isError', 'messageCount', 'isThinking', 'partialResult', 'synthetic', '_raw', '_sdkFormat']);
            for (const key of Object.keys(event)) {
              if (!knownKeys.has(key) && event[key] !== undefined && event[key] !== null) {
                out[`_raw_${key}`] = event[key];
              }
            }

            res.write(`data: ${JSON.stringify(out)}\n\n`);
          } catch (writeErr) {
            console.error(`[PiAgent] SSE write error on retry: ${writeErr.message}`);
          }
        });

        // 重试：新 session 需要带系统提示词
        let retryMessage = message;
        if (SYSTEM_PROMPT) {
          retryMessage = `${SYSTEM_PROMPT}\n\n---\n\n用户需求：${message}`;
        }
        console.log(`[PiAgent] Retrying prompt (with system prompt): "${message.substring(0, 100)}..."`);
        await newSession.prompt(retryMessage);

        // 补发 agent_end（如果仍然缺失）
        if (eventStats.agentEnd === 0) {
          res.write(`data: ${JSON.stringify({ type: 'agent_end', messageCount: 0, synthetic: true })}\n\n`);
        }

        const retryTotal = eventStats.textDelta + eventStats.toolCallStart + eventStats.toolExecutionStart;
        if (retryTotal === 0 && eventStats.totalRaw === 0) {
          console.error(`[PiAgent] Retry also failed with zero events. Sending error to frontend.`);
          res.write(`data: ${JSON.stringify({ type: 'error', error: 'Agent 无响应，请重试或开始新对话' })}\n\n`);
        } else if (retryTotal === 0 && eventStats.totalRaw > 0) {
          console.warn(`[PiAgent] Retry: SDK emitted ${eventStats.totalRaw} lifecycle events but 0 content events. SDK format may have changed.`);
          console.warn(`[PiAgent] Raw event types: [${[...eventStats.rawTypes].join(', ')}]`);
          res.write(`data: ${JSON.stringify({ type: 'error', error: 'Agent 返回了事件但无法解析内容，请查看 PiAgent 控制台日志' })}\n\n`);
        } else {
          console.log(`[PiAgent] Retry succeeded! Got ${eventStats.textDelta} text deltas, ${eventStats.toolExecutionStart} tool calls.`);
        }
      } catch (retryErr) {
        console.error(`[PiAgent] Retry failed: ${retryErr.message}`);
        res.write(`data: ${JSON.stringify({ type: 'error', error: `Agent 重试失败: ${retryErr.message}` })}\n\n`);
      }
    }

    // 发送完成信号
    streamAlive = false;
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();

    const duration = Date.now() - startTime;
    console.log(`[PiAgent] <<<< CHAT COMPLETE [${sessionId}] (${duration}ms)`);
    console.log(`[PiAgent] Event stats: totalRaw=${eventStats.totalRaw}, types=[${[...eventStats.rawTypes].join(', ')}], textDelta=${eventStats.textDelta}, toolCallStart=${eventStats.toolCallStart}, toolExecStart=${eventStats.toolExecutionStart}, toolExecEnd=${eventStats.toolExecutionEnd}, agentEnd=${eventStats.agentEnd}`);

  } catch (e) {
    const duration = Date.now() - startTime;
    console.error(`[PiAgent] <<<< CHAT ERROR [${sessionId}] (${duration}ms): ${e.message}`);
    console.error(`[PiAgent] Stack: ${e.stack}`);
    console.error(`[PiAgent] Response started: ${responseStarted}`);

    streamAlive = false;
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: e.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
      res.end();
    }
  } finally {
    // 清理超时检测
    if (global.agentChatTimeouts) {
      clearTimeout(global.agentChatTimeouts[sessionId]);
      delete global.agentChatTimeouts[sessionId];
    }
  }
});

// 中断 Agent（软转向 - 排队消息，等当前工具执行完后跳过剩余工具）
app.post('/api/steer', async (req, res) => {
  const { sessionId, message } = req.body;
  try {
    const entry = agentSessions.get(sessionId);
    if (entry) {
      entry.session.steer(message);
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, error: 'Session not found' });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 强制停止 Agent（立即中断 LLM 调用和工具执行）
app.post('/api/abort', async (req, res) => {
  const { sessionId } = req.body;
  try {
    const entry = agentSessions.get(sessionId);
    if (entry) {
      // 异步执行 abort，不阻塞响应
      entry.session.abort().then(() => {
        console.log(`[PiAgent] Agent aborted [${sessionId}]`);
      }).catch((e) => {
        console.error(`[PiAgent] Abort error [${sessionId}]: ${e.message}`);
      });
      res.json({ success: true });
    } else {
      res.status(404).json({ success: false, error: 'Session not found' });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 删除会话
app.delete('/api/session/:id', (req, res) => {
  agentSessions.delete(req.params.id);
  res.json({ success: true });
});

// 获取工具列表
app.get('/api/tools', (req, res) => {
  try {
    if (!sdkLoaded) {
      res.json({ tools: [] });
      return;
    }
    // 返回完整工具列表（内置 + 自定义 3D 工具）
    const cwd = join(__dirname, '..');
    const toolFuncs = [createCodingTools, createLsTool, createFindTool, createGrepTool];
    const builtinTools = [];
    for (const fn of toolFuncs) {
      if (!fn) continue;
      try {
        const tools = fn(cwd);
        if (Array.isArray(tools)) {
          builtinTools.push(...tools);
        } else {
          builtinTools.push(tools);
        }
      } catch (e) {
        console.warn(`[PiAgent] Failed to create tool list for ${fn?.name}:`, e.message);
      }
    }
    const builtinList = builtinTools.map(t => ({
      name: t.name || t.definition?.name || 'unknown',
      label: t.label || t.definition?.label || t.name || 'unknown',
      description: t.description || t.definition?.description || '',
    }));
    const customTools = scene3DTools.map(t => ({
      name: t.name,
      label: t.label,
      description: t.description,
    }));
    res.json({ tools: [...builtinList, ...customTools] });
  } catch (e) {
    console.error('[PiAgent] /api/tools error:', e.message);
    res.status(500).json({ tools: [], error: e.message });
  }
});

// ===== 启动 =====

async function start() {
  console.log('[PiAgent Service] Loading SDK...');
  await loadSDK();

  if (!sdkLoaded) {
    console.error('[PiAgent Service] SDK not loaded! Check PiAgent_Project path.');
  }

  // 启动服务器，支持自动寻找可用端口
  let currentPort = parseInt(PORT);
  const maxRetries = 5;
  let retryCount = 0;
  let server = null;

  const tryStartServer = (port) => {
    return new Promise((resolve, reject) => {
      const srv = app.listen(port, () => {
        console.log(`[PiAgent Service] Running on http://localhost:${port}`);
        console.log(`[PiAgent Service] Endpoints:`);
        console.log(`  GET  /health          - Health check`);
        console.log(`  POST /api/session     - Create session`);
        console.log(`  POST /api/chat        - Chat (SSE stream)`);
        console.log(`  POST /api/steer       - Interrupt agent`);
        console.log(`  GET  /api/tools       - List tools`);
        console.log(`  DELETE /api/session/:id - Delete session`);
        console.log(`  POST /api/unity/console-errors - Check Unity Console (via backend)`);
        resolve(srv);
      });

      srv.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[PiAgent Service] Port ${port} already in use, trying next port...`);
          srv.close();
          resolve(null);
        } else {
          reject(err);
        }
      });
    });
  };

  // 尝试启动服务器（只尝试配置的端口，不自动切换）
  server = await tryStartServer(currentPort);

  if (!server) {
    console.error(`[PiAgent Service] Port ${currentPort} is already in use!`);
    console.error(`[PiAgent Service] Please kill the process using port ${currentPort} or change PORT environment variable.`);
    console.error(`[PiAgent Service] You can check which process is using this port with: netstat -ano | findstr :${currentPort}`);
    process.exit(1);
  }

  // 保存实际使用的端口到文件，供后端读取
  const portFile = join(__dirname, '.agent-port');
  writeFileSync(portFile, String(currentPort), 'utf-8');
  console.log(`[PiAgent Service] Port saved to ${portFile}`);

  process.on('SIGINT', async () => {
    console.log('[PiAgent Service] Shutting down...');
    await shutdownMCP();
    logStream.end();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('[PiAgent Service] Shutting down...');
    await shutdownMCP();
    logStream.end();
    process.exit(0);
  });
}

start();
