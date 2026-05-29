"use client";

import { useState } from "react";

type AuthMode = "login" | "signup";
type PreviewMode = "plan" | "actual" | "review" | "notes";
type ScenarioMode = "maker" | "manager" | "personal";

const capabilityCards = [
  {
    label: "01",
    title: "三层计划",
    body: "今日、本周、长期项目分开记录。不是把所有事堆进同一个清单，而是让不同时间尺度各归其位。"
  },
  {
    label: "02",
    title: "实际时间线",
    body: "用时间段记录真正发生的推进。计划外事项不会丢失，复盘时也能看见一天为什么偏航。"
  },
  {
    label: "03",
    title: "自动实际汇总",
    body: "从进展记录聚合出「今日实际」，减少手动整理，让你看到真实投入到了哪些项目。"
  },
  {
    label: "04",
    title: "项目笔记",
    body: "笔记可以关联计划项，也可以自由记录。当想法回到项目上下文里，复盘就不再散。"
  },
  {
    label: "05",
    title: "标签复盘",
    body: "按工作、生活、个人成长等标签聚合一周实际，快速看见不同方向的投入和产出。"
  },
  {
    label: "06",
    title: "导入导出",
    body: "Beta 阶段保留迁移和备份通道，账号数据可以导出，也可以导入回到工作区。"
  }
];

const previewTabs: Array<{
  id: PreviewMode;
  title: string;
  summary: string;
  panelTitle: string;
  rows: Array<{ meta: string; title: string; detail: string }>;
}> = [
  {
    id: "plan",
    title: "日计划",
    summary: "把今天、本周和长期方向放在同一屏，但保留层次。",
    panelTitle: "2026.05.27 / 今日计划",
    rows: [
      { meta: "今日", title: "整理用户反馈里的高频阻塞点", detail: "#工作 先归类，不急着下结论" },
      { meta: "本周", title: "Dayfold PR 首页改版", detail: "#产品 #发布 让新用户更快理解价值" },
      { meta: "长期", title: "稳定输出个人知识系统", detail: "#个人成长 每周至少沉淀一次" }
    ]
  },
  {
    id: "actual",
    title: "真实进展",
    summary: "用时间线记录实际发生，而不是只给任务打勾。",
    panelTitle: "今日进展",
    rows: [
      { meta: "09:30-10:20", title: "梳理反馈", detail: "发现新用户不理解「实际」和「计划」的区别" },
      { meta: "11:00-12:10", title: "改 PR 首页", detail: "补充可切换产品预览和使用场景" },
      { meta: "15:30-16:00", title: "临时沟通", detail: "确认 Beta 用户导出备份提示要更显眼" }
    ]
  },
  {
    id: "review",
    title: "周复盘",
    summary: "一周结束时，按日期和标签看到真实证据。",
    panelTitle: "本周实际 / 按标签",
    rows: [
      { meta: "#工作", title: "Dayfold 可用性优化", detail: "3 天有推进，主要集中在新手理解和数据安全提示" },
      { meta: "#产品", title: "发布页信息架构", detail: "从单页介绍升级为可探索的产品主页" },
      { meta: "#个人成长", title: "复盘方法", detail: "计划偏差被记录下来，而不是被焦虑吞掉" }
    ]
  },
  {
    id: "notes",
    title: "项目笔记",
    summary: "事实和判断分开，想法能贴回项目。",
    panelTitle: "今日笔记",
    rows: [
      { meta: "Dayfold PR 首页", title: "新用户需要先理解产品不是 todo", detail: "首屏文案要强调计划、实际、复盘的差异。" },
      { meta: "用户反馈", title: "导出入口要保留安全感", detail: "Beta 阶段越透明，越容易建立信任。" },
      { meta: "自由笔记", title: "今天的节奏被临时沟通打断", detail: "不是失败，是实际发生的工作成本。" }
    ]
  }
];

const scenarios: Record<ScenarioMode, { title: string; body: string; examples: string[] }> = {
  maker: {
    title: "创作者 / 独立开发者",
    body: "适合每天同时处理开发、内容、运营和杂事的人。Dayfold 帮你分清楚哪些是真推进，哪些只是忙。",
    examples: ["今天实际推进了哪个作品？", "长期项目有没有连续被看见？", "临时事项挤掉了哪段深度工作？"]
  },
  manager: {
    title: "产品 / 管理者",
    body: "适合需要在会议、反馈、推进和复盘之间切换的人。周复盘能把零散记录聚成项目证据。",
    examples: ["本周哪些反馈真正进入了行动？", "团队沟通消耗了多少时间？", "哪些计划一直没有转化成实际？"]
  },
  personal: {
    title: "个人成长",
    body: "适合想持续学习、运动、写作或改善生活节奏的人。长期项目每天可见，但不会压成焦虑清单。",
    examples: ["这一周个人成长真实发生了什么？", "计划和实际差在哪里？", "哪些笔记值得带到下周？"]
  }
};

const faqItems = [
  {
    question: "Dayfold 和待办清单有什么区别？",
    answer: "待办清单通常关心完成与否。Dayfold 还记录实际推进和复盘证据，因此更适合追踪复杂工作、长期项目和真实节奏。"
  },
  {
    question: "计划没有完成会不会很有压力？",
    answer: "Dayfold 的默认态度是记录差异，而不是审判自己。没完成的计划会和实际发生一起呈现，帮助你理解原因。"
  },
  {
    question: "Beta 阶段数据安全吗？",
    answer: "当前版本已有个人账号绑定、导入导出和回收站。重要内容建议定期导出备份，页面和应用内也保留相关提示。"
  }
];

function getPasswordStrength(password: string) {
  const checks = [
    password.length >= 8,
    /[A-Za-z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password)
  ];
  const score = checks.filter(Boolean).length;

  if (!password) {
    return {
      score: 0,
      label: "至少 8 位，建议包含字母和数字。"
    };
  }

  if (score <= 2) {
    return {
      score,
      label: "偏弱，建议加入数字或符号。"
    };
  }

  if (score === 3) {
    return {
      score,
      label: "可用，继续加强会更安全。"
    };
  }

  return {
    score,
    label: "强度不错。"
  };
}

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>("signup");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("plan");
  const [scenarioMode, setScenarioMode] = useState<ScenarioMode>("maker");
  const [openFaq, setOpenFaq] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordStrength = getPasswordStrength(password);
  const activePreview = previewTabs.find((tab) => tab.id === previewMode) ?? previewTabs[0];
  const activeScenario = scenarios[scenarioMode];

  function jumpToAccess(nextMode: AuthMode) {
    setMode(nextMode);
    document.getElementById("join-dayfold")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleSubmit() {
    if (mode === "signup" && password.length < 8) {
      setError("注册密码至少需要 8 位。");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode,
          email,
          name,
          password
        })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "登录失败。" }));
        throw new Error(body.error ?? "登录失败。");
      }

      window.location.reload();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "登录失败。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="pr-shell">
      <nav className="pr-nav" aria-label="Dayfold 导航">
        <a className="pr-brand" href="#top" aria-label="Dayfold 首页">
          Dayfold
        </a>
        <div className="pr-nav-actions">
          <a href="#capabilities">能力</a>
          <a href="#preview">预览</a>
          <a href="#scenarios">场景</a>
          <a href="#join-dayfold">加入 Beta</a>
          <button className="button button-secondary button-small" type="button" onClick={() => jumpToAccess("login")}>
            登录
          </button>
        </div>
      </nav>

      <section className="pr-hero" id="top" aria-labelledby="pr-title">
        <div className="pr-hero-shade" />
        <div className="pr-hero-content">
          <p className="section-kicker">Dayfold / Product Release</p>
          <h1 id="pr-title">把一天折叠成可复盘的真实轨迹</h1>
          <p className="pr-hero-copy">
            Dayfold 是一个面向长期主义工作的日计划与复盘产品。它把「计划要做什么」「实际推进了什么」「最后沉淀了什么」拆开记录，让每一天都能被看见、被校准、被带到下一周。
          </p>
          <div className="pr-hero-actions">
            <button className="button button-primary" type="button" onClick={() => jumpToAccess("signup")}>
              加入 Beta
            </button>
            <a className="button button-secondary" href="#preview">
              看产品预览
            </a>
          </div>
          <div className="pr-hero-meta" aria-label="Dayfold 当前能力">
            <span>本地优先体验</span>
            <span>日 / 周复盘</span>
            <span>导入导出</span>
          </div>
        </div>
      </section>

      <section className="pr-proof-strip" aria-label="Dayfold 产品重点">
        <div>
          <strong>Day Plan</strong>
          <span>先写今天的意图，而不是堆一张压力清单。</span>
        </div>
        <div>
          <strong>Actual Timeline</strong>
          <span>按时间线记录真实推进，临时发生的事也有位置。</span>
        </div>
        <div>
          <strong>Weekly Review</strong>
          <span>自动聚合一周实际和笔记，让复盘从证据开始。</span>
        </div>
      </section>

      <section className="pr-section pr-story" id="story">
        <div className="pr-section-copy">
          <p className="section-kicker">The Problem</p>
          <h2>普通待办回答不了「这一天到底怎样过去」</h2>
          <p>
            很多工具把注意力放在完成勾选上。Dayfold 更关心计划和现实之间的差异：哪些事情真的推进了，哪些计划只是停在纸面上，哪些临时事件改变了一天的节奏。
          </p>
        </div>
        <div className="pr-feature-grid">
          <article className="pr-feature-card">
            <span>01</span>
            <h3>计划不等于结论</h3>
            <p>今日计划、本周计划、长期项目分开摆放，保留意图，也给变化留下余地。</p>
          </article>
          <article className="pr-feature-card">
            <span>02</span>
            <h3>进展有上下文</h3>
            <p>时间、项目、说明被放在同一条记录里，复盘时看到的是发生过程。</p>
          </article>
          <article className="pr-feature-card">
            <span>03</span>
            <h3>笔记回到项目</h3>
            <p>思考可以关联到具体项目，也可以作为当天的自由复盘沉淀下来。</p>
          </article>
        </div>
      </section>

      <section className="pr-showcase pr-capabilities" id="capabilities" aria-label="Dayfold 核心能力">
        <div className="pr-workflow-copy">
          <p className="section-kicker">Core Capabilities</p>
          <h2>不只是记录任务，而是记录一天如何真实展开</h2>
        </div>
        <div className="pr-capability-grid">
          {capabilityCards.map((card) => (
            <article className="pr-capability-card" key={card.title}>
              <span>{card.label}</span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="pr-showcase pr-preview-section" id="preview" aria-label="Dayfold 产品预览">
        <div className="pr-workflow-copy">
          <p className="section-kicker">Product Preview</p>
          <h2>切换看看：Dayfold 如何把计划、实际和复盘连起来</h2>
        </div>
        <div className="pr-preview-layout">
          <div className="pr-preview-tabs" role="tablist" aria-label="产品预览">
            {previewTabs.map((tab) => (
              <button
                className={`pr-preview-tab${previewMode === tab.id ? " active" : ""}`}
                type="button"
                role="tab"
                aria-selected={previewMode === tab.id}
                key={tab.id}
                onClick={() => setPreviewMode(tab.id)}
              >
                <strong>{tab.title}</strong>
                <span>{tab.summary}</span>
              </button>
            ))}
          </div>
          <div className="pr-preview-panel" role="tabpanel">
            <div className="pr-preview-panel-head">
              <p className="section-kicker">Live Mock</p>
              <strong>{activePreview.panelTitle}</strong>
            </div>
            <div className="pr-preview-list">
              {activePreview.rows.map((row) => (
                <div className="pr-preview-row" key={`${activePreview.id}-${row.meta}-${row.title}`}>
                  <span>{row.meta}</span>
                  <div>
                    <strong>{row.title}</strong>
                    <p>{row.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="pr-showcase pr-scenarios" id="scenarios" aria-label="Dayfold 使用场景">
        <div className="pr-workflow-copy">
          <p className="section-kicker">Use Cases</p>
          <h2>不是给一种人用，而是给需要复盘真实投入的人用</h2>
        </div>
        <div className="pr-scenario-layout">
          <div className="pr-scenario-switcher" role="tablist" aria-label="使用场景">
            {Object.entries(scenarios).map(([id, scenario]) => (
              <button
                className={`pr-scenario-button${scenarioMode === id ? " active" : ""}`}
                type="button"
                key={id}
                onClick={() => setScenarioMode(id as ScenarioMode)}
              >
                {scenario.title}
              </button>
            ))}
          </div>
          <article className="pr-scenario-card">
            <h3>{activeScenario.title}</h3>
            <p>{activeScenario.body}</p>
            <div className="pr-scenario-examples">
              {activeScenario.examples.map((example) => (
                <span key={example}>{example}</span>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="pr-showcase" aria-label="Dayfold 工作流">
        <div className="pr-workflow-copy">
          <p className="section-kicker">How It Works</p>
          <h2>三层记录，合成一周的清晰回放</h2>
        </div>
        <div className="pr-workflow">
          <div className="pr-workflow-step">
            <strong>计划</strong>
            <span>写下今天、本周和长期方向。</span>
          </div>
          <div className="pr-workflow-line" />
          <div className="pr-workflow-step">
            <strong>实际</strong>
            <span>记录真实发生的时间线。</span>
          </div>
          <div className="pr-workflow-line" />
          <div className="pr-workflow-step">
            <strong>复盘</strong>
            <span>按日期和标签汇总一周证据。</span>
          </div>
        </div>
      </section>

      <section className="pr-showcase pr-onboarding" aria-label="Dayfold 上手步骤">
        <div className="pr-workflow-copy">
          <p className="section-kicker">Start In 3 Steps</p>
          <h2>从今天开始，不需要迁移整个人生系统</h2>
        </div>
        <div className="pr-step-grid">
          <article>
            <span>1</span>
            <h3>写下今天的意图</h3>
            <p>只写真正想推进的事，保留本周和长期方向作为背景。</p>
          </article>
          <article>
            <span>2</span>
            <h3>用时间线记实际</h3>
            <p>每完成一段工作，补一条真实进展。临时事项也算数。</p>
          </article>
          <article>
            <span>3</span>
            <h3>周末看证据</h3>
            <p>按日期和标签回看这一周，把下一周建立在事实上。</p>
          </article>
        </div>
      </section>

      <section className="pr-showcase pr-faq" aria-label="常见问题">
        <div className="pr-workflow-copy">
          <p className="section-kicker">FAQ</p>
          <h2>几个开始前最常见的问题</h2>
        </div>
        <div className="pr-faq-list">
          {faqItems.map((item, index) => (
            <button
              className={`pr-faq-item${openFaq === index ? " active" : ""}`}
              type="button"
              key={item.question}
              aria-expanded={openFaq === index}
              onClick={() => setOpenFaq(openFaq === index ? -1 : index)}
            >
              <span>{item.question}</span>
              <strong>{openFaq === index ? "−" : "+"}</strong>
              {openFaq === index ? <p>{item.answer}</p> : null}
            </button>
          ))}
        </div>
      </section>

      <section className="pr-section pr-access" id="join-dayfold">
        <div className="pr-section-copy">
          <p className="section-kicker">Beta Access</p>
          <h2>现在进入 Dayfold，开始记录你的真实一天</h2>
          <p>
            当前版本支持个人账号、日视图、周视图、项目笔记、导入导出和回收站。Beta 期间建议定期导出重要内容。
          </p>
        </div>

        <section className="auth-card" aria-label="Dayfold 注册登录">
          <p className="section-kicker">Account</p>
          <h2 className="auth-title">{mode === "signup" ? "创建你的 Dayfold" : "欢迎回来"}</h2>
          <p className="auth-copy">计划、进展、实际和复盘都会绑定到你的个人账号。</p>

          <div className="mode-toggle auth-toggle">
            <button className={`mode-pill${mode === "signup" ? " active" : ""}`} type="button" onClick={() => setMode("signup")}>
              注册
            </button>
            <button className={`mode-pill${mode === "login" ? " active" : ""}`} type="button" onClick={() => setMode("login")}>
              登录
            </button>
          </div>

          <div className="field-stack auth-fields">
            {mode === "signup" ? (
              <input type="text" placeholder="你的名字" value={name} onChange={(event) => setName(event.target.value)} />
            ) : null}
            <input type="email" placeholder="邮箱" value={email} onChange={(event) => setEmail(event.target.value)} />
            <input
              type="password"
              placeholder={mode === "signup" ? "密码（至少 8 位）" : "密码"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
            />
            {mode === "signup" ? (
              <div className="password-strength" aria-live="polite">
                <div className="password-strength-track">
                  <span className={`password-strength-bar score-${passwordStrength.score}`} />
                </div>
                <span>{passwordStrength.label}</span>
              </div>
            ) : null}
          </div>

          {error ? <div className="error-banner auth-error">{error}</div> : null}

          <button className="button button-primary auth-submit" type="button" disabled={submitting} onClick={() => void handleSubmit()}>
            {submitting ? "提交中..." : mode === "signup" ? "创建账号并进入" : "登录并进入"}
          </button>

          <p className="auth-tip">
            {mode === "signup"
              ? "Beta 测试期：你的内容会绑定到当前账号，重要内容建议定期备份。"
              : "如果之前已经注册过，直接用邮箱和密码登录即可。"}
          </p>
        </section>
      </section>
    </main>
  );
}
