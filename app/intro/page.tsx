import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dayfold | 真实进展记录系统",
  description: "Dayfold 帮助知识工作者记录计划、实际推进和周复盘，让没有被待办清单看见的工作也留下证据。"
};

const workflowItems = [
  {
    label: "01 / Plan",
    title: "写下意图",
    body: "先放下今天、本周和长期想推进的方向。计划是入口，不是用来审判自己的硬指标。"
  },
  {
    label: "02 / Track",
    title: "记录实际",
    body: "用时间线留下真实发生的推进。会议、沟通、临时调整和深度工作都可以被看见。"
  },
  {
    label: "03 / Actual",
    title: "聚合今日",
    body: "系统按项目归拢当天实际，让你在一天结束时看到事实，而不是只看到未完成。"
  },
  {
    label: "04 / Review",
    title: "沉淀判断",
    body: "把高价值片段带入周复盘，形成关于方向、节奏和投入的清晰判断。"
  }
];

const audienceItems = [
  {
    title: "产品经理与团队负责人",
    body: "在反馈、会议、决策和推进之间切换，把零散沟通沉淀成项目证据。"
  },
  {
    title: "设计师、工程师与创作者",
    body: "长期项目并不总是线性完成。Dayfold 帮你留下每一次真实推进的痕迹。"
  },
  {
    title: "独立开发者与创始人",
    body: "每天在开发、运营、测试和修正间切换，需要知道混乱的一天究竟推进了什么。"
  }
];

const comparisonItems = [
  {
    title: "传统完成管理",
    points: ["只问任务是否完成", "计划外努力经常消失", "复盘从空白和焦虑开始"]
  },
  {
    title: "Dayfold 推进记录",
    points: ["记录实际发生的工作", "保留临时事项的价值", "复盘从事实证据开始"]
  }
];

const introStyles = `
.df-site {
  --df-canvas: #faf9f5;
  --df-surface-card: #efe9de;
  --df-dark: #181715;
  --df-dark-elevated: #252320;
  --df-dark-soft: #1f1e1b;
  --df-primary: #cc785c;
  --df-primary-active: #a9583e;
  --df-ink: #141413;
  --df-body: #3d3d3a;
  --df-muted: #6c6a64;
  --df-muted-soft: #8e8b82;
  --df-hairline: #e6dfd8;
  --df-on-dark: #faf9f5;
  --df-on-dark-soft: #a09d96;
  min-height: 100vh;
  overflow-x: hidden;
  background: var(--df-canvas);
  color: var(--df-ink);
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.df-site *,
.df-site *::before,
.df-site *::after {
  box-sizing: border-box;
  letter-spacing: 0;
}

.df-site h1,
.df-site h2 {
  font-family: "Tiempos Headline", "Cormorant Garamond", "EB Garamond", Georgia, "Times New Roman", serif;
  font-weight: 400;
}

.df-site-nav {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 64px;
  padding: 0 max(24px, calc((100vw - 1200px) / 2));
  border-bottom: 1px solid rgba(230, 223, 216, 0.84);
  background: rgba(250, 249, 245, 0.9);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.df-site-brand,
.df-site-nav-links,
.df-site-nav-links a,
.df-site-button,
.df-site-footer a {
  color: inherit;
  text-decoration: none;
}

.df-site-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 1rem;
  font-weight: 600;
}

.df-site-mark {
  position: relative;
  width: 18px;
  height: 18px;
  transform: rotate(45deg);
}

.df-site-mark::before,
.df-site-mark::after {
  content: "";
  position: absolute;
  inset: 8px 0 auto;
  height: 2px;
  border-radius: 999px;
  background: var(--df-ink);
}

.df-site-mark::after {
  transform: rotate(90deg);
}

.df-site-nav-links {
  display: inline-flex;
  align-items: center;
  gap: 24px;
  color: var(--df-body);
  font-size: 14px;
  font-weight: 500;
}

.df-site-language {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 40px;
  padding: 4px;
  border: 1px solid var(--df-hairline);
  border-radius: 8px;
  background: rgba(250, 249, 245, 0.76);
}

.df-site-language a {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 9px;
  border-radius: 6px;
  color: var(--df-muted);
  font-size: 13px;
}

.df-site-language a.active {
  background: var(--df-surface-card);
  color: var(--df-ink);
}

.df-site-nav-cta {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  padding: 0 20px;
  border-radius: 8px;
  background: var(--df-primary);
  color: #ffffff !important;
}

.df-site-hero {
  position: relative;
  display: grid;
  align-items: end;
  min-height: 92svh;
  padding: 160px max(24px, calc((100vw - 1200px) / 2)) 84px;
  overflow: hidden;
  isolation: isolate;
}

.df-site-hero-image {
  position: absolute;
  inset: 0;
  z-index: -3;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
}

.df-site-hero-wash {
  position: absolute;
  inset: 0;
  z-index: -2;
  background:
    linear-gradient(90deg, rgba(250, 249, 245, 0.98) 0%, rgba(250, 249, 245, 0.9) 38%, rgba(250, 249, 245, 0.52) 64%, rgba(250, 249, 245, 0.18) 100%),
    linear-gradient(180deg, rgba(250, 249, 245, 0.78) 0%, rgba(250, 249, 245, 0.22) 44%, rgba(24, 23, 21, 0.1) 100%);
}

.df-site-hero-content {
  width: min(650px, 100%);
}

.df-site-kicker {
  margin: 0;
  color: var(--df-primary);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 1.5px !important;
  line-height: 1.4;
  text-transform: uppercase;
}

.df-site h1 {
  margin: 16px 0 0;
  font-size: clamp(4.5rem, 10vw, 8.4rem);
  line-height: 0.92;
  letter-spacing: -1.5px !important;
}

.df-site-hero-lede {
  max-width: 610px;
  margin: 28px 0 0;
  color: var(--df-body);
  font-size: clamp(1.04rem, 1.8vw, 1.25rem);
  line-height: 1.7;
}

.df-site-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 32px;
}

.df-site-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 12px 20px;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
}

.df-site-button-primary {
  background: var(--df-primary);
  color: #ffffff;
}

.df-site-button-primary:hover,
.df-site-nav-cta:hover {
  background: var(--df-primary-active);
}

.df-site-button-secondary {
  border-color: var(--df-hairline);
  background: rgba(250, 249, 245, 0.9);
  color: var(--df-ink);
}

.df-site-proof,
.df-site-section,
.df-site-product-band,
.df-site-cta,
.df-site-footer {
  width: min(1200px, calc(100% - 48px));
  margin: 0 auto;
}

.df-site-proof {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  padding: 24px 0 96px;
}

.df-site-proof article,
.df-site-comparison article,
.df-site-workflow-grid article,
.df-site-audience-grid article {
  border-radius: 12px;
  background: var(--df-surface-card);
}

.df-site-proof article {
  display: grid;
  gap: 10px;
  min-height: 148px;
  padding: 24px;
}

.df-site-proof span,
.df-site-workflow-grid span,
.df-site-actual-summary span {
  color: var(--df-muted);
  font-size: 13px;
  font-weight: 500;
}

.df-site-proof strong {
  max-width: 280px;
  font-size: 22px;
  font-weight: 500;
  line-height: 1.3;
}

.df-site-section {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 64px;
  padding: 96px 0;
  border-top: 1px solid var(--df-hairline);
}

.df-site-section-copy {
  max-width: 530px;
}

.df-site-section-copy h2,
.df-site-product-copy h2,
.df-site-cta h2 {
  margin: 14px 0 0;
  font-size: clamp(2.25rem, 4.5vw, 4rem);
  line-height: 1.05;
  letter-spacing: -1px !important;
}

.df-site-section-copy p:not(.df-site-kicker),
.df-site-product-copy p,
.df-site-audience-grid p {
  margin: 20px 0 0;
  color: var(--df-body);
  font-size: 16px;
  line-height: 1.75;
}

.df-site-comparison {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.df-site-comparison article {
  min-height: 360px;
  padding: 32px;
}

.df-site-comparison article:nth-child(2) {
  background: var(--df-dark);
  color: var(--df-on-dark);
}

.df-site-comparison h3,
.df-site-workflow-grid h3,
.df-site-audience-grid h3 {
  margin: 0;
  font-size: 22px;
  font-weight: 500;
  line-height: 1.3;
}

.df-site-comparison ul {
  display: grid;
  gap: 14px;
  margin: 28px 0 0;
  padding: 0;
  list-style: none;
}

.df-site-comparison li {
  position: relative;
  padding-left: 22px;
  color: var(--df-body);
  line-height: 1.55;
}

.df-site-comparison article:nth-child(2) li {
  color: var(--df-on-dark-soft);
}

.df-site-comparison li::before {
  content: "";
  position: absolute;
  top: 11px;
  left: 0;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--df-primary);
}

.df-site-product-band {
  display: grid;
  grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
  gap: 48px;
  align-items: center;
  padding: 64px;
  border-radius: 12px;
  background: var(--df-dark);
  color: var(--df-on-dark);
}

.df-site-product-copy p:not(.df-site-kicker) {
  max-width: 460px;
  color: var(--df-on-dark-soft);
}

.df-site-product-card {
  overflow: hidden;
  border: 1px solid rgba(250, 249, 245, 0.08);
  border-radius: 12px;
  background: var(--df-dark-elevated);
}

.df-site-product-topbar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 0 18px;
  border-bottom: 1px solid rgba(250, 249, 245, 0.08);
}

.df-site-product-topbar span {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--df-muted-soft);
}

.df-site-product-topbar span:nth-child(1) { background: var(--df-primary); }
.df-site-product-topbar span:nth-child(2) { background: #e8a55a; }
.df-site-product-topbar span:nth-child(3) { background: #5db8a6; }

.df-site-product-topbar strong {
  margin-left: 8px;
  color: var(--df-on-dark-soft);
  font-size: 13px;
  font-weight: 500;
}

.df-site-terminal {
  display: grid;
  gap: 12px;
  padding: 24px;
  background: var(--df-dark-soft);
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.df-site-terminal p {
  margin: 0;
  color: var(--df-on-dark);
  font-size: 14px;
  line-height: 1.6;
}

.df-site-terminal span {
  display: inline-block;
  width: 56px;
  color: var(--df-primary);
}

.df-site-actual-summary {
  display: grid;
  gap: 8px;
  padding: 24px;
}

.df-site-actual-summary strong {
  font-size: 18px;
  font-weight: 500;
  line-height: 1.4;
}

.df-site-wide-copy {
  max-width: 760px;
}

.df-site-workflow-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  grid-column: 1 / -1;
}

.df-site-workflow-grid article,
.df-site-audience-grid article {
  display: grid;
  align-content: start;
  gap: 16px;
  min-height: 300px;
  padding: 32px;
}

.df-site-workflow-grid p {
  margin: 0;
  color: var(--df-body);
  font-size: 16px;
  line-height: 1.65;
}

.df-site-audience-grid {
  display: grid;
  gap: 16px;
}

.df-site-audience-grid article {
  min-height: 168px;
  background: var(--df-canvas);
  border: 1px solid var(--df-hairline);
}

.df-site-audience-grid p {
  margin-top: 0;
}

.df-site-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  margin-top: 32px;
  padding: 64px;
  border-radius: 12px;
  background: var(--df-primary);
  color: #ffffff;
}

.df-site-cta .df-site-kicker {
  color: rgba(255, 255, 255, 0.78);
}

.df-site-cta h2 {
  max-width: 740px;
  color: #ffffff;
}

.df-site-button-inverted {
  flex: 0 0 auto;
  background: var(--df-canvas);
  color: var(--df-ink);
}

.df-site-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 120px;
  color: var(--df-muted);
  font-size: 14px;
}

@media (max-width: 1120px) {
  .df-site-section,
  .df-site-product-band {
    grid-template-columns: 1fr;
  }

  .df-site-workflow-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .df-site-nav {
    padding: 0 16px;
  }

  .df-site-nav-links {
    gap: 10px;
  }

  .df-site-nav-links > a:not(.df-site-nav-cta) {
    display: none;
  }

  .df-site-language {
    min-height: 36px;
  }

  .df-site-language a {
    min-height: 26px;
    padding: 0 7px;
  }

  .df-site-hero {
    min-height: 88svh;
    padding: 126px 18px 52px;
  }

  .df-site-hero-image {
    object-position: 62% top;
  }

  .df-site-hero-wash {
    background:
      linear-gradient(90deg, rgba(250, 249, 245, 0.98) 0%, rgba(250, 249, 245, 0.9) 62%, rgba(250, 249, 245, 0.46) 100%),
      linear-gradient(180deg, rgba(250, 249, 245, 0.84) 0%, rgba(250, 249, 245, 0.24) 48%, rgba(24, 23, 21, 0.12) 100%);
  }

  .df-site h1 {
    font-size: clamp(4rem, 24vw, 6.2rem);
  }

  .df-site-proof,
  .df-site-section,
  .df-site-product-band,
  .df-site-cta,
  .df-site-footer {
    width: calc(100% - 28px);
  }

  .df-site-proof,
  .df-site-comparison,
  .df-site-workflow-grid {
    grid-template-columns: 1fr;
  }

  .df-site-proof {
    padding-bottom: 64px;
  }

  .df-site-section {
    gap: 32px;
    padding: 64px 0;
  }

  .df-site-product-band,
  .df-site-cta {
    padding: 32px;
  }

  .df-site-comparison article,
  .df-site-workflow-grid article,
  .df-site-audience-grid article {
    min-height: auto;
    padding: 24px;
  }

  .df-site-cta,
  .df-site-footer {
    align-items: flex-start;
    flex-direction: column;
  }
}
`;

export default function IntroPage() {
  return (
    <main className="df-site">
      <style dangerouslySetInnerHTML={{ __html: introStyles }} />
      <nav className="df-site-nav" aria-label="Dayfold 网站导航">
        <a className="df-site-brand" href="/intro" aria-label="Dayfold 介绍页">
          <span className="df-site-mark" aria-hidden="true" />
          Dayfold
        </a>
        <div className="df-site-nav-links">
          <a href="#difference">产品逻辑</a>
          <a href="#workflow">工作流</a>
          <a href="#audience">适用人群</a>
          <span className="df-site-language" aria-label="切换语言">
            <a className="active" href="/intro" aria-current="page">
              中文
            </a>
            <a href="/intro/en">EN</a>
          </span>
          <a className="df-site-nav-cta" href="/">
            进入应用
          </a>
        </div>
      </nav>

      <section className="df-site-hero" aria-labelledby="df-site-title">
        <img className="df-site-hero-image" src="/dayfold-pr-hero.png" alt="Dayfold 产品界面截图" />
        <div className="df-site-hero-wash" />
        <div className="df-site-hero-content">
          <p className="df-site-kicker">Progress, not pressure</p>
          <h1 id="df-site-title">Dayfold</h1>
          <p className="df-site-hero-lede">
            一个面向知识工作者的真实进展记录系统。让 Todo list 继续指引方向，同时把你今天实际推进的沟通、调整、思考和产出沉淀下来。
          </p>
          <div className="df-site-actions">
            <a className="df-site-button df-site-button-primary" href="/">
              开始记录
            </a>
            <a className="df-site-button df-site-button-secondary" href="#workflow">
              了解工作流
            </a>
          </div>
        </div>
      </section>

      <section className="df-site-proof" aria-label="Dayfold 核心价值">
        <article>
          <span>Day Plan</span>
          <strong>计划是意图，不是压力清单。</strong>
        </article>
        <article>
          <span>Actual Trace</span>
          <strong>真实推进被记录，而不是被待办抹掉。</strong>
        </article>
        <article>
          <span>Weekly Review</span>
          <strong>复盘从证据开始，而不是从回忆开始。</strong>
        </article>
      </section>

      <section className="df-site-section df-site-intro" id="difference">
        <div className="df-site-section-copy">
          <p className="df-site-kicker">A different daily logic</p>
          <h2>不是取代待办清单，而是补上它看不见的部分。</h2>
          <p>
            知识工作常常不是「完成一个明确任务」，而是在不确定中推进方向。Dayfold 把计划、实际和复盘分开，让一天的偏差、临时工作和真实投入都有位置。
          </p>
        </div>
        <div className="df-site-comparison">
          {comparisonItems.map((item) => (
            <article key={item.title}>
              <h3>{item.title}</h3>
              <ul>
                {item.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="df-site-product-band" aria-label="Dayfold 产品预览">
        <div className="df-site-product-copy">
          <p className="df-site-kicker">Product surface</p>
          <h2>一天结束时，看见实际发生过什么。</h2>
          <p>
            每条进展都保留时间、项目和说明。Dayfold 会把它们归拢成「今日实际」，再带入周复盘，帮助你理解投入方向，而不是只统计完成数量。
          </p>
        </div>
        <div className="df-site-product-card">
          <div className="df-site-product-topbar">
            <span />
            <span />
            <span />
            <strong>Actual Timeline</strong>
          </div>
          <div className="df-site-terminal">
            <p><span>09:30</span> 用户反馈归类，确认新手最困惑的是「计划」和「实际」的关系。</p>
            <p><span>11:10</span> 调整 Dayfold 介绍页信息架构，把真实进展放到首屏叙事。</p>
            <p><span>15:40</span> 临时沟通 Beta 数据备份提示，加入导出说明。</p>
          </div>
          <div className="df-site-actual-summary">
            <span>Today actual</span>
            <strong>产品方向、发布页、Beta 信任感都有推进。</strong>
          </div>
        </div>
      </section>

      <section className="df-site-section" id="workflow">
        <div className="df-site-section-copy df-site-wide-copy">
          <p className="df-site-kicker">Workflow</p>
          <h2>把一天拆成四种性质的信息。</h2>
        </div>
        <div className="df-site-workflow-grid">
          {workflowItems.map((item) => (
            <article key={item.title}>
              <span>{item.label}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="df-site-section df-site-audience" id="audience">
        <div className="df-site-section-copy">
          <p className="df-site-kicker">Made for real work</p>
          <h2>给每天都在多线推进的人。</h2>
          <p>
            如果你的工作包含探索、判断、沟通、试错和长期积累，Dayfold 会比单纯完成打勾更接近你的真实状态。
          </p>
        </div>
        <div className="df-site-audience-grid">
          {audienceItems.map((item) => (
            <article key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="df-site-cta" aria-label="开始使用 Dayfold">
        <div>
          <p className="df-site-kicker">Start today</p>
          <h2>让今天结束时，你不再怀疑自己的价值。</h2>
        </div>
        <a className="df-site-button df-site-button-inverted" href="/">
          进入 Dayfold
        </a>
      </section>

      <footer className="df-site-footer">
        <a className="df-site-brand" href="/intro" aria-label="Dayfold 介绍页">
          <span className="df-site-mark" aria-hidden="true" />
          Dayfold
        </a>
        <span>真实进展记录系统</span>
      </footer>
    </main>
  );
}
