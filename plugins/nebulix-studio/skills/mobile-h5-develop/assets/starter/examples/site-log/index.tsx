import React, { useEffect, useMemo, useState } from 'react';
import type { FrontendModule, MobilePageContext, MobilePageProps } from '@nebulix/mobile-sdk';
import './site-log.css';

interface LocalLog {
  id: string;
  title: string;
  content: string;
  author: string;
  date: string;
  time: string;
  area: string;
  weather: string;
  seeded?: boolean;
}

const seedLogs: LocalLog[] = [
  { id: 'sample-log-01', title: 'A 区梁板钢筋施工记录', content: '今日完成 A 区二层梁板钢筋绑扎。对预留洞口位置进行了初步核对，局部节点待机电专业共同复核。\n\n明日计划：完成剩余节点复核，准备隐蔽验收材料。', author: '示例施工员', date: '2026-10-20', time: '16:30', area: 'A 区主体', weather: '晴', seeded: true },
  { id: 'sample-log-02', title: '西侧地下管线现场复核', content: '测量组完成西侧道路控制点复核，发现两处管线位置与图纸存在偏差，已记录位置和现场情况，等待进一步确认。', author: '示例测量员', date: '2026-10-20', time: '10:15', area: '西侧道路', weather: '晴', seeded: true },
  { id: 'sample-log-03', title: '东侧施工便道检查交付', content: '施工便道面层与排水设施检查完成，现场通行条件满足示例交付要求。\n\n后续安排专人进行日常检查与维护。', author: '示例施工员', date: '2026-10-19', time: '17:20', area: '东侧道路', weather: '多云', seeded: true },
];

const Arrow = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m15 6-6 6 6 6" /></svg>;
const Search = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>;

function storageKey(ctx: MobilePageContext) {
  return `nebulix:mobile:example-logs:v1:${[ctx.appKey, ctx.user?.uuid || 'preview', ctx.companyUuid || 'none', ctx.projectUuid || 'none', ctx.moduleKey].map(encodeURIComponent).join(':')}`;
}
function readLogs(ctx: MobilePageContext): LocalLog[] {
  const value = localStorage.getItem(storageKey(ctx));
  if (!value) return seedLogs;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every((item) => item && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.content === 'string' && typeof item.date === 'string' && typeof item.time === 'string' && typeof item.author === 'string' && typeof item.area === 'string' && typeof item.weather === 'string')) throw new Error('invalid');
    return parsed as LocalLog[];
  } catch {
    throw new Error('本地日志内容无法读取。请保留浏览器数据并联系开发者检查。');
  }
}
function getLogState(ctx: MobilePageContext): { logs: LocalLog[]; error: string } {
  try { return { logs: readLogs(ctx), error: '' }; }
  catch (error) { return { logs: [], error: error instanceof Error ? error.message : '本地日志读取失败' }; }
}
function formatNow() {
  const date = new Date();
  const two = (value: number) => String(value).padStart(2, '0');
  return { date: `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`, time: `${two(date.getHours())}:${two(date.getMinutes())}` };
}

export function LogList({ ctx, params }: MobilePageProps) {
  const [search, setSearch] = useState('');
  const { logs, error } = useMemo(() => getLogState(ctx), [ctx.appKey, ctx.user?.uuid, ctx.companyUuid, ctx.projectUuid, ctx.epoch]);
  const filtered = logs.filter((item) => `${item.title} ${item.content} ${item.area}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  const days = [...new Set(filtered.map((item) => item.date))];
  return <section className="mobile-log">
    <header className="mobile-log-heading"><div><span className="mobile-log-eyebrow">FIELD JOURNAL</span><h1>现场日志</h1><p>把现场的每一天，认真记录下来</p></div><button className="mobile-log-add" aria-label="新建现场日志" title="新建日志" onClick={() => ctx.navigate({ moduleKey: 'customer-site-log', pageKey: 'create' })}>＋</button></header>
    {params.saved === '1' && <div className="mobile-log-success" role="status">日志已保存到当前浏览器的本地示例空间。</div>}
    {error && <p className="mobile-log-error" role="alert">{error}</p>}
    <label className="mobile-log-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索日志、内容或施工区域" aria-label="搜索现场日志" /></label>
    <div className="mobile-log-summary"><span><b>{filtered.length}</b> 篇记录</span><span>本地示例 · 当前项目</span></div>
    {days.map((day) => <div className="mobile-log-day" key={day}><div className="mobile-log-date"><strong>{day.slice(8)}</strong><span>{Number(day.slice(5, 7))} 月</span></div><div className="mobile-log-day-cards">{filtered.filter((item) => item.date === day).map((item) => <button key={item.id} className="mobile-log-card" onClick={() => ctx.navigate({ moduleKey: 'customer-site-log', pageKey: 'detail', query: { id: item.id } })}>
      <div className="mobile-log-card-meta"><span>{item.time} · {item.weather}</span><span className={`mobile-log-tag ${item.seeded ? '' : 'green'}`}>{item.seeded ? '虚构样例' : '本地记录'}</span></div>
      <h2>{item.title}</h2><p>{item.content}</p><div className="mobile-log-card-footer"><span>{item.author}</span><span>{item.area} ↗</span></div>
    </button>)}</div></div>)}
    {!filtered.length && !error && <div className="mobile-log-empty">{search ? '没有找到匹配的记录，换一个关键词试试。' : '还没有记录，写下今天的第一篇现场日志。'}</div>}
    <p className="mobile-log-notice">客户自研模块 · 记录保存在当前浏览器<br />按应用、账号、企业和项目分开，不上传业务系统</p>
  </section>;
}

export function CreateLog({ ctx, params }: MobilePageProps) {
  const [title, setTitle] = useState(params.task ? `${params.task} · 现场记录` : '');
  const [content, setContent] = useState('');
  const [area, setArea] = useState('A 区主体');
  const [weather, setWeather] = useState('晴');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const isDirty = !saved && (!!title || !!content || area !== 'A 区主体' || weather !== '晴');
  useEffect(() => ctx.registerDirty(() => isDirty), [ctx.registerDirty, isDirty]);
  const back = () => ctx.navigate({ moduleKey: 'customer-site-log', pageKey: 'list' });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !content.trim()) { setError('请填写日志标题和现场内容。'); return; }
    setSaving(true);
    try {
      const log: LocalLog = { id: `local-${crypto.randomUUID()}`, title: title.trim(), content: content.trim(), area, weather, author: String(ctx.user?.displayName || ctx.user?.username || '本地体验者'), ...formatNow() };
      localStorage.setItem(storageKey(ctx), JSON.stringify([log, ...readLogs(ctx)]));
      setSaved(true);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? `保存失败：${reason.message}` : '保存失败，请检查浏览器存储权限与空间。');
      setSaving(false);
    }
  };
  useEffect(() => { if (saved) void ctx.navigate({ moduleKey: 'customer-site-log', pageKey: 'list', query: { saved: '1' } }); }, [saved]);
  return <section className="mobile-log">
    <button className="mobile-log-back" onClick={back}><Arrow />现场日志</button>
    <header className="mobile-log-heading"><div><span className="mobile-log-eyebrow">A NOTE FROM THE SITE</span><h1>记录今天</h1><p>本地示例记录，不会写入业务系统</p></div></header>
    <form className="mobile-log-form" onSubmit={submit}>
      <label className="mobile-log-label">日志标题<input required maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：A 区二层钢筋施工记录" autoComplete="off" /></label>
      <div className="mobile-log-form-row"><label className="mobile-log-label">施工区域<select value={area} onChange={(event) => setArea(event.target.value)}><option>A 区主体</option><option>B 区主体</option><option>西侧道路</option><option>东侧道路</option><option>其他区域</option></select></label><label className="mobile-log-label">天气<select value={weather} onChange={(event) => setWeather(event.target.value)}><option>晴</option><option>多云</option><option>阴</option><option>小雨</option><option>大雨</option></select></label></div>
      <label className="mobile-log-label">现场内容<textarea required maxLength={5000} value={content} onChange={(event) => setContent(event.target.value)} placeholder={'记录施工情况、需要协调的问题，\n以及下一步的工作安排……'} /><small>{content.length} / 5000</small></label>
      {error && <p className="mobile-log-error" role="alert">{error}</p>}
      <button type="submit" className="mobile-log-primary" disabled={saving}>{saving ? '正在保存…' : '保存本地日志'}</button>
    </form>
    <p className="mobile-log-notice">清除浏览器数据会删除本地记录。请勿填写敏感业务信息。</p>
  </section>;
}

export function LogDetail({ ctx, params }: MobilePageProps) {
  const { logs, error } = useMemo(() => getLogState(ctx), [ctx.appKey, ctx.user?.uuid, ctx.companyUuid, ctx.projectUuid, ctx.epoch]);
  const log = logs.find((item) => item.id === params.id);
  const back = () => ctx.navigate({ moduleKey: 'customer-site-log', pageKey: 'list' });
  return <section className="mobile-log">
    <button className="mobile-log-back" onClick={back}><Arrow />现场日志</button>
    {error && <p className="mobile-log-error" role="alert">{error}</p>}
    {log ? <>
      <span className={`mobile-log-tag ${log.seeded ? '' : 'green'}`}>{log.seeded ? '虚构样例' : '本地记录'}</span><h1 className="mobile-log-detail-title">{log.title}</h1>
      <div className="mobile-log-detail-byline"><span className="mobile-log-avatar">{log.author.slice(0, 1)}</span><span>{log.author}</span><span>{log.date} {log.time}</span></div>
      <div className="mobile-log-detail-context"><span>施工区域 · {log.area}</span><span>天气 · {log.weather}</span></div>
      <div className="mobile-log-detail-body">{log.content}</div>
      <div className="mobile-log-detail-foot">这篇日志属于当前应用、账号与项目的本地示例空间。<br />未提交至云端业务系统。</div>
    </> : !error && <div className="mobile-log-empty">未找到这篇日志，请返回列表重新选择。</div>}
  </section>;
}

export const frontendModule: FrontendModule = {
  moduleKey: 'customer-site-log',
  moduleName: '客户现场日志',
  pages: [
    { key: 'list', label: '现场日志', scope: 'project', component: LogList },
    { key: 'create', label: '新建日志', scope: 'project', component: CreateLog },
    { key: 'detail', label: '日志详情', scope: 'project', component: LogDetail },
  ],
};
