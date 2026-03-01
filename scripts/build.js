#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST = path.join(ROOT, 'manifest.json');
const DIST = path.join(ROOT, 'dist');

const FILES = [
  'manifest.json',
  'background.js',
  'content.js',
  'content.css',
  'popup.html',
  'popup.js',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png',
];

function build() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const version = manifest.version;
  const zipName = `plume-ai-v${version}.zip`;
  const zipPath = path.join(DIST, zipName);

  // Créer le dossier dist
  if (!fs.existsSync(DIST)) fs.mkdirSync(DIST);

  // Vérifier que tous les fichiers existent
  for (const file of FILES) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) {
      console.error(`\x1b[31mErreur : fichier manquant → ${file}\x1b[0m`);
      process.exit(1);
    }
  }

  // Supprimer l'ancien zip si existant
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  // Créer le zip
  const fileList = FILES.join(' ');
  execSync(`cd "${ROOT}" && zip -r "${zipPath}" ${fileList}`, { stdio: 'inherit' });

  const size = (fs.statSync(zipPath).size / 1024).toFixed(1);
  console.log(`\n\x1b[32m✓ Build terminé → dist/${zipName} (${size} Ko)\x1b[0m`);
  console.log(`  Version : ${version}`);
}

build();
