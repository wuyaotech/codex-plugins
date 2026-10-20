export type ScheduleTask = {
  id: string;
  title: string;
  section: string;
  owner: string;
  start: string;
  end: string;
  progress: number;
  status: '进行中' | '待开始' | '已完成' | '需关注';
  note: string;
  checklist: { label: string; done: boolean }[];
};

/** Deliberately fictional data. These examples never write to a business API. */
export const scheduleTasks: ScheduleTask[] = [
  {
    id: 'demo-task-01',
    title: 'A 区二层钢筋绑扎',
    section: '主体结构 · A 区',
    owner: '示例施工一组',
    start: '2026-10-17',
    end: '2026-10-23',
    progress: 68,
    status: '进行中',
    note: '本层梁板钢筋已完成大部分绑扎，预留洞口与机电专业继续交叉复核。',
    checklist: [
      { label: '材料进场与复验', done: true },
      { label: '梁板钢筋绑扎', done: true },
      { label: '预留洞口复核', done: false },
      { label: '隐蔽工程验收', done: false },
    ],
  },
  {
    id: 'demo-task-02',
    title: '西侧地下管线复核',
    section: '市政配套 · 西侧道路',
    owner: '示例测量组',
    start: '2026-10-19',
    end: '2026-10-21',
    progress: 35,
    status: '需关注',
    note: '局部管线位置与图纸存在偏差，需要完成现场复核后再开展后续作业。',
    checklist: [
      { label: '现状资料整理', done: true },
      { label: '现场测量复核', done: false },
      { label: '记录与图纸校核', done: false },
    ],
  },
  {
    id: 'demo-task-03',
    title: 'B 区首层混凝土养护',
    section: '主体结构 · B 区',
    owner: '示例施工二组',
    start: '2026-10-15',
    end: '2026-10-22',
    progress: 82,
    status: '进行中',
    note: '按计划完成每日养护与温度记录，做好成品保护。',
    checklist: [
      { label: '浇筑完成', done: true },
      { label: '覆盖保湿', done: true },
      { label: '养护记录归档', done: false },
    ],
  },
  {
    id: 'demo-task-04',
    title: '东侧施工便道交付',
    section: '临时工程 · 东侧道路',
    owner: '示例道路组',
    start: '2026-10-13',
    end: '2026-10-19',
    progress: 100,
    status: '已完成',
    note: '便道及临时排水设施已完成示例验收，进入日常维护。',
    checklist: [
      { label: '基层处理', done: true },
      { label: '面层施工', done: true },
      { label: '检查交付', done: true },
    ],
  },
  {
    id: 'demo-task-05',
    title: 'A 区二层混凝土浇筑',
    section: '主体结构 · A 区',
    owner: '示例施工一组',
    start: '2026-10-24',
    end: '2026-10-26',
    progress: 0,
    status: '待开始',
    note: '待钢筋隐蔽验收完成后组织浇筑，施工前确认人员、设备与材料准备。',
    checklist: [
      { label: '隐蔽验收完成', done: false },
      { label: '浇筑方案交底', done: false },
      { label: '浇筑与养护', done: false },
    ],
  },
];
