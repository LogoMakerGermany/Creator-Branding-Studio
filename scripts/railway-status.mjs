#!/usr/bin/env node
/**
 * Railway project status via GraphQL (works when CLI SSL fails on Windows).
 * Usage: node scripts/railway-status.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const configPath = path.join(os.homedir(), '.railway', 'config.json');
if (!existsSync(configPath)) {
  console.error('No ~/.railway/config.json — run: npm run railway:login');
  process.exit(1);
}

const token = JSON.parse(readFileSync(configPath, 'utf8')).user?.token;
if (!token) {
  console.error('Not logged in to Railway');
  process.exit(1);
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function gql(query, variables = {}) {
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

const me = await gql(`query { me { email } }`);
console.log(`Railway user: ${me.me.email}`);

const root = await gql(`
  query {
    projects { edges { node { id name } } }
  }
`);

const ids = new Map();
for (const { node } of root.projects?.edges || []) {
  ids.set(node.id, node.name);
}

if (!ids.size) {
  console.log('\nKeine Projekte gefunden. Im Railway Dashboard prüfen oder: npm run railway:link');
  process.exit(0);
}

for (const [id, name] of ids) {
  const detail = await gql(
    `query($id: String!) {
      project(id: $id) {
        name
        services { edges { node {
          id name
          serviceInstances { edges { node {
            domains { serviceDomains { domain } customDomains { domain } }
            latestDeployment { status }
          } } }
        } } }
      }
    }`,
    { id }
  );

  console.log(`\nProject: ${detail.project.name}`);
  for (const { node: service } of detail.project.services.edges) {
    console.log(`  Service: ${service.name} (${service.id})`);
    for (const { node: inst } of service.serviceInstances.edges) {
      if (inst.latestDeployment) {
        console.log(`    Status: ${inst.latestDeployment.status}`);
      }
      for (const d of inst.domains?.serviceDomains || []) {
        if (d.domain) console.log(`    URL: https://${d.domain}`);
      }
      for (const d of inst.domains?.customDomains || []) {
        if (d.domain) console.log(`    Custom: https://${d.domain}`);
      }
    }
  }
}
