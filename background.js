// --- Plume AI - Background Service Worker ---
// Handles API calls to Claude and OpenAI (with streaming support)

// --- Settings handler (one-shot message) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSettings') {
    chrome.storage.local.get(['provider', 'claudeKey', 'openaiKey', 'claudeModel', 'openaiModel', 'customInstructions', 'whisperKey'], (data) => {
      sendResponse(data);
    });
    return true;
  }

  if (request.action === 'transcribe') {
    handleTranscription(request.audioData, request.mimeType).then(result => {
      sendResponse(result);
    }).catch(err => {
      sendResponse({ error: err.message || 'Erreur de transcription' });
    });
    return true;
  }
});

// --- Streaming generation via long-lived port ---
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'plume-stream') return;

  port.onMessage.addListener(async (request) => {
    if (request.action !== 'generate') return;

    try {
      const settings = await new Promise(resolve => {
        chrome.storage.local.get(['provider', 'claudeKey', 'openaiKey', 'claudeModel', 'openaiModel', 'customInstructions'], resolve);
      });

      const activeProvider = request.provider || settings.provider || 'claude';
      const customInstructions = settings.customInstructions || '';
      const systemPrompt = buildSystemPrompt(customInstructions, request.context);

      if (activeProvider === 'claude') {
        await streamClaude(port, settings.claudeKey, request.model || settings.claudeModel, systemPrompt, request.prompt, request.conversationHistory);
      } else {
        await streamOpenAI(port, settings.openaiKey, request.model || settings.openaiModel, systemPrompt, request.prompt, request.conversationHistory);
      }
    } catch (err) {
      try { port.postMessage({ type: 'error', error: err.message || 'Erreur inconnue' }); } catch (e) {}
    }
  });
});

function buildSystemPrompt(customInstructions, context) {
  let system = `Tu es un assistant d'écriture intégré dans une extension Chrome. Tu aides l'utilisateur à rédiger du texte de qualité professionnelle directement dans ses zones de texte (emails, formulaires, documents, etc.).

Règles :
- Réponds UNIQUEMENT avec le texte demandé, sans explications ni commentaires autour.
- Si l'utilisateur demande un email, écris directement l'email complet (objet si pertinent, corps).
- Adapte le ton au contexte (formel pour un email pro, décontracté pour un message personnel, etc.).
- Quand l'utilisateur demande une modification ou un affinement, retourne le texte complet modifié.
- Tu écris AU NOM DE l'utilisateur. C'est lui qui parle dans le texte que tu génères, pas les personnes mentionnées dans le contexte.

IMPORTANT — Gestion du contexte :
- Le contexte fourni ci-dessous est un texte de RÉFÉRENCE (souvent un message reçu, une conversation antérieure, un email auquel répondre, etc.).
- Tu ne dois PAS résumer ni réécrire le contexte. Tu dois rédiger la RÉPONSE de l'utilisateur à ce contexte.
- L'instruction de l'utilisateur te dit quoi répondre / quel ton adopter / quoi dire. Le contexte te donne les informations nécessaires pour que ta réponse soit pertinente et cohérente.
- Exemple : si le contexte est un email reçu et l'instruction est "réponds ok merci", tu rédiges un email de réponse poli de la part de l'utilisateur, pas un résumé de l'email reçu.`;

  if (customInstructions) {
    system += `\n\nInstructions personnalisées de l'utilisateur : ${customInstructions}`;
  }

  if (context) {
    system += `\n\n--- CONTEXTE DE RÉFÉRENCE (message reçu, conversation, texte source) ---\n${context}\n--- FIN DU CONTEXTE ---`;
  }

  return system;
}

// --- Claude Streaming ---
async function streamClaude(port, apiKey, model, systemPrompt, userPrompt, history = []) {
  if (!apiKey) throw new Error('Clé API Anthropic non configurée. Cliquez sur l\'icône de l\'extension pour la configurer.');

  const messages = [];
  if (history && history.length > 0) {
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }
  messages.push({ role: 'user', content: userPrompt });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-6',
      max_tokens: 4096,
      stream: true,
      system: systemPrompt,
      messages: messages
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Erreur API Claude (${response.status})`);
  }

  // Read SSE stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);

        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          try { port.postMessage({ type: 'chunk', text: parsed.delta.text }); } catch (e) { return; }
        }

        if (parsed.type === 'message_stop') {
          try { port.postMessage({ type: 'done', provider: 'claude' }); } catch (e) { return; }
        }

        if (parsed.type === 'error') {
          try { port.postMessage({ type: 'error', error: parsed.error?.message || 'Erreur Claude' }); } catch (e) { return; }
        }
      } catch (e) {
        // Ignore non-JSON lines (event: lines, empty lines)
      }
    }
  }

  // Ensure done is sent even if message_stop wasn't received
  try { port.postMessage({ type: 'done', provider: 'claude' }); } catch (e) {}
}

// --- OpenAI Streaming ---
async function streamOpenAI(port, apiKey, model, systemPrompt, userPrompt, history = []) {
  if (!apiKey) throw new Error('Clé API OpenAI non configurée. Cliquez sur l\'icône de l\'extension pour la configurer.');

  const messages = [{ role: 'system', content: systemPrompt }];
  if (history && history.length > 0) {
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }
  messages.push({ role: 'user', content: userPrompt });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      messages: messages,
      max_tokens: 4096,
      stream: true
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Erreur API OpenAI (${response.status})`);
  }

  // Read SSE stream
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') {
        try { port.postMessage({ type: 'done', provider: 'openai' }); } catch (e) { return; }
        continue;
      }

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          try { port.postMessage({ type: 'chunk', text: content }); } catch (e) { return; }
        }
      } catch (e) {
        // Ignore non-JSON lines
      }
    }
  }

  // Ensure done is sent
  try { port.postMessage({ type: 'done', provider: 'openai' }); } catch (e) {}
}

// --- Whisper Transcription ---
async function handleTranscription(base64Audio, mimeType) {
  const settings = await new Promise(resolve => {
    chrome.storage.local.get(['whisperKey', 'openaiKey', 'whisperModel'], resolve);
  });

  const apiKey = settings.whisperKey || settings.openaiKey;
  if (!apiKey) {
    throw new Error('Clé API OpenAI non configurée pour la dictée vocale. Configurez-la dans les paramètres de l\'extension.');
  }

  // Convert base64 to blob
  const binaryString = atob(base64Audio);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') ? 'mp4' : 'webm';
  const audioBlob = new Blob([bytes], { type: mimeType || 'audio/webm' });
  const audioFile = new File([audioBlob], `audio.${ext}`, { type: mimeType || 'audio/webm' });

  const model = settings.whisperModel || 'gpt-4o-transcribe';

  const formData = new FormData();
  formData.append('file', audioFile);
  formData.append('model', model);
  formData.append('language', 'fr');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Erreur API Whisper (${response.status})`);
  }

  const result = await response.json();
  return { text: result.text || '' };
}
