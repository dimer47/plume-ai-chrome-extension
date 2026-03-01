# Plume AI – Extension Chrome

Extension Chrome d'assistant d'écriture IA. Générez et affinez du texte avec Claude (Anthropic) ou OpenAI directement dans vos zones de texte.

## Installation

1. Décompressez le fichier `ai-writer-extension.zip`
2. Ouvrez Chrome → `chrome://extensions/`
3. Activez le **Mode développeur** (en haut à droite)
4. Cliquez **Charger l'extension non empaquetée**
5. Sélectionnez le dossier `ai-writer-extension`

## Configuration

1. Cliquez sur l'icône de l'extension dans la barre Chrome
2. Choisissez votre fournisseur : **Claude** ou **OpenAI**
3. Entrez votre clé API :
   - Claude : obtenir sur https://console.anthropic.com/
   - OpenAI : obtenir sur https://platform.openai.com/api-keys
4. Choisissez le modèle souhaité
5. (Optionnel) Ajoutez des instructions personnalisées
6. Cliquez **Sauvegarder**

## Utilisation

### Bouton ✨
Quand vous cliquez dans une zone de texte (Gmail, formulaire, etc.), un bouton **✨** apparaît. Cliquez dessus pour ouvrir la modale de génération.

### Raccourci clavier
`Ctrl+Shift+G` (ou `Cmd+Shift+G` sur Mac) pour ouvrir la modale depuis n'importe quelle zone de texte.

### Dans la modale
1. **Décrivez** ce que vous voulez : *"Écris un mail pro pour demander un congé le 15 mars"*
2. Le texte est généré et affiché
3. **Affinez** en continuant la conversation : *"Rends le ton plus formel"*, *"Ajoute une phrase de remerciement"*
4. Quand le résultat vous convient :
   - **Insérer** → place le texte dans la zone de texte
   - **Copier** → copie dans le presse-papier
5. **Nouveau** → recommencer une conversation

## Fonctionnalités

- Support **Claude** (Sonnet 4.5, Haiku 4.5, Opus 4.5) et **OpenAI** (GPT-4o, GPT-4o Mini, GPT-4 Turbo)
- Conversation multi-tours pour affiner le résultat
- Détection automatique du texte existant dans le champ
- Insertion directe compatible Gmail, Outlook web, formulaires classiques, éditeurs contentEditable
- Instructions personnalisées persistantes
- Streaming temps réel (affichage progressif du texte)
- Interface sombre et élégante
