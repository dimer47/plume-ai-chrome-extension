// --- Popup Settings Logic ---

const $ = (sel) => document.querySelector(sel);

let currentProvider = 'claude';

// Provider toggle
document.querySelectorAll('.provider-toggle button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.provider-toggle button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentProvider = btn.dataset.provider;
    updateFieldsVisibility();
  });
});

function updateFieldsVisibility() {
  const isClaude = currentProvider === 'claude';
  $('#claude-fields').style.display = isClaude ? 'block' : 'none';
  $('#claude-model-field').style.display = isClaude ? 'block' : 'none';
  $('#claude-model-field').classList.toggle('visible', isClaude);
  $('#openai-fields').style.display = isClaude ? 'none' : 'block';
  $('#openai-model-field').style.display = isClaude ? 'none' : 'block';
  $('#openai-model-field').classList.toggle('visible', !isClaude);
}

// Toggle password visibility
document.querySelectorAll('.toggle-vis').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = $(`#${btn.dataset.target}`);
    input.type = input.type === 'password' ? 'text' : 'password';
  });
});

// Sync whisper key with openai key (if whisper key is empty)
$('#openai-key').addEventListener('input', () => {
  const whisperInput = $('#whisper-key');
  if (!whisperInput.value.trim()) {
    whisperInput.value = $('#openai-key').value;
  }
});

// Load saved settings
chrome.storage.local.get(['provider', 'claudeKey', 'openaiKey', 'claudeModel', 'openaiModel', 'customInstructions', 'whisperKey', 'whisperModel'], (data) => {
  if (data.provider) {
    currentProvider = data.provider;
    document.querySelectorAll('.provider-toggle button').forEach(b => {
      b.classList.toggle('active', b.dataset.provider === currentProvider);
    });
  }
  if (data.claudeKey) $('#claude-key').value = data.claudeKey;
  if (data.openaiKey) $('#openai-key').value = data.openaiKey;
  if (data.claudeModel) $('#claude-model').value = data.claudeModel;
  if (data.openaiModel) $('#openai-model').value = data.openaiModel;
  if (data.customInstructions) $('#custom-instructions').value = data.customInstructions;

  // Whisper key: use saved whisperKey, fallback to openaiKey
  if (data.whisperKey) {
    $('#whisper-key').value = data.whisperKey;
  } else if (data.openaiKey) {
    $('#whisper-key').value = data.openaiKey;
  }
  if (data.whisperModel) $('#whisper-model').value = data.whisperModel;

  // Always update visibility (fixes first-launch bug where model selector was hidden)
  updateFieldsVisibility();
});

// Save
$('#save-btn').addEventListener('click', () => {
  const data = {
    provider: currentProvider,
    claudeKey: $('#claude-key').value.trim(),
    openaiKey: $('#openai-key').value.trim(),
    claudeModel: $('#claude-model').value,
    openaiModel: $('#openai-model').value,
    customInstructions: $('#custom-instructions').value.trim(),
    whisperKey: $('#whisper-key').value.trim(),
    whisperModel: $('#whisper-model').value
  };

  // Validation: require the key for the selected LLM provider
  if (currentProvider === 'claude' && !data.claudeKey) {
    showStatus('Veuillez entrer votre clé API Anthropic', 'error');
    return;
  }
  if (currentProvider === 'openai' && !data.openaiKey) {
    showStatus('Veuillez entrer votre clé API OpenAI', 'error');
    return;
  }

  chrome.storage.local.set(data, () => {
    showStatus('Configuration sauvegardée ✓', 'success');
  });
});

function showStatus(msg, type) {
  const el = $('#status');
  el.textContent = msg;
  el.className = `status ${type}`;
  setTimeout(() => { el.textContent = ''; el.className = 'status'; }, 3000);
}
