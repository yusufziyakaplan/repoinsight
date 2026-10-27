import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataPath = join(dataDir, 'data.json');
const historyPath = join(dataDir, 'history.json');
const token = process.env.GITHUB_TOKEN;

if (!token) throw new Error('GITHUB_TOKEN is required (use the workflow GITHUB_TOKEN).');

async function fetchSearch(topic, rising) {
    const params = new URLSearchParams({
        q: `topic:${topic}${rising ? ' stars:100..10000' : ''}`,
        sort: rising ? 'updated' : 'stars',
        order: 'desc',
        per_page: '100',
    });
    const url = `https://api.github.com/search/repositories?${params}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await fetch(url, {
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${token}`,
                'X-GitHub-Api-Version': '2022-11-28',
            },
        });
        const body = await response.json();
        if (response.ok) return body.items ?? [];

        const retryAfter = Number(response.headers.get('retry-after'));
        const resetAt = Number(response.headers.get('x-ratelimit-reset')) * 1000;
        const waitMs = retryAfter > 0
            ? retryAfter * 1000
            : (response.headers.get('x-ratelimit-remaining') === '0' && resetAt > Date.now()
                ? resetAt - Date.now()
                : Math.min(60_000, 2_000 * (2 ** attempt)));

        if (![403, 429, 500, 502, 503, 504].includes(response.status) || attempt === 4) {
            throw new Error(`GitHub Search API ${response.status}: ${body.message ?? 'request failed'}`);
        }
        console.warn(`GitHub API ${response.status}; retrying in ${Math.ceil(waitMs / 1000)} seconds.`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    throw new Error('GitHub Search API retry limit reached.');
}

const found = new Map();
for (const rising of [false, true]) {
    const modeRepos = new Map();
    for (const topic of ['llm', 'rag']) {
        for (const repo of await fetchSearch(topic, rising)) {
            const entry = modeRepos.get(repo.full_name) ?? { repo, topics: new Set() };
            entry.repo = repo;
            entry.topics.add(topic);
            modeRepos.set(repo.full_name, entry);
        }
    }

    const ranked = [...modeRepos.values()].sort((a, b) => rising
        ? String(b.repo.updated_at ?? '').localeCompare(String(a.repo.updated_at ?? ''))
        : (b.repo.stargazers_count ?? 0) - (a.repo.stargazers_count ?? 0)).slice(0, 100);

    for (const { repo, topics } of ranked) {
        const entry = found.get(repo.full_name) ?? { repo, topics: new Set(), top: false, rise: false };
        entry.repo = repo;
        entry.top ||= !rising;
        entry.rise ||= rising;
        topics.forEach((topic) => entry.topics.add(topic));
        found.set(repo.full_name, entry);
    }
}

const repos = [...found.values()].map(({ repo, topics, top, rise }) => ({
    n: repo.full_name,
    d: repo.description,
    u: repo.html_url,
    t: [...new Set([...(repo.topics ?? []), ...topics])],
    l: repo.language,
    lc: repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : null,
    s: repo.stargazers_count ?? 0,
    f: repo.forks_count ?? 0,
    i: repo.open_issues_count ?? 0,
    top,
    rise,
    push: repo.pushed_at,
    born: repo.created_at,
    tr: null,
    trd: null,
}));

let history = {};
try {
    history = JSON.parse(await readFile(historyPath, 'utf8'));
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}

const now = new Date();
const today = now.toISOString().slice(0, 10);
const cutoff = new Date(now.getTime() - 60 * 86_400_000).toISOString().slice(0, 10);
history[today] = Object.fromEntries(repos.map((repo) => [repo.n, repo.s]));
for (const day of Object.keys(history)) if (day < cutoff) delete history[day];

const since = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
for (const repo of repos) {
    const previousDay = Object.keys(history)
        .filter((day) => day >= since && day < today && history[day][repo.n] !== undefined)
        .sort()[0];
    if (previousDay) {
        repo.tr = repo.s - history[previousDay][repo.n];
        repo.trd = Math.max(1, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${previousDay}T00:00:00Z`)) / 86_400_000));
    }
}

const data = {
    repos,
    syncedAt: now.toISOString(),
    hasHistory: repos.some((repo) => repo.tr !== null),
};

const dataTemp = `${dataPath}.tmp`;
const historyTemp = `${historyPath}.tmp`;
await Promise.all([
    writeFile(dataTemp, `${JSON.stringify(data, null, 2)}\n`),
    writeFile(historyTemp, `${JSON.stringify(history, null, 2)}\n`),
]);
await Promise.all([rename(dataTemp, dataPath), rename(historyTemp, historyPath)]);
console.log(`Updated ${repos.length} repositories at ${data.syncedAt}.`);
