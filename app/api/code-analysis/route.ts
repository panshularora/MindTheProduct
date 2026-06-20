import { NextResponse } from 'next/server';
import { buildDependencyGraphAndConflicts } from '@/lib/code-graph';

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

export async function POST(request: Request) {
  try {
    const { repoUrl, targetPlatform } = await request.json();

    if (!repoUrl) {
      return NextResponse.json({ error: 'Missing repoUrl parameter.' }, { status: 400 });
    }

    // Log targetPlatform to avoid unused variable warning
    console.log('Code analysis target platform:', targetPlatform);

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
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `GitHub API error: ${res.statusText}`);
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
      // package.json is optional if repo is not node-based, but we will return empty shapes
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
      targetPlatform || 'vercel'
    );

    return NextResponse.json({
      packageJson: parsedPackageJson,
      fileTree: sortedPaths, // Return the full sorted filtered tree
      fileContents: fileContents,
      graph,
      conflicts
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
