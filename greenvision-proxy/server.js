require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');

const app = express();

const PORT = process.env.PORT || 3001;
const API_KEY = process.env.API_KEY;
const API_URL = process.env.API_URL || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const CLIENT_KEY = process.env.CLIENT_KEY || '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:8080')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (origin === 'null') return true;
  try {
    const { hostname } = new URL(origin);
    if (['localhost', '127.0.0.1', '::1'].includes(hostname)) return true;
  } catch (error) {
    return false;
  }
  return ALLOWED_ORIGINS.some(allowed => {
    if (allowed === '*') return true;
    if (allowed === origin) return true;
    if (allowed.startsWith('*.')) {
      return origin.endsWith(allowed.slice(1));
    }
    return false;
  });
}

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked origin: ${origin}`));
  },
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key']
}));

app.use(express.json({ limit: '1mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || 50),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试。' },
  skip: req => req.path === '/health'
});

function authenticate(req, res, next) {
  if (!CLIENT_KEY) {
    next();
    return;
  }

  const clientKey = req.headers['x-api-key'];
  if (clientKey !== CLIENT_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

const systemPrompt = `你是“小绿”，GreenVision 的专属智能助手，不是通用聊天机器人。你的任务是陪用户使用 GreenVision 网站，解释城市绿化、图片识别、绿视率、碳汇估算、图纸绿化建议、论坛使用、报告数据和项目答辩问题。

你的性格：
- 友好、自然、像正在陪用户看页面和报告，不要像说明书或客服模板。
- 说话要具体，能引用当前报告数据时就引用数据。
- 面向普通用户时少用术语；面向答辩/比赛问题时可以更专业，但仍要清楚。
- 不要自称“大模型”“AI语言模型”，直接以“小绿”的身份回答。
- 比赛答辩、路演、评委提问场景不要用“嗨、哈喽”等闲聊开头，直接给用户可照着说的表达。

回答规则：
1. 先理解用户真实意图，再回答。用户说“绿不绿、树多不多、绿色多不多”，通常是在问绿视率或可视绿量。
2. 用户说“能吸多少二氧化碳、低碳、环保价值”，通常是在问碳汇或生态效益。
3. 用户说“哪里种树、怎么改、太晒怎么办”，通常是在问绿化优化建议。
4. 回答时先用通俗表达，再补充专业术语。不要一开始堆术语。
5. 碳汇结果只能作为辅助估算，不等同于官方碳核算报告。严格核算需要树种、胸径、树高、年龄、土壤、气候和养护条件等数据。
6. 不要编造政策、论文或精确数值。如果没有依据，说明需要补充资料或专业核算。
7. 如果前端提供了“参考知识块”或“用户意图”，优先基于这些上下文回答；不要偏离上下文自由发挥。
8. 区分三类内容：确定事实、估算判断、操作建议。确定事实可以直接说；估算判断要说明前提；操作建议要给可执行步骤。
9. 用户没有上传图片、地点或参数时，不要假装已经分析了具体对象。可以说明“如果你上传图片，我可以进一步判断”。
10. 回答尽量精准短小：一般 2 到 4 段即可；除非用户要求详细方案，不要写长篇。
11. 如果上下文包含最近一次报告，不要机械复述所有字段。先给一句总体判断，再挑用户最关心的 2 到 4 个指标解释含义，最后给一句自然的改进建议。
12. 用户问“分析一下数据、这个报告怎么看、什么意思”时，要像正在陪用户看报告一样回答，语气自然，不要像导出表格。
13. 如果“报告摘要”里已经写出了生态评级、绿化密度建议、维护建议、推荐物种等字段，必须视为已提供，不要说“报告没有提供”。可以直接引用并解释。
14. 如果用户问“这个数据准吗、能不能当正式报告”，要明确：这是快速辅助估算，适合科普、课堂、比赛展示、方案比较；正式碳核算需要专业复核。
15. 如果用户问“怎么优化、怎么改善”，优先给 2 到 4 条可执行建议，如补植乔木/灌木、提高覆盖、改善维护、补充现场参数。
16. 如果用户问网站使用问题，要结合 GreenVision 页面：核心测算、图纸绿化建议、环保论坛、使用教程、科学依据、小绿助手。
17. 如果用户问答辩问题，要帮他组织成“项目定位-技术路线-数据边界-应用价值”的表达，而不是只给零散知识。
18. 答辩类回答优先给“可以这样说：”后的完整话术，再补充 1 到 3 个要点。话术要像学生/项目负责人在现场自然表达。

GreenVision 项目知识：
- GreenVision 是一个面向普通群众、学校、社区和城市绿化场景的智能视觉工具。
- 它可以识别图片中的树木、草地、灌木等绿色植物区域，估算绿化程度和低碳价值，并给出绿化改善建议。
- 绿视率 GVI 的核心思想是：绿色植被像素数 / 图像总像素数。它代表人眼视角下能看到多少绿色。
- 语义分割可以把图像中的树木、草地、道路、建筑、天空等区域区分开，比单纯看颜色更稳健。
- DeepLabv3 / DeepLabv3+ 是常用于语义分割的模型思路，可用于解释项目的技术路线。
- i-Tree 是城市树木生态效益评估工具，可作为碳储存、碳汇、空气质量、雨洪等生态效益表达的参考。
- 城市园林绿化具有生态环保、休闲游憩、景观营造、防灾避险和改善人居环境等价值。

GreenVision 网站功能理解：
- 核心测算：用户上传生态照片，前端在浏览器中进行植被区域识别，估算绿色覆盖、覆盖面积、碳吸收、生态评级和维护建议。
- 图纸绿化建议：用户上传工程图纸，选择城市、土壤、比例尺和优化目标，系统结合 OpenCV 图纸识别和环境参数生成绿化建议。
- 环保论坛：用户可以发布环保观察、社区绿化建议、图片动态和评论；多人共享依赖 Supabase。
- 科学依据：解释 GVI、语义分割、碳汇估算、图纸规划依据、政策和标准化趋势。
- 报告解释：你能读取前端传来的最近一次核心测算报告或图纸建议报告，帮助用户理解指标、风险、建议和可展示表达。

常见指标解释口径：
- 绿色覆盖率：图片中被识别为植被的比例，接近“人眼视角下看见多少绿色”的概念。
- 覆盖面积：根据识别比例映射出来的估算面积，适合初步比较，不等于精确测绘。
- 年碳吸收：系统根据识别面积、植被类型和内置生态参数换算出的年度 CO₂ 吸收潜力。
- 5 年/10 年累计：把年度吸收按时间累计，帮助用户理解长期生态价值，但默认没有考虑后续生长变化、死亡率和养护差异。
- 生态评级：对当前识别结果的快速分级，适合展示和横向比较，不是官方评级。
- 分割置信度/识别像素：反映这次识别的技术过程，受光照、遮挡、季节、照片清晰度影响。

回答风格示例：
- 用户问“给我分析一下数据”：先说“整体看……”，再解释覆盖率、碳吸收、评级，最后给改善建议。
- 用户问“为什么结果不一样”：解释模型推理、图片缩放、光照、遮挡、边界判断会带来波动，并建议固定图片质量和参数。
- 用户问“怎么答辩”：用简洁项目话术回答，强调低门槛、可视化、辅助估算、隐私友好和公众参与价值。
- 用户问“创新点怎么说”：给一段可直接背的话，围绕“低门槛绿视率工具、图像识别数据化、碳汇报告与建议闭环”展开。

请用简洁、友好、可靠的中文回答。`;

function buildUserMessage(message, context) {
  if (!context || (!context.knowledge && !context.intent && !context.latestReport)) {
    return message;
  }

  const parts = [`用户原问题：${message}`];

  if (context.latestReport) {
    const report = context.latestReport;
    const readableSummary = buildReadableReportSummary(report);
    const requiredFacts = buildRequiredReportFacts(report);
    parts.push(`前端提供的最近一次报告上下文：
报告类型：${report.title || report.type || '未知报告'}
生成时间：${report.generatedAtText || report.generatedAt || '未知'}
是否命中本次问题：${report.matchedCurrentQuestion ? '是' : '否'}
必须视为已经提供、回答时可以直接引用的字段：
${requiredFacts}

报告摘要：
${readableSummary}

报告结构化数据：
${JSON.stringify(report, null, 2)}`);

    if (report.localExplanation) {
      parts.push(`前端基于报告生成的本地解释参考（只能作为数据核对，不要照抄；请用更自然的方式回答）：
${report.localExplanation}`);
    }
  }

  if (context.knowledge?.reference) {
    parts.push(`前端检索到的参考知识块：\n${context.knowledge.reference}`);
    if (Array.isArray(context.knowledge.matchedKeywords) && context.knowledge.matchedKeywords.length) {
      parts.push(`命中关键词：${context.knowledge.matchedKeywords.join('、')}`);
    }
  }

  if (context.intent?.guidance) {
    parts.push(`前端判断的用户通俗意图：\n${context.intent.guidance}`);
    if (Array.isArray(context.intent.matchedKeywords) && context.intent.matchedKeywords.length) {
      parts.push(`意图关键词：${context.intent.matchedKeywords.join('、')}`);
    }
  }

  parts.push('请基于以上上下文精准回答用户问题；如果上下文不足，请说明缺少什么信息，不要编造。');
  return parts.join('\n\n');
}

function buildReadableReportSummary(report) {
  if (!report) return '暂无报告数据。';

  if (report.type === 'core-image-analysis') {
    const items = Array.isArray(report.items) ? report.items : [];
    if (!items.length) return '核心测算报告没有成功识别的数据项。';

    return items.map((item, index) => {
      return [
        `- 第 ${index + 1} 张图片：${item.fileName || '未命名图片'}`,
        `  - 识别类型：${item.vegetationType || '未知'}`,
        `  - 绿色覆盖率：${item.greenRatioPercent ?? '未知'}%`,
        `  - 覆盖面积：${item.coverageAreaSquareMeters ?? '未知'} m²`,
        `  - 年碳吸收：${item.annualCarbonKgCO2 ?? '未知'} kg CO₂/年`,
        `  - 5 年累计：${item.fiveYearCarbonKgCO2 ?? '未知'} kg CO₂`,
        `  - 10 年累计：${item.tenYearCarbonKgCO2 ?? '未知'} kg CO₂`,
        `  - 生态评级：${item.ecoGrade || '未知'}`,
        `  - 绿化密度建议：${item.densityAdvice || '暂无'}`,
        `  - 维护建议：${item.maintenanceAdvice || '暂无'}`
      ].join('\n');
    }).join('\n\n');
  }

  if (report.type === 'blueprint-greening-advice') {
    const analysis = report.blueprintAnalysis || {};
    const plan = report.plan || {};
    return [
      `城市：${report.selectedCity || '未知'}`,
      `土壤：${report.soil || '未知'}`,
      `优化目标：${report.optimizationGoal || '未知'}`,
      `检测绿地面积：${analysis.detectedGreenAreaSquareMeters ?? '未识别'} m²`,
      `预计可种植树木：${analysis.estimatedTreeCount ?? '未估算'} 棵`,
      `预计总碳吸收：${analysis.estimatedTotalCarbonKgCO2PerYear ?? '未估算'} kg CO₂/年`,
      `推荐物种：${plan.recommendedPlants || '暂无'}`,
      `单棵碳吸收：${plan.carbonAbsorptionPerTreeKgCO2PerYear || '未知'} kg CO₂/棵/年`,
      `种植密度建议：${plan.plantingDensity || '暂无'}`,
      `布局建议：${plan.layoutSuggestion || '暂无'}`,
      `维护成本：${plan.maintenanceCost || '暂无'}`,
      `需水量：${plan.waterRequirement || '暂无'}`
    ].join('；');
  }

  return JSON.stringify(report);
}

function buildRequiredReportFacts(report) {
  if (!report) return '暂无。';

  if (report.type === 'core-image-analysis') {
    const items = Array.isArray(report.items) ? report.items : [];
    if (!items.length) return '暂无成功识别的数据项。';
    return items.map((item, index) => {
      return [
        `第 ${index + 1} 张图片文件名=${item.fileName || '未知'}`,
        `植被类型=${item.vegetationType || '未知'}`,
        `绿色覆盖率=${item.greenRatioPercent ?? '未知'}%`,
        `覆盖面积=${item.coverageAreaSquareMeters ?? '未知'} m²`,
        `年碳吸收=${item.annualCarbonKgCO2 ?? '未知'} kg CO₂/年`,
        `生态评级=${item.ecoGrade || '未知'}`,
        `绿化密度建议=${item.densityAdvice || '暂无'}`,
        `维护建议=${item.maintenanceAdvice || '暂无'}`
      ].join('；');
    }).join('\n');
  }

  if (report.type === 'blueprint-greening-advice') {
    const analysis = report.blueprintAnalysis || {};
    const plan = report.plan || {};
    return [
      `城市=${report.selectedCity || '未知'}`,
      `土壤=${report.soil || '未知'}`,
      `优化目标=${report.optimizationGoal || '未知'}`,
      `检测绿地面积=${analysis.detectedGreenAreaSquareMeters ?? '未识别'} m²`,
      `推荐物种=${plan.recommendedPlants || '暂无'}`,
      `单棵碳吸收=${plan.carbonAbsorptionPerTreeKgCO2PerYear || '未知'} kg CO₂/棵/年`,
      `种植密度建议=${plan.plantingDensity || '暂无'}`,
      `布局建议=${plan.layoutSuggestion || '暂无'}`,
      `维护成本=${plan.maintenanceCost || '暂无'}`,
      `需水量=${plan.waterRequirement || '暂无'}`
    ].join('；');
  }

  return JSON.stringify(report);
}

function shouldUseGuardedReportAnswer(content, report) {
  if (!report || !content) return false;
  const saysMissing = /没有具体信息|未提供具体信息|报告中没有提供|报告中也未提供|暂无具体信息/.test(content);
  if (!saysMissing) return false;

  if (report.type === 'core-image-analysis') {
    const item = Array.isArray(report.items) ? report.items[0] : null;
    return Boolean(item?.ecoGrade || item?.maintenanceAdvice || item?.densityAdvice);
  }

  if (report.type === 'blueprint-greening-advice') {
    return Boolean(report.plan?.recommendedPlants || report.plan?.layoutSuggestion || report.plan?.maintenanceCost);
  }

  return false;
}

function buildGuardedReportAnswer(report) {
  if (report?.type === 'core-image-analysis') {
    const item = Array.isArray(report.items) ? report.items[0] : null;
    if (!item) return '我能看到最近一次核心测算报告，但里面没有成功识别的数据项。';

    return [
      `这份报告整体看，图片里的绿量不算特别高，但已经有一定生态贡献。系统识别到的主要类型是${item.vegetationType || '植被'}，绿色覆盖率约 ${item.greenRatioPercent ?? '未知'}%，对应覆盖面积约 ${item.coverageAreaSquareMeters ?? '未知'} m²。`,
      `碳汇数据可以这样理解：它每年大约吸收 ${item.annualCarbonKgCO2 ?? '未知'} kg CO₂，5 年累计约 ${item.fiveYearCarbonKgCO2 ?? '未知'} kg，10 年累计约 ${item.tenYearCarbonKgCO2 ?? '未知'} kg。这不是正式碳核算，但很适合做快速比较和展示说明。`,
      `生态评级是“${item.ecoGrade || '未知'}”。从建议看，系统希望把绿化密度提升到更理想的水平：${item.densityAdvice || '暂无密度建议'}。维护上可以按报告建议做：${item.maintenanceAdvice || '暂无维护建议'}。`,
      '简单说：这张图有可观的绿色基础，但还有提升空间；如果是项目展示，可以重点讲“当前已有碳吸收贡献，同时通过补植和维护还能继续提高绿色覆盖”。'
    ].join('\n\n');
  }

  if (report?.type === 'blueprint-greening-advice') {
    const analysis = report.blueprintAnalysis || {};
    const plan = report.plan || {};
    return [
      `这份图纸建议报告的重点是：根据${report.selectedCity || '当前城市'}、${report.soil || '当前土壤'}和“${report.optimizationGoal || '当前目标'}”来生成绿化方案。`,
      analysis.detectedGreenAreaSquareMeters
        ? `图纸里检测到的绿地面积约 ${analysis.detectedGreenAreaSquareMeters} m²，预计可种植约 ${analysis.estimatedTreeCount ?? '若干'} 棵树，总碳吸收约 ${analysis.estimatedTotalCarbonKgCO2PerYear ?? '待估算'} kg CO₂/年。`
        : '这次图纸没有得到稳定的绿地面积识别，所以建议主要依据城市、土壤和优化目标生成。',
      `推荐物种是：${plan.recommendedPlants || '暂无'}。布局上建议：${plan.layoutSuggestion || '暂无'}；种植密度建议：${plan.plantingDensity || '暂无'}。`,
      `维护和用水方面，报告给出的判断是：${plan.maintenanceCost || '暂无维护成本'}；${plan.waterRequirement || '暂无需水量建议'}。`
    ].join('\n\n');
  }

  return '我能看到最近一次报告，但暂时无法稳定解析其中的数据。你可以问我某一个具体指标，比如覆盖率、年碳吸收、生态评级或维护建议。';
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'greenvision-proxy',
    allowedOrigins: ALLOWED_ORIGINS
  });
});

app.post('/api/chat', authenticate, limiter, async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    const context = req.body?.context || null;
    if (!message) {
      res.status(400).json({ error: 'message is required.' });
      return;
    }

    if (!API_KEY) {
      const reportHint = context?.latestReport
        ? `\n\n我也收到了前端传来的最近一次报告上下文：${context.latestReport.title || context.latestReport.type || '报告'}。等你配置模型 API_KEY 后，我就可以基于这份报告做更深入解释。`
        : '';
      res.json({
        choices: [
          {
            message: {
              content: `本地后端已经连接成功。\n\n不过当前后端还没有配置模型 API_KEY，所以我现在不能调用真正的大模型。请在 greenvision-proxy/.env 里填写 API_KEY，然后重启本地后端。${reportHint}`
            }
          }
        ]
      });
      return;
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.MODEL || 'glm-4-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: buildUserMessage(message, context) }
        ],
        temperature: 0.25,
        max_tokens: 700
      })
    });

    const data = await response.json();
    if (!response.ok) {
      res.status(response.status).json(data);
      return;
    }

    const responseContent = data?.choices?.[0]?.message?.content;
    if (shouldUseGuardedReportAnswer(responseContent, context?.latestReport)) {
      data.choices[0].message.content = buildGuardedReportAnswer(context.latestReport);
    }

    res.json(data);
  } catch (error) {
    console.error('GreenVision proxy error:', error);
    res.status(500).json({ error: '服务器暂时无法回答，请稍后再试。' });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`GreenVision proxy listening on port ${PORT}`);
    console.log(`Health check: /health`);
  });
}

module.exports = app;
