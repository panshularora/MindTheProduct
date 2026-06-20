export interface CodeGraphNode {
  id: string;
  type: 'file';
}

export interface CodeGraphEdge {
  from: string;
  to: string;
  importType: 'external_package' | 'internal_file' | 'node_builtin';
}

export interface CodeGraph {
  nodes: CodeGraphNode[];
  edges: CodeGraphEdge[];
}

export interface Conflict {
  type: string;
  severity: 'high' | 'medium' | 'low';
  filePath: string | null;
  description: string;
  lineHint?: string;
}

interface ParsedPackageJson {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  engines: Record<string, string> | null;
  scripts: Record<string, string>;
}

const BUILTIN_MODULES = new Set([
  'fs', 'path', 'crypto', 'os', 'child_process', 'net', 'dns', 
  'http', 'https', 'stream', 'util', 'zlib', 'events', 'readline', 
  'process', 'url', 'querystring', 'buffer', 'vm', 'tls', 'dgram', 'assert'
]);

const IGNORED_ENV_VARS = new Set([
  'NODE_ENV', 'PORT', 'VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 
  'VERCEL_GIT_COMMIT_SHA', 'VERCEL_GIT_COMMIT_REF', 'VERCEL_GIT_PROVIDER'
]);

// Strip Javascript comments while preserving string literals
export function stripComments(code: string): string {
  return code.replace(
    /("([^"\\]|\\.)*")|('([^'\\]|\\.)*')|(`([^`\\]|\\.)*`)|(\/\*[\s\S]*?\*\/)|(\/\/.*)/g,
    (match, g1, g2, g3, g4, g5, g6, g7, g8) => {
      if (g7) {
        // Multiline comment: replace characters with spaces/newlines to keep lines aligned
        return g7.replace(/[^\r\n]/g, ' ');
      }
      if (g8) {
        // Single line comment
        return '';
      }
      return match; // String literal
    }
  );
}

// Extract base name or package name from an import target
// e.g. "lodash/map" -> "lodash", "@types/node" -> "@types/node"
function getPackageBaseName(target: string): string {
  if (target.startsWith('@')) {
    const parts = target.split('/');
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
  }
  return target.split('/')[0];
}

// Helper to resolve alias `@/` and relative imports to repo-relative paths
function resolveInternalPath(fromPath: string, importTarget: string, allFiles: Set<string>): string {
  let resolved = '';
  if (importTarget.startsWith('@/')) {
    resolved = importTarget.slice(2);
  } else {
    const dir = fromPath.split('/').slice(0, -1).join('/');
    const parts = (dir ? dir + '/' : '') + importTarget;
    const segmentList = parts.split('/');
    const stack: string[] = [];
    for (const segment of segmentList) {
      if (segment === '.' || segment === '') continue;
      if (segment === '..') {
        stack.pop();
      } else {
        stack.push(segment);
      }
    }
    resolved = stack.join('/');
  }

  // Extensions to check for resolution
  const extensions = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.jsx', '/index.js'];
  for (const ext of extensions) {
    const candidate = resolved + ext;
    if (allFiles.has(candidate)) {
      return candidate;
    }
  }
  return resolved;
}

export function buildDependencyGraphAndConflicts(
  fileContents: { path: string; content: string }[],
  packageJson: ParsedPackageJson,
  envExampleContent: string | null,
  targetPlatform: string
): { graph: CodeGraph; conflicts: Conflict[]; envVarsReferenced: string[] } {
  const conflicts: Conflict[] = [];
  const nodes: CodeGraphNode[] = [];
  const edges: CodeGraphEdge[] = [];

  const allFiles = new Set(fileContents.map(f => f.path));

  // Package dependencies set for quick lookup
  const declaredDeps = new Set([
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {}),
    ...Object.keys(packageJson.peerDependencies || {})
  ]);

  // Parse .env.example keys
  const envExampleKeys = new Set<string>();
  if (envExampleContent) {
    const lines = envExampleContent.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || trimmed === '') continue;
      // Match KEY=value or KEY = value
      const match = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=/);
      if (match) {
        envExampleKeys.add(match[1]);
      }
    }
  }

  // Set of env variables discovered in code to analyze missing ones
  const referencedEnvVarsByFile: Record<string, { varName: string; line: string }[]> = {};

  for (const file of fileContents) {
    nodes.push({ id: file.path, type: 'file' });

    const rawContent = file.content;
    const cleanContent = stripComments(rawContent);

    // 1. Scan for imports
    // Regex matches:
    // - import ... from 'target'
    // - import 'target'
    // - require('target')
    // - import('target')
    const imports: { target: string; lineHint: string }[] = [];

    // ES Modules: import ... from 'target' or import 'target'
    const esImportRegex = /import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = esImportRegex.exec(cleanContent)) !== null) {
      imports.push({ target: match[1], lineHint: match[0] });
    }

    // Dynamic import('target')
    const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = dynamicImportRegex.exec(cleanContent)) !== null) {
      imports.push({ target: match[1], lineHint: match[0] });
    }

    // CommonJS require('target')
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(cleanContent)) !== null) {
      imports.push({ target: match[1], lineHint: match[0] });
    }

    // Process imports to build edges
    for (const imp of imports) {
      let type: 'external_package' | 'internal_file' | 'node_builtin' = 'external_package';
      let to = imp.target;

      const targetClean = imp.target.startsWith('node:') ? imp.target.slice(5) : imp.target;
      const baseName = getPackageBaseName(targetClean);

      if (imp.target.startsWith('node:') || BUIN_CHECK(baseName)) {
        type = 'node_builtin';
      } else if (imp.target.startsWith('.') || imp.target.startsWith('/') || imp.target.startsWith('@/')) {
        type = 'internal_file';
        to = resolveInternalPath(file.path, imp.target, allFiles);
      } else {
        type = 'external_package';
      }

      edges.push({
        from: file.path,
        to: to,
        importType: type
      });

      // Conflict Check: NODE_BUILTIN_IN_CLIENT_CODE
      if (type === 'node_builtin') {
        const isClientComponent = 
          cleanContent.includes('use client') || 
          cleanContent.includes('"use client"') || 
          cleanContent.includes("'use client'") ||
          file.path.toLowerCase().split('/').some(part => part === 'components' || part === 'client');

        const problematicBuiltins = ['fs', 'path', 'crypto', 'child_process', 'net', 'dns'];
        if (isClientComponent && problematicBuiltins.includes(targetClean)) {
          conflicts.push({
            type: 'NODE_BUILTIN_IN_CLIENT_CODE',
            severity: 'high',
            filePath: file.path,
            description: `Client-side component imports Node.js built-in module '${imp.target}', which will fail to compile/run in the browser or Edge runtime on ${targetPlatform}.`,
            lineHint: imp.lineHint
          });
        }
      }
    }

    // 2. Scan for environment variables: process.env.SOMETHING
    const envVarRegex = /process\.env\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
    const fileEnvVars: { varName: string; line: string }[] = [];
    while ((match = envVarRegex.exec(cleanContent)) !== null) {
      const varName = match[1];
      if (!IGNORED_ENV_VARS.has(varName)) {
        fileEnvVars.push({ varName, line: match[0] });
      }
    }
    if (fileEnvVars.length > 0) {
      referencedEnvVarsByFile[file.path] = fileEnvVars;
    }
  }

  function BUIN_CHECK(name: string): boolean {
    return BUILTIN_MODULES.has(name);
  }

  // Conflict Check: MISSING_ENV_VAR
  // Only execute this check if we successfully loaded .env.example
  if (envExampleContent) {
    for (const [filePath, vars] of Object.entries(referencedEnvVarsByFile)) {
      for (const v of vars) {
        if (!envExampleKeys.has(v.varName)) {
          conflicts.push({
            type: 'MISSING_ENV_VAR',
            severity: 'medium',
            filePath: filePath,
            description: `Environment variable '${v.varName}' is referenced in code but missing from '.env.example'.`,
            lineHint: v.line
          });
        }
      }
    }
  }

  // Helper to parse major version number
  const getMajorVersion = (versionStr: string): number | null => {
    const clean = versionStr.replace(/[\^~>=<]/g, '').trim();
    const match = clean.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  };

  // Conflict Check: ENGINE_MISMATCH
  if (packageJson.engines && packageJson.engines.node) {
    const nodeEngine = packageJson.engines.node.trim();
    const oldVersions = ['10', '12', '13', '14', '15', '16', '17', '19', '21'];
    const isOldOrNonLts = 
      oldVersions.some(v => nodeEngine.includes(v)) || 
      nodeEngine.startsWith('<16') || 
      nodeEngine.startsWith('<18');
    
    if (isOldOrNonLts) {
      conflicts.push({
        type: 'ENGINE_MISMATCH',
        severity: 'medium',
        filePath: 'package.json',
        description: `Node.js engine version '${nodeEngine}' specified in package.json is old or a non-LTS version. Platform defaults (such as Vercel Node 20) may conflict or cause deployment warnings.`
      });
    }
  }

  // Conflict Check: PEER_DEPENDENCY_RISK
  const reactVerStr = packageJson.dependencies?.react || packageJson.devDependencies?.react;
  const nextVerStr = packageJson.dependencies?.next || packageJson.devDependencies?.next;

  if (reactVerStr) {
    const reactMajor = getMajorVersion(reactVerStr);
    if (reactMajor !== null && reactMajor >= 18) {
      // React 18+ risks
      if (declaredDeps.has('@material-ui/core')) {
        conflicts.push({
          type: 'PEER_DEPENDENCY_RISK',
          severity: 'medium',
          filePath: 'package.json',
          description: 'React 18 detected alongside @material-ui/core (v4). Material UI v4 does not officially support React 18 peer dependencies; you may need to use --legacy-peer-deps or upgrade to @mui/material (v5).'
        });
      }
      if (declaredDeps.has('react-beautiful-dnd')) {
        conflicts.push({
          type: 'PEER_DEPENDENCY_RISK',
          severity: 'low',
          filePath: 'package.json',
          description: 'React 18 concurrent rendering and StrictMode can conflict with react-beautiful-dnd. Consider upgrading to @hello-pangea/dnd or disabling StrictMode.'
        });
      }
      const testingLibraryReactVer = packageJson.devDependencies?.['@testing-library/react'] || packageJson.dependencies?.['@testing-library/react'];
      if (testingLibraryReactVer) {
        const testReactMajor = getMajorVersion(testingLibraryReactVer);
        if (testReactMajor !== null && testReactMajor < 13) {
          conflicts.push({
            type: 'PEER_DEPENDENCY_RISK',
            severity: 'medium',
            filePath: 'package.json',
            description: `React 18 detected with @testing-library/react v${testReactMajor}. Testing Library v13+ is required for React 18 support.`
          });
        }
      }
    }
  }

  if (nextVerStr) {
    const nextMajor = getMajorVersion(nextVerStr);
    if (nextMajor !== null && nextMajor >= 14 && reactVerStr) {
      const reactMajor = getMajorVersion(reactVerStr);
      if (reactMajor !== null && reactMajor < 18) {
        conflicts.push({
          type: 'PEER_DEPENDENCY_RISK',
          severity: 'high',
          filePath: 'package.json',
          description: `Next.js 14 requires React 18, but package.json specifies React v${reactVerStr}. This will fail to compile.`
        });
      }
    }
  }

  // Collect all unique referenced env variables
  const envVarsReferenced = Array.from(new Set(
    Object.values(referencedEnvVarsByFile).flatMap(vars => vars.map(v => v.varName))
  ));

  return {
    graph: { nodes, edges },
    conflicts,
    envVarsReferenced
  };
}
