import React, { useState } from 'react';
import type { FrontendModule, MobilePageProps } from '@nebulix/mobile-sdk';
import { scheduleTasks, type ScheduleTask } from './data';
import './schedule.css';

declare const __MODULE_VERSION__: string;
const moduleVersion = typeof __MODULE_VERSION__ === 'undefined' ? '1.0.0' : __MODULE_VERSION__;
const Arrow = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m15 6-6 6 6 6" /></svg>;
const Calendar = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v5m8-5v5M4 11h16m-11 4h2m2 0h2" /></svg>;
const statusClass = (status: ScheduleTask['status']) => status === '需关注' ? 'is-warning' : status === '已完成' ? 'is-complete' : status === '待开始' ? 'is-idle' : '';

export function ProgressOverview({ ctx }: MobilePageProps) {
  const [filter, setFilter] = useState('全部');
  const tasks = scheduleTasks.filter((task) => filter === '全部' || task.status === filter);
  const openTask = (id: string) => ctx.navigate({ moduleKey: 'schedule', pageKey: 'task-detail', query: { id } });
  return <section className="mobile-schedule">
    <header className="mobile-schedule-heading">
      <div><span className="mobile-schedule-eyebrow">PROJECT SCHEDULE</span><h1>进度计划</h1><p>让每一步，都在计划之中</p></div>
      <button className="mobile-schedule-round" title="查看本周计划" aria-label="查看本周计划" onClick={() => document.getElementById('mobile-schedule-week')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><Calendar /></button>
    </header>
    <div className="mobile-schedule-summary">
      <div className="mobile-schedule-summary-top"><div><div className="mobile-schedule-summary-label">主体结构施工</div><p className="mobile-schedule-summary-sub">示例计划 · 2026.10.13 — 10.26</p></div><strong>57<span>%</span></strong></div>
      <div className="mobile-schedule-meter"><span style={{ width: '57%' }} /></div>
      <div className="mobile-schedule-legend"><span>实际进度 57%</span><b>计划进度 60%</b></div>
    </div>
    {moduleVersion === '1.1.0' && <div className="mobile-schedule-upgrade"><span>里程碑提醒 · 1.1</span><strong>10 月 23 日 · A 区隐蔽验收</strong><p>西侧管线复核需优先协调，避免影响后续施工。此提醒来自新版本进度模块。</p></div>}
    <div className="mobile-schedule-section-head" id="mobile-schedule-week"><h2>本周计划</h2><span>10 月 19 日 — 25 日 · 示例</span></div>
    <div className="mobile-schedule-week">
      <div className="mobile-schedule-week-days">{['一', '二', '三', '四', '五', '六', '日'].map((day, index) => <div key={day} className={`mobile-schedule-day ${index === 1 ? 'is-today' : ''}`}><span>{day}</span><b>{19 + index}</b></div>)}</div>
      <div className="mobile-schedule-gantt">
        <button className="mobile-schedule-gantt-bar green" onClick={() => openTask('demo-task-01')}>A 区钢筋绑扎</button>
        <button className="mobile-schedule-gantt-bar amber" onClick={() => openTask('demo-task-02')}>管线复核</button>
        <button className="mobile-schedule-gantt-bar gray" onClick={() => openTask('demo-task-03')}>混凝土养护</button>
      </div>
    </div>
    <div className="mobile-schedule-section-head"><h2>施工任务</h2><span>{tasks.length} 项任务</span></div>
    <div className="mobile-schedule-tabs" aria-label="任务状态筛选">{['全部', '进行中', '需关注', '待开始', '已完成'].map((value) => <button key={value} className={filter === value ? 'is-active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}</div>
    <div className="mobile-schedule-task-list">{tasks.map((task) => <button key={task.id} className="mobile-schedule-task" onClick={() => openTask(task.id)}>
      <div className="mobile-schedule-task-top"><strong>{task.title}</strong><span className={`mobile-schedule-status ${statusClass(task.status)}`}>{task.status}</span></div>
      <div className="mobile-schedule-task-meta"><span>{task.section}</span><span>{task.end.slice(5).replace('-', '.')} 计划完成</span></div>
      <div className="mobile-schedule-task-progress"><div className="mobile-schedule-task-track"><span style={{ width: `${task.progress}%` }} /></div><b>{task.progress}%</b></div>
    </button>)}</div>
    <p className="mobile-schedule-notice">标准进度模块 {moduleVersion} · 虚构样例数据，不写入业务系统</p>
  </section>;
}

export function TaskDetail({ ctx, params }: MobilePageProps) {
  const task = scheduleTasks.find((item) => item.id === params.id);
  const back = () => ctx.navigate({ moduleKey: 'schedule', pageKey: 'overview' });
  if (!task) return <section className="mobile-schedule"><button className="mobile-schedule-back" onClick={back}><Arrow />返回进度</button><h1>未找到这项任务</h1><p className="mobile-schedule-note">请从进度列表重新选择任务。</p></section>;
  return <section className="mobile-schedule">
    <button className="mobile-schedule-back" onClick={back}><Arrow />进度计划</button>
    <div><span className={`mobile-schedule-status ${statusClass(task.status)}`}>{task.status}</span></div>
    <h1 className="mobile-schedule-detail-title">{task.title}</h1>
    <div className="mobile-schedule-summary"><div className="mobile-schedule-summary-top"><div><div className="mobile-schedule-summary-label">当前完成进度</div><small>示例记录 · 只读</small></div><strong>{task.progress}<span>%</span></strong></div><div className="mobile-schedule-meter"><span style={{ width: `${task.progress}%` }} /></div></div>
    <dl className="mobile-schedule-detail-info"><div><dt>所属分区</dt><dd>{task.section}</dd></div><div><dt>负责班组</dt><dd>{task.owner}</dd></div><div><dt>计划开始</dt><dd>{task.start}</dd></div><div><dt>计划完成</dt><dd>{task.end}</dd></div></dl>
    <div className="mobile-schedule-section-head"><h2>现场说明</h2></div><p className="mobile-schedule-note">{task.note}</p>
    <div className="mobile-schedule-section-head"><h2>任务节点</h2><span>{task.checklist.filter((item) => item.done).length} / {task.checklist.length} 已完成</span></div>
    <div className="mobile-schedule-checklist">{task.checklist.map((item) => <div key={item.label} className={`mobile-schedule-check ${item.done ? 'is-done' : ''}`}><span>{item.done ? '✓' : '·'}</span>{item.label}</div>)}</div>
    <button className="mobile-schedule-action" onClick={() => ctx.navigate({ moduleKey: 'customer-site-log', pageKey: 'create', query: { task: task.title } })}>记一条现场日志</button>
    <p className="mobile-schedule-notice">虚构样例任务 · 新日志仅保存在当前浏览器的本地示例空间</p>
  </section>;
}

export const frontendModule: FrontendModule = {
  moduleKey: 'schedule',
  moduleName: '标准进度',
  pages: [
    { key: 'overview', label: '进度总览', scope: 'project', component: ProgressOverview },
    { key: 'task-detail', label: '任务详情', scope: 'project', component: TaskDetail },
  ],
};
