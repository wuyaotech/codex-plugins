import path from 'node:path';
import { root, sdkRoot, requireTool, resolveTool } from './tooling.mjs';

const ts = requireTool('typescript');
const configPath = path.join(root, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const reactTypes = path.dirname(resolveTool('@types/react/package.json'));
const domTypes = path.dirname(resolveTool('@types/react-dom/package.json'));
parsed.options.paths = {
  ...parsed.options.paths,
  '@nebulix/mobile-sdk': [path.join(sdkRoot, 'src/index.ts')],
  react: [path.join(reactTypes, 'index.d.ts')],
  'react/*': [path.join(reactTypes, '*')],
  'react-dom/*': [path.join(domTypes, '*')],
};
const program = ts.createProgram(parsed.fileNames, parsed.options);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => root,
    getNewLine: () => '\n',
  }));
  process.exitCode = 1;
} else console.log('H5 starter and SDK typecheck passed.');
