# Politique de confidentialité — Plume AI

*Dernière mise à jour : 1er mars 2026*

## Introduction

Plume AI est une extension Chrome d'assistance à l'écriture. Cette politique de confidentialité décrit comment l'extension traite les données des utilisateurs.

## Données collectées

### Données stockées localement

L'extension stocke les informations suivantes **exclusivement sur votre appareil** via `chrome.storage.local` :

- **Clé API** : la clé API que vous fournissez (Anthropic Claude ou OpenAI) pour authentifier les requêtes de génération de texte.
- **Préférences** : le fournisseur d'IA choisi, le modèle sélectionné et la vitesse de lecture audio.
- **Sessions de conversation** : l'historique de vos conversations avec l'IA, sauvegardé uniquement si vous choisissez de l'enregistrer.

Ces données ne quittent jamais votre appareil et ne sont transmises à aucun serveur tiers.

### Données transmises aux API d'IA

Lorsque vous utilisez l'extension pour générer du texte, les données suivantes sont envoyées à l'API d'IA que vous avez configurée (Anthropic ou OpenAI) :

- Votre instruction (prompt) saisie dans la modale de l'extension.
- Le contexte optionnel que vous avez choisi de fournir (texte existant dans le champ de saisie).
- L'historique de la conversation en cours pour maintenir le contexte.

Ces données sont transmises directement à l'API choisie conformément à leurs propres politiques de confidentialité :
- [Politique de confidentialité d'Anthropic](https://www.anthropic.com/privacy)
- [Politique de confidentialité d'OpenAI](https://openai.com/privacy/)

## Données NON collectées

L'extension **ne collecte pas** :

- Informations personnelles (nom, e-mail, adresse, etc.)
- Données de navigation ou historique web
- Mots de passe ou données d'authentification
- Données financières
- Données de géolocalisation
- Activité de l'utilisateur (clics, frappes clavier, mouvements de souris)
- Données de santé

## Partage de données

- **Aucune donnée n'est vendue** à des tiers.
- **Aucune donnée n'est partagée** avec des tiers, à l'exception des requêtes envoyées à l'API d'IA configurée par l'utilisateur.
- **Aucune donnée n'est utilisée** à des fins publicitaires, de profilage ou de détermination de solvabilité.

## Code distant

L'extension n'utilise aucun code distant. Tout le code JavaScript et CSS est inclus dans le package de l'extension.

## Sécurité

- Les clés API sont stockées dans `chrome.storage.local`, isolé du contexte des pages web.
- Les communications avec les API d'IA sont effectuées exclusivement via HTTPS.
- L'extension ne dispose d'aucun serveur propre et ne transmet aucune donnée à l'éditeur de l'extension.

## Autorisations

- **storage** : sauvegarder vos préférences et sessions localement.
- **activeTab** : détecter le champ de texte actif et y insérer le texte généré.
- **Accès aux hôtes** (`api.anthropic.com`, `api.openai.com`) : envoyer les requêtes de génération de texte aux API d'IA.
- **Content script sur toutes les URLs** : afficher le bouton d'activation à côté de n'importe quel champ de texte.

## Contact

Pour toute question concernant cette politique de confidentialité, vous pouvez ouvrir une issue sur le dépôt GitHub du projet : [github.com/dimer47/plume-ai-chrome-extension](https://github.com/dimer47/plume-ai-chrome-extension/issues)

## Modifications

Cette politique de confidentialité peut être mise à jour. Toute modification sera publiée dans ce fichier avec une date de mise à jour révisée.
