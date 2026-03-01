#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST = path.join(ROOT, 'manifest.json');
const PKG = path.join(ROOT, 'package.json');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function bumpVersion(version, type) {
  const parts = version.split('.').map(Number);
  if (type === 'major') { parts[0]++; parts[1] = 0; parts[2] = 0; }
  else if (type === 'minor') { parts[0]; parts[1]++; parts[2] = 0; }
  else { parts[2]++; }
  return parts.join('.');
}

async function release() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const currentVersion = manifest.version;

  const patch = bumpVersion(currentVersion, 'patch');
  const minor = bumpVersion(currentVersion, 'minor');
  const major = bumpVersion(currentVersion, 'major');

  console.log(`\n\x1b[36mPlume AI — Release\x1b[0m`);
  console.log(`Version actuelle : \x1b[33m${currentVersion}\x1b[0m\n`);
  console.log(`  1) patch  → ${patch}`);
  console.log(`  2) minor  → ${minor}`);
  console.log(`  3) major  → ${major}`);
  console.log(`  4) custom`);
  console.log(`  0) annuler\n`);

  const choice = await ask('Choix [1/2/3/4/0] : ');

  let newVersion;
  if (choice === '0') { console.log('Annulé.'); process.exit(0); }
  else if (choice === '1') newVersion = patch;
  else if (choice === '2') newVersion = minor;
  else if (choice === '3') newVersion = major;
  else if (choice === '4') {
    newVersion = await ask('Version custom (ex: 2.0.0) : ');
    if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
      console.error('\x1b[31mFormat invalide. Utilisez X.Y.Z\x1b[0m');
      process.exit(1);
    }
  } else {
    console.error('\x1b[31mChoix invalide.\x1b[0m');
    process.exit(1);
  }

  const confirm = await ask(`\nPasser de \x1b[33m${currentVersion}\x1b[0m → \x1b[32m${newVersion}\x1b[0m ? (o/n) : `);
  if (confirm !== 'o' && confirm !== 'oui' && confirm !== 'y') {
    console.log('Annulé.');
    process.exit(0);
  }

  // Mettre à jour manifest.json
  manifest.version = newVersion;
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`\x1b[32m✓ manifest.json → ${newVersion}\x1b[0m`);

  // Mettre à jour package.json
  const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
  pkg.version = newVersion;
  fs.writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`\x1b[32m✓ package.json  → ${newVersion}\x1b[0m`);

  // Build le zip
  console.log(`\n\x1b[36mBuild du package...\x1b[0m`);
  execSync('node scripts/build.js', { cwd: ROOT, stdio: 'inherit' });

  // Git commit + tag
  const doGit = await ask('\nCommit + tag + push ? (o/n) : ');
  if (doGit === 'o' || doGit === 'oui' || doGit === 'y') {
    execSync(`git add manifest.json package.json`, { cwd: ROOT, stdio: 'inherit' });
    execSync(`git commit -m "Release v${newVersion}"`, { cwd: ROOT, stdio: 'inherit' });
    execSync(`git tag v${newVersion}`, { cwd: ROOT, stdio: 'inherit' });
    execSync(`git push origin main --tags`, { cwd: ROOT, stdio: 'inherit' });
    console.log(`\x1b[32m✓ Commit, tag v${newVersion} et push effectués\x1b[0m`);
  }

  console.log(`\n\x1b[32m✓ Release v${newVersion} terminée !\x1b[0m`);
  console.log(`  → Uploadez dist/plume-ai-v${newVersion}.zip sur le Chrome Web Store\n`);
}

release();
