# PM 入口修复 0.1.9

最终插件0.1.9保留starter0.3.1与SDK0.1.0。interface.defaultPrompt从4条合并为3条，分别覆盖只读检查、通用业务本地联调、移动H5，避免CLI因超过3条而忽略全部默认提示。校验脚本明确检查1至3条非空提示。

实际隔离Codex CLI加载本地0.1.9包并返回OK，退出0，未出现defaultPrompt上限警告，也未出现icon_small/icon_large路径警告。Nebulix技能本身没有越界icon路径，不修改其他插件的图标。本测试未复制MCP OAuth，连接提示Auth required属于隔离环境预期，不能据此宣称MCP业务调用通过；用户原配置、OAuth、server key和endpoint保持。

本轮之后冻结插件版本，不因测试记录再发布新版本。正式平台激活/回退及浏览器验收由平台发布回执持续记录。
