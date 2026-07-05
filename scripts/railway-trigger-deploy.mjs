#!/usr/bin/env node
/**
 * Link UCBS repo to Railway project and trigger deploy (Windows SSL workaround).
 * Usage: node scripts/railway-trigger-deploy.mjs [--vars]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const configPath = path.join(os.homedir(), '.railway', 'config.json');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const pushVars = process.argv.includes('--vars');

function loadConfig() {
  if (!existsSync(configPath)) {
    console.error('No ~/.railway/config.json — run: npm run railway:login');
    process.exit(1);
  }
  return JSON.parse(readFileSync(configPath, 'utf8'));
}

function saveLink(cfg, projectId, environmentId, serviceId) {
  cfg.projects ??= {};
  cfg.projects[root] = { project: projectId, environment: environmentId, service: serviceId };
  writeFileSync(configPath, JSON.stringify(cfg, null, 2));
  console.log('Linked project to this directory.');
}

async function gql(token, query, variables = {}) {
  const res = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors?.length) {
    throw new Error(data.errors.map((e) => e.message).join('; '));
  }
  return data.data;
}

function collectProjects(data) {
  const out = [];
  for (const ws of data.me?.workspaces ?? []) {
    if (!ws) continue;
    for (const { node: p } of ws.projects?.edges ?? []) {
      if (p?.id) out.push({ ...p, workspace: ws.name ?? 'workspace' });
    }
  }
  for (const { node: p } of data.projects?.edges ?? []) {
    if (p?.id && !out.some((x) => x.id === p.id)) out.push({ ...p, workspace: 'default' });
  }
  return out;
}

function pickProject(projects) {
  const hints = ['creator', 'branding', 'ultimate', 'ucbs'];
  const scored = projects.map((p) => {
    const name = p.name.toLowerCase();
    const score = hints.reduce((s, h) => s + (name.includes(h) ? 1 : 0), 0);
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.p ?? projects[0];
}

/** Override via RAILWAY_GITHUB_REPO=owner/repo */
const GITHUB_REPO = process.env.RAILWAY_GITHUB_REPO ?? 'LogoMakerGermany/Creator-Branding-Studio';
const GITHUB_BRANCH = process.env.RAILWAY_GITHUB_BRANCH ?? 'main';

async function fetchLatestGithubCommitSha() {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/commits/${GITHUB_BRANCH}`,
    { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ucbs-railway-trigger' } }
  );
  if (!res.ok) {
    throw new Error(`GitHub commit lookup failed (${res.status}) for ${GITHUB_REPO}@${GITHUB_BRANCH}`);
  }
  const data = await res.json();
  const sha = data.sha?.slice(0, 7);
  const message = (data.commit?.message ?? '').split('\n')[0];
  console.log(`GitHub ${GITHUB_BRANCH}: ${sha} — ${message}`);
  return data.sha;
}

async function main() {
  const cfg = loadConfig();
  const token = cfg.user?.token;
  if (!token) {
    console.error('Not logged in to Railway');
    process.exit(1);
  }

  const me = await gql(
    token,
    `query {
      me { email
        workspaces { id name projects { edges { node { id name } } } }
      }
      projects { edges { node { id name } } }
    }`
  );

  const projects = collectProjects(me);
  if (!projects.length) {
    console.error('No Railway projects found for this account.');
    console.error('Create/link the GitHub repo in Railway Dashboard, then re-run.');
    process.exit(1);
  }

  console.log('Projects:');
  for (const p of projects) {
    console.log(`  - ${p.name} (${p.id}) [${p.workspace}]`);
  }

  const project = pickProject(projects);
  console.log(`\nUsing project: ${project.name}`);

  const detail = await gql(
    token,
    `query($id: String!) {
      project(id: $id) {
        id name
        environments { edges { node { id name } } }
        services { edges { node { id name } } }
      }
    }`,
    { id: project.id }
  );

  const envs = detail.project?.environments?.edges?.map((e) => e.node).filter(Boolean) ?? [];
  const services = detail.project?.services?.edges?.map((e) => e.node).filter(Boolean) ?? [];
  if (!envs.length || !services.length) {
    console.error('Project has no environment or service.');
    process.exit(1);
  }

  const environment = envs.find((e) => e.name.toLowerCase() === 'production') ?? envs[0];
  const service = services.find((s) => /creator|branding|ultimate|ucbs|web|api/i.test(s.name)) ?? services[0];

  console.log(`Environment: ${environment.name}`);
  console.log(`Service: ${service.name}`);

  saveLink(cfg, project.id, environment.id, service.id);

  if (pushVars && existsSync(path.join(root, 'backend', '.env.railway'))) {
    console.log('\nSyncing non-empty variables…');
    const r = spawnSync(process.execPath, ['scripts/push-railway-vars.mjs'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, NODE_OPTIONS: '--use-system-ca' },
    });
    if (r.status !== 0) {
      console.warn('Variable sync had errors — continuing with deploy.');
    }
  }

  const commitSha = await fetchLatestGithubCommitSha();

  console.log('\nTriggering deploy (explicit GitHub commit)…');
  const deploy = await gql(
    token,
    `mutation serviceInstanceDeploy($serviceId: String!, $environmentId: String!, $commitSha: String) {
      serviceInstanceDeploy(serviceId: $serviceId, environmentId: $environmentId, commitSha: $commitSha)
    }`,
    { serviceId: service.id, environmentId: environment.id, commitSha }
  );

  const deploymentId = deploy.serviceInstanceDeploy;
  console.log(`Deploy started: ${deploymentId} (commit ${commitSha.slice(0, 7)})`);
  console.log('Check Railway Dashboard for build logs.');
  console.log('API: https://creatorbrandingstudioultimate-production.up.railway.app/health');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
