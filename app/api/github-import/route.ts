import { NextResponse } from 'next/server';
import { callLLMUnified, cleanAndParseJSON } from '@/lib/api-keys';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { repoUrl } = await request.json();

    if (!repoUrl) {
      return NextResponse.json({ error: 'Missing repoUrl parameter.' }, { status: 400 });
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
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }

    const fetchGithub = async (url: string) => {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        if (res.status === 404) throw new Error(`Not Found: ${url}. (If it's private, you need a GITHUB_TOKEN)`);
        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          throw new Error(`Forbidden / Rate Limited: ${body.message || res.statusText}`);
        }
        throw new Error(`GitHub API error: ${res.statusText}`);
      }
      return res.json();
    };

    // Parallel fetch for speed
    const [repoData, readmeData, openIssues, closedIssues, commits] = await Promise.all([
      fetchGithub(`https://api.github.com/repos/${owner}/${repo}`).catch(e => { throw e; }), // Repo meta is required
      fetchGithub(`https://api.github.com/repos/${owner}/${repo}/readme`).catch(() => null), // README optional
      fetchGithub(`https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=10&sort=created`).catch(() => []),
      fetchGithub(`https://api.github.com/repos/${owner}/${repo}/issues?state=closed&per_page=10&sort=created`).catch(() => []),
      fetchGithub(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=30`).catch(() => [])
    ]);

    let readmeText = 'No README found.';
    if (readmeData && readmeData.content) {
      readmeText = Buffer.from(readmeData.content, 'base64').toString('utf8');
      if (readmeText.length > 15000) readmeText = readmeText.slice(0, 15000) + '... (truncated)';
    }

    // Build timeline
    const timelineItems: { date: number, type: 'commit' | 'issue_opened' | 'issue_closed', text: string }[] = [];

    // Commits (usually newest-first, we'll sort later anyway)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of commits as any[]) {
      if (c.commit && c.commit.author && c.commit.author.date) {
        timelineItems.push({
          date: new Date(c.commit.author.date).getTime(),
          type: 'commit',
          text: `Commit (${c.sha.slice(0, 7)}): ${c.commit.message.split('\\n')[0]}`
        });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const i of openIssues as any[]) {
      timelineItems.push({
        date: new Date(i.created_at).getTime(),
        type: 'issue_opened',
        text: `Issue opened [#${i.number}]: ${i.title}`
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const i of closedIssues as any[]) {
      timelineItems.push({
        date: new Date(i.created_at).getTime(),
        type: 'issue_opened',
        text: `Issue opened [#${i.number}]: ${i.title}`
      });
      if (i.closed_at) {
        timelineItems.push({
          date: new Date(i.closed_at).getTime(),
          type: 'issue_closed',
          text: `Issue closed [#${i.number}]: ${i.title}`
        });
      }
    }

    // Sort chronologically (oldest to newest)
    timelineItems.sort((a, b) => a.date - b.date);

    const timelineText = timelineItems.length > 0 
      ? timelineItems.map(item => `[${new Date(item.date).toISOString().split('T')[0]}] ${item.type.toUpperCase()}: ${item.text}`).join('\\n')
      : 'No timeline data available.';

    const prompt = `You are an expert product manager. I am giving you raw information about a GitHub repository. Your task is to synthesize product inputs based ONLY on this real repo data.

Repository Name: ${owner}/${repo}
Description: ${repoData.description || 'No description'}
Topics: ${repoData.topics?.join(', ') || 'None'}

--- README ---
${readmeText}

--- CHRONOLOGICAL TIMELINE (Commits and Issues) ---
${timelineText}

Synthesize the following four text blocks:
1. "prd": A plausible PRD-style summary (goals, key claims, assumptions, success metrics) inferred from the README and repo description. Look for PATTERNS in the timeline and note assumptions with their approximate "introduced" timeframe if inferable from commit messages (e.g. "Assumption: bot can auto-close tickets (introduced ~3 commits ago, contradicted by issue opened 2 weeks later)").
2. "featureRequests": A feature requests list inferred from open issues that read like feature requests.
3. "feedback": A feedback/signals summary inferred from closed issues and bug-report-style open issues. Pay special attention to cases where feedback temporally CONTRADICTS something that was committed before it (a "decision fossil").
4. "timelineInsight": A short 1-2 sentence summary specifically calling out the most significant temporal contradiction found in the timeline (e.g. "The auto-close feature was committed on March 3rd; by March 18th three issues had been opened directly describing failures caused by it, with no follow-up commits addressing the root cause."). If no contradiction exists, provide a brief summary of the project's recent trajectory.

CRITICAL INSTRUCTION: Clearly note when you are inferring something vs when it is explicitly stated in the repo, so the synthesis feels grounded and not fabricated.

Return ONLY valid JSON matching this format:
{
  "prd": "text here...",
  "featureRequests": "text here...",
  "feedback": "text here...",
  "timelineInsight": "text here..."
}
Do not include any markdown formatting blocks like \`\`\`json outside the JSON object. Just the raw JSON.`;

    interface GithubImportParsedResponse {
      prd: string;
      featureRequests: string;
      feedback: string;
      timelineInsight?: string;
    }

    let parsed: GithubImportParsedResponse | null = null;
    let attempts = 0;
    while (attempts < 2) {
      attempts++;
      try {
        const text = await callLLMUnified({ prompt, jsonMode: true, temperature: 0.2 });
        parsed = cleanAndParseJSON(text) as GithubImportParsedResponse;
        if (parsed && typeof parsed === 'object' && parsed.prd && parsed.featureRequests && parsed.feedback) {
          break; // Valid!
        } else {
          throw new Error('Invalid JSON shape.');
        }
      } catch {
        if (attempts >= 2) throw new Error('Failed to parse LLM synthesis as JSON.');
      }
    }

    if (!parsed) {
      throw new Error('Failed to parse LLM synthesis as JSON.');
    }

    return NextResponse.json({
      repoName: `${owner}/${repo}`,
      prd: parsed.prd,
      featureRequests: parsed.featureRequests,
      feedback: parsed.feedback,
      timelineInsight: parsed.timelineInsight
    });
  } catch (error: unknown) {
    console.error('GitHub Import API error:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
