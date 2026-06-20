import { NextResponse } from 'next/server';
import { buildDependencyGraphAndConflicts, Conflict } from '@/lib/code-graph';
import { callLLMUnified, cleanAndParseJSON } from '@/lib/api-keys';

export const dynamic = 'force-dynamic';

interface ParsedPackageJson {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  engines: Record<string, string> | null;
  scripts: Record<string, string>;
}

interface GitHubTreeItem {
  path: string;
  type: string;
  sha: string;
  url: string;
  mode?: string;
  size?: number;
}

interface ExplainedConflict {
  originalConflict: Conflict;
  platformSpecificExplanation: string;
  suggestedFix: string;
  severity: 'high' | 'medium' | 'low';
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { repoUrl, targetPlatform, mockConflicts } = body;

    if (!repoUrl) {
      return NextResponse.json({ error: 'Missing repoUrl parameter.' }, { status: 400 });
    }

    const platform = targetPlatform || 'vercel';
    console.log('Code analysis target platform:', platform);

    // If mockConflicts is true, bypass API calls to prevent rate limits
    if (mockConflicts === true) {
      console.log('Bypassing GitHub API calls and using simulated repository files...');
      
      const mockPackageJson = {
        dependencies: {
          'next': '^14.1.0',
          'react': '^18.2.0',
          'react-dom': '^18.2.0',
          '@material-ui/core': '^4.12.4',
          'lodash': '^4.17.21'
        },
        devDependencies: {
          'typescript': '^5.3.3',
          '@types/react': '^18.2.48'
        },
        peerDependencies: {},
        engines: {
          'node': '<14'
        },
        scripts: {
          'dev': 'next dev',
          'build': 'next build'
        }
      };

      const mockFileContents = [
        {
          path: 'app/page.tsx',
          content: `'use client';\nimport React from 'react';\nimport RoadmapView from '@/components/RoadmapView';\nimport { fetchData } from '@/lib/utils';\nexport default function Page() {\n  return <RoadmapView />;\n}`
        },
        {
          path: 'components/RoadmapView.tsx',
          content: `'use client';\nimport React from 'react';\nimport fs from 'fs';\nexport default function RoadmapView() {\n  return <div>Roadmap module</div>;\n}`
        },
        {
          path: 'lib/api-keys.ts',
          content: `export const stripeKey = process.env.STRIPE_SECRET_KEY;\nexport const nextAuthSecret = process.env.NEXTAUTH_SECRET;`
        },
        {
          path: 'lib/utils.ts',
          content: `import lodash from 'lodash';\nexport function fetchData() { return []; }`
        }
      ];

      const mockSortedPaths = mockFileContents.map(f => f.path);
      const mockEnvExample = 'STRIPE_SECRET_KEY=\nAPI_KEY=';

      // Build dependency graph and detect conflicts
      const { graph, conflicts } = buildDependencyGraphAndConflicts(
        mockFileContents,
        mockPackageJson,
        mockEnvExample,
        platform
      );

      let explainedConflicts: ExplainedConflict[] = [];
      let summaryText = `No structural conflicts or deployment risks were detected in the codebase for target platform ${platform}.`;

      if (conflicts.length > 0) {
        const prompt = `You are a deployment intelligence expert specialized in analyzing platform compatibility conflicts.
You will be given a list of ALREADY-DETECTED structural conflicts found via static analysis. Do not invent new conflicts.
For each conflict given, explain specifically why it matters for deployment on the target platform: ${platform}, and give one concrete fix.
If a conflict type doesn't apply meaningfully to this platform, say so explicitly rather than padding the explanation.

Target Platform: ${platform}
Package.json Dependencies: ${JSON.stringify(mockPackageJson.dependencies, null, 2)}
Package.json devDependencies: ${JSON.stringify(mockPackageJson.devDependencies, null, 2)}
Package.json engines: ${JSON.stringify(mockPackageJson.engines, null, 2)}

List of Detected Conflicts:
${JSON.stringify(conflicts, null, 2)}

Return ONLY valid JSON matching this format:
{
  "explainedConflicts": [
    {
      "originalConflict": {
        "type": "string",
        "severity": "high" | "medium" | "low",
        "filePath": "string | null",
        "description": "string",
        "lineHint": "string (optional)"
      },
      "platformSpecificExplanation": "explain specifically why it matters for deployment on ${platform}",
      "suggestedFix": "give one concrete fix",
      "severity": "high" | "medium" | "low"
    }
  ],
  "summary": "a short 1-2 sentence overall summary of the deployment readiness and conflicts"
}
Do not include any markdown formatting blocks like \`\`\`json outside the JSON object. Just the raw JSON.`;

        try {
          const text = await callLLMUnified({ prompt, jsonMode: true, temperature: 0.2 });
          const parsed = cleanAndParseJSON(text);
          if (parsed && typeof parsed === 'object') {
            explainedConflicts = parsed.explainedConflicts || [];
            summaryText = parsed.summary || 'Deployment analysis completed.';
          }
        } catch (err: unknown) {
          console.error('Failed to parse LLM explanation:', err);
          explainedConflicts = conflicts.map((c) => ({
            originalConflict: c,
            platformSpecificExplanation: `Static analysis detected a compatibility conflict of type ${c.type}. This might lead to build errors or runtime exceptions in edge environments on ${platform}.`,
            suggestedFix: `Update ${c.filePath || 'package.json'} and adjust code to platform requirements.`,
            severity: c.severity
          }));
          summaryText = 'Structural conflicts were found, but platform-specific explanation could not be completed due to an LLM error.';
        }
      }

      // Calculate readiness score
      let score = 100;
      for (const c of conflicts) {
        if (c.severity === 'high') {
          score -= 30;
        } else if (c.severity === 'medium') {
          score -= 15;
        } else if (c.severity === 'low') {
          score -= 5;
        }
      }
      const deploymentReadinessScore = Math.max(0, score);

      return NextResponse.json({
        packageJson: mockPackageJson,
        fileTree: mockSortedPaths,
        fileContents: mockFileContents,
        graph,
        conflicts,
        explainedConflicts,
        deploymentReadinessScore,
        summary: `[Simulated Repo Mode] ${summaryText}`
      });
    }

    // Parse owner and repo from github URL
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      return NextResponse.json({ error: 'Invalid GitHub URL. Must be in the format https://github.com/owner/repo' }, { status: 400 });
    }

    const owner = match[1];
    let repo = match[2];
    if (repo.endsWith('.git')) repo = repo.slice(0, -4);

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Product-Council-AI'
    };

    if (process.env.GITHUB_TOKEN) {
      // GitHub token can be passed as Bearer or token
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }

    const fetchGithub = async (url: string) => {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        if (res.status === 403 || res.status === 429) {
          const rateLimitRemaining = res.headers.get('x-ratelimit-remaining');
          if (rateLimitRemaining === '0' || res.status === 429) {
            throw new Error('GitHub API rate limit reached — add a GITHUB_TOKEN to .env.local for higher limits.');
          }
        }
        if (res.status === 404) {
          throw new Error(`Not Found: ${url}. (If it is private, make sure your GITHUB_TOKEN has access)`);
        }
        const bodyData = await res.json().catch(() => ({}));
        throw new Error(bodyData.message || `GitHub API error: ${res.statusText}`);
      }
      return res.json();
    };

    // 1. Fetch repository metadata to get the default branch name
    const repoMeta = await fetchGithub(`https://api.github.com/repos/${owner}/${repo}`);
    const defaultBranch = repoMeta.default_branch || 'main';

    // 2. Fetch package.json
    let parsedPackageJson: ParsedPackageJson = {
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
      engines: null,
      scripts: {}
    };

    try {
      const packageJsonData = await fetchGithub(`https://api.github.com/repos/${owner}/${repo}/contents/package.json`);
      if (packageJsonData && packageJsonData.content) {
        const decoded = Buffer.from(packageJsonData.content, 'base64').toString('utf8');
        const parsed = JSON.parse(decoded);
        parsedPackageJson = {
          dependencies: parsed.dependencies || {},
          devDependencies: parsed.devDependencies || {},
          peerDependencies: parsed.peerDependencies || {},
          engines: parsed.engines || null,
          scripts: parsed.scripts || {}
        };
      }
    } catch (e: unknown) {
      const err = e as Error;
      console.warn('Failed to fetch/parse package.json:', err.message);
    }

    // 3. Fetch full recursive file tree
    const treeResponse = await fetchGithub(`https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`);
    const fullTree: GitHubTreeItem[] = treeResponse.tree || [];

    // Check if .env.example exists in the repository
    const hasEnvExample = fullTree.some((item: GitHubTreeItem) => item.path === '.env.example');
    let envExampleContent: string | null = null;
    if (hasEnvExample) {
      try {
        const fileData = await fetchGithub(`https://api.github.com/repos/${owner}/${repo}/contents/.env.example`);
        if (fileData && fileData.content) {
          envExampleContent = Buffer.from(fileData.content, 'base64').toString('utf8');
        }
      } catch (err: unknown) {
        console.warn('Failed to fetch .env.example:', (err as Error).message);
      }
    }

    // Filter relevant files
    const excludedDirs = ['node_modules', '.git', 'dist', 'build', '.next'];
    
    const isPathExcluded = (path: string): boolean => {
      const parts = path.toLowerCase().split('/');
      return parts.some(part => excludedDirs.includes(part));
    };

    const isCodeFile = (path: string): boolean => {
      const ext = path.toLowerCase().split('.').pop();
      return ext ? ['js', 'jsx', 'ts', 'tsx'].includes(ext) : false;
    };

    // Keep only files (blobs), match extensions, exclude node_modules etc.
    const filteredPaths: string[] = fullTree
      .filter((item: GitHubTreeItem) => item.type === 'blob' && isCodeFile(item.path) && !isPathExcluded(item.path))
      .map((item: GitHubTreeItem) => item.path);

    // Sort paths prioritizing /app, /src, /pages, /api directories first
    const priorityDirs = ['app', 'src', 'pages', 'api'];
    
    const getFileScore = (path: string): number => {
      const parts = path.toLowerCase().split('/');
      // Find index of first match with priorityDirs
      const index = priorityDirs.findIndex(dir => parts.includes(dir));
      if (index !== -1) {
        return index; // e.g. 'app' -> 0, 'src' -> 1, 'pages' -> 2, 'api' -> 3
      }
      return 100; // other folders/files
    };

    const sortedPaths = [...filteredPaths].sort((a, b) => {
      const scoreA = getFileScore(a);
      const scoreB = getFileScore(b);
      if (scoreA !== scoreB) {
        return scoreA - scoreB;
      }
      return a.localeCompare(b);
    });

    // Cap at 40 files max
    const selectedPaths = sortedPaths.slice(0, 40);

    // 4. Fetch raw content for each selected file (up to the cap)
    const fileContentsPromises = selectedPaths.map(async (path) => {
      try {
        const fileData = await fetchGithub(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`);
        let content = '';
        if (fileData && fileData.content) {
          content = Buffer.from(fileData.content, 'base64').toString('utf8');
        }
        return { path, content };
      } catch (err: unknown) {
        const error = err as Error;
        console.error(`Error fetching file content for ${path}:`, error.message);
        // If it's a rate-limit error, we want to bubble it up
        if (error.message && error.message.includes('rate limit reached')) {
          throw error;
        }
        return { path, content: `Error fetching content: ${error.message}` };
      }
    });

    const fileContents = await Promise.all(fileContentsPromises);

    // 5. Build dependency graph and detect conflicts
    const { graph, conflicts } = buildDependencyGraphAndConflicts(
      fileContents,
      parsedPackageJson,
      envExampleContent,
      platform
    );

    // Inject mock conflicts if requested for end-to-end LLM validation
    if (mockConflicts === true) {
      conflicts.push(
        {
          type: 'NODE_BUILTIN_IN_CLIENT_CODE',
          severity: 'high',
          filePath: 'components/RoadmapView.tsx',
          description: "Client-side component imports Node.js built-in module 'fs', which will fail to compile/run in the browser or Edge runtime.",
          lineHint: "import fs from 'fs';"
        },
        {
          type: 'MISSING_ENV_VAR',
          severity: 'medium',
          filePath: 'lib/api-keys.ts',
          description: "Environment variable 'STRIPE_SECRET_KEY' is referenced in code but missing from '.env.example'.",
          lineHint: "process.env.STRIPE_SECRET_KEY"
        },
        {
          type: 'ENGINE_MISMATCH',
          severity: 'medium',
          filePath: 'package.json',
          description: "Node.js engine version '<14' specified in package.json is old or a non-LTS version. Platform defaults (such as Vercel Node 20) may conflict or cause deployment warnings."
        }
      );
    }

    // 6. Targeted LLM call to explain conflicts in platform-specific terms (only if conflicts exist)
    let explainedConflicts: ExplainedConflict[] = [];
    let summary = `No structural conflicts or deployment risks were detected in the codebase for target platform ${platform}.`;

    if (conflicts.length > 0) {
      const prompt = `You are a deployment intelligence expert specialized in analyzing platform compatibility conflicts.
You will be given a list of ALREADY-DETECTED structural conflicts found via static analysis. Do not invent new conflicts.
For each conflict given, explain specifically why it matters for deployment on the target platform: ${platform}, and give one concrete fix.
If a conflict type doesn't apply meaningfully to this platform, say so explicitly rather than padding the explanation.

Target Platform: ${platform}
Package.json Dependencies: ${JSON.stringify(parsedPackageJson.dependencies, null, 2)}
Package.json devDependencies: ${JSON.stringify(parsedPackageJson.devDependencies, null, 2)}
Package.json engines: ${JSON.stringify(parsedPackageJson.engines, null, 2)}

List of Detected Conflicts:
${JSON.stringify(conflicts, null, 2)}

Return ONLY valid JSON matching this format:
{
  "explainedConflicts": [
    {
      "originalConflict": {
        "type": "string",
        "severity": "high" | "medium" | "low",
        "filePath": "string | null",
        "description": "string",
        "lineHint": "string (optional)"
      },
      "platformSpecificExplanation": "explain specifically why it matters for deployment on ${platform}",
      "suggestedFix": "give one concrete fix",
      "severity": "high" | "medium" | "low"
    }
  ],
  "summary": "a short 1-2 sentence overall summary of the deployment readiness and conflicts"
}
Do not include any markdown formatting blocks like \`\`\`json outside the JSON object. Just the raw JSON.`;

      try {
        const text = await callLLMUnified({ prompt, jsonMode: true, temperature: 0.2 });
        const parsed = cleanAndParseJSON(text);
        if (parsed && typeof parsed === 'object') {
          explainedConflicts = parsed.explainedConflicts || [];
          summary = parsed.summary || 'Deployment analysis completed.';
        }
      } catch (err: unknown) {
        console.error('Failed to parse LLM explanation:', err);
        // Fallback logic
        explainedConflicts = conflicts.map((c) => ({
          originalConflict: c,
          platformSpecificExplanation: `Static analysis detected a conflict of type ${c.type}. This might lead to compatibility or build issues on ${platform}.`,
          suggestedFix: `Inspect ${c.filePath || 'package.json'} and verify compatibility.`,
          severity: c.severity
        }));
        summary = 'Structural conflicts were found, but platform-specific explanation could not be completed due to a backend error.';
      }
    }

    // 7. Calculate overall readiness score in code
    let score = 100;
    for (const c of conflicts) {
      if (c.severity === 'high') {
        score -= 30;
      } else if (c.severity === 'medium') {
        score -= 15;
      } else if (c.severity === 'low') {
        score -= 5;
      }
    }
    const deploymentReadinessScore = Math.max(0, score);

    return NextResponse.json({
      packageJson: parsedPackageJson,
      fileTree: sortedPaths, // Return the full sorted filtered tree
      fileContents: fileContents,
      graph,
      conflicts,
      explainedConflicts,
      deploymentReadinessScore,
      summary
    });

  } catch (error: unknown) {
    console.error('Code Analysis API error:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    
    // Determine status code
    let status = 500;
    if (errMsg.includes('Invalid GitHub URL') || errMsg.includes('Missing repoUrl')) {
      status = 400;
    } else if (errMsg.includes('rate limit reached')) {
      status = 403;
    } else if (errMsg.includes('Not Found')) {
      status = 404;
    }

    return NextResponse.json({ error: errMsg }, { status });
  }
}
