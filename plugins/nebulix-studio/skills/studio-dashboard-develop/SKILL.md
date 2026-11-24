---
name: studio-dashboard-develop
description: Develop Nebulix dashboards in the live editor, including layout, components, Studio data bindings, workspace import and export, and saving or publishing through the editor. Use from local Codex or a Studio cloud space.
---

# Nebulix 大屏开发

按[大屏实时画布工作流](../studio-develop/references/unified-development.md)操作。本地 Codex 通过开发助手连接编辑器，云空间沿用当前 run 的页面任务。先核对连接实际环境、权限与工具能力，再确认本次要操作的大屏和浏览器目标。

- 从已连接的真实编辑器读取画布、组件契约和当前编辑修订。布局和组件用编辑器操作更新，完整文件开发从当前画布导出工作包，核对后重新导入同一编辑器。尚未连接时可整理已有文件和授权参考，画布操作等连接就绪。
- 绑定 Studio 数据时先核对已有正式表或 API、字段和业务权限，通过当前画布修改绑定并验证显示和筛选。确需新增或变更模块表、接口或配置时，再使用[Studio 业务开发](../studio-develop/SKILL.md)。
- 在真实画布检查改动和数据结果。按用户授权点击页面保存或发布按钮，使用当前页面状态返回的控件 ref，随后回读本次结果及对应版本。发布确认、保存和正式发布分别按实际状态报告。
