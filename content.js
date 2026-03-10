// === Plume AI - Content Script ===
// Detects text fields, shows trigger buttons, manages the generation modal

(function () {
  // Check if a previous (possibly orphan) instance exists
  if (window.__aiwInjected && typeof chrome !== 'undefined' && chrome.runtime?.id) {
    return;
  }
  window.__aiwInjected = true;

  // Abort if extension context is invalidated (orphan content script)
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
    return;
  }

  // --- State ---
  let activeTarget = null; // The text field we're working with
  let conversationHistory = []; // Messages for refinement
  let lastGeneratedText = '';
  let isGenerating = false;
  let overlay = null;
  let savedSelection = ''; // Selection captured before it's lost on click
  let hasInteracted = false; // Tracks if user has interacted with the modal
  let ttsRate = 1;

  // Restore ttsRate from chrome.storage
  if (chrome?.storage?.local) {
    chrome.storage.local.get('plumeTtsRate', (r) => {
      if (r.plumeTtsRate) ttsRate = parseFloat(r.plumeTtsRate) || 1;
    });
  }

  // --- Trigger Button Management ---
  const triggerBtn = document.createElement('button');
  triggerBtn.className = 'aiw-trigger';
  triggerBtn.innerHTML = '✨';
  triggerBtn.title = 'Plume AI — Générer du texte';
  document.body.appendChild(triggerBtn);

  // Capture selection on mousedown BEFORE the click clears it
  triggerBtn.addEventListener('mousedown', (e) => {
    savedSelection = window.getSelection()?.toString()?.trim() || '';
  });

  triggerBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openModal();
  });

  // Detect focusable text elements
  function isTextField(el) {
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input' && ['text', 'search', 'email', 'url', ''].includes(el.type?.toLowerCase())) return true;
    if (el.isContentEditable) return true;
    // Gmail compose body
    if (el.getAttribute('role') === 'textbox') return true;
    if (el.classList?.contains('editable')) return true;
    return false;
  }

  function positionTrigger(el) {
    const rect = el.getBoundingClientRect();
    triggerBtn.style.top = `${window.scrollY + rect.top + 4}px`;
    triggerBtn.style.left = `${window.scrollX + rect.right - 38}px`;
    triggerBtn.classList.add('visible');
  }

  function hideTrigger() {
    triggerBtn.classList.remove('visible');
  }

  // Focus/blur tracking
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (isTextField(el)) {
      activeTarget = el;
      positionTrigger(el);
    }
  }, true);

  document.addEventListener('focusout', (e) => {
    // Delay to allow clicking the trigger
    setTimeout(() => {
      if (!document.activeElement || !isTextField(document.activeElement)) {
        if (!overlay) hideTrigger();
      }
    }, 200);
  }, true);

  // Also observe DOM mutations for dynamically added fields (SPA, Gmail, etc.)
  const mutationObserver = new MutationObserver(() => {
    if (activeTarget && document.contains(activeTarget) && document.activeElement === activeTarget) {
      positionTrigger(activeTarget);
    }
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true });

  // --- Keyboard Shortcut ---
  document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+G (or Cmd+Shift+G on Mac)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      savedSelection = window.getSelection()?.toString()?.trim() || '';
      if (activeTarget || document.activeElement && isTextField(document.activeElement)) {
        activeTarget = activeTarget || document.activeElement;
        openModal();
      }
    }
  });

  // --- Modal Management ---
  function createModal() {
    const overlay = document.createElement('div');
    overlay.className = 'aiw-overlay';
    overlay.innerHTML = `
      <div class="aiw-modal">
        <div class="aiw-modal-header">
          <div class="aiw-modal-header-left">
            <h2>✨ Plume AI</h2>
            <span class="aiw-modal-badge" id="aiw-provider-badge">Claude</span>
          </div>
          <div class="aiw-modal-header-right">
            <button class="aiw-header-btn" id="aiw-save-session" title="Sauvegarder la session">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            </button>
            <button class="aiw-header-btn" id="aiw-reset" title="Nouvelle conversation">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
            </button>
            <button class="aiw-modal-close" id="aiw-close">✕</button>
          </div>
        </div>
        <div class="aiw-context-section collapsed" id="aiw-context-section">
          <div class="aiw-context-header" id="aiw-context-toggle">
            <span>📋 Contexte</span>
            <span class="aiw-context-chevron" id="aiw-context-chevron">▾</span>
          </div>
          <div class="aiw-context-body" id="aiw-context-body">
            <textarea class="aiw-context-input" id="aiw-context"
              placeholder="Collez ici le contexte (email reçu, conversation, texte de référence...)"
              rows="4"></textarea>
          </div>
        </div>
        <div class="aiw-modal-body">
          <div class="aiw-chat" id="aiw-chat"></div>
        </div>
        <div class="aiw-input-area">
          <div class="aiw-input-row">
            <textarea class="aiw-input" id="aiw-input" placeholder="Décrivez ce que vous voulez écrire... Ex: Écris un mail professionnel pour demander un congé le 15 mars" rows="1"></textarea>
            <button class="aiw-mic-btn" id="aiw-mic" title="Dictée vocale (Whisper)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            </button>
            <button class="aiw-send-btn" id="aiw-send" title="Envoyer">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
        <div class="aiw-modal-footer">
          <span class="aiw-msg-count" id="aiw-msg-count"></span>
        </div>
      </div>
    `;
    return overlay;
  }

  function openModal() {
    if (overlay) return;

    conversationHistory = [];
    lastGeneratedText = '';
    hasInteracted = false;

    overlay = createModal();
    document.body.appendChild(overlay);

    // Force reflow then open
    requestAnimationFrame(() => {
      overlay.classList.add('open');
    });

    // Update provider badge
    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action: 'getSettings' }, (settings) => {
        if (settings && overlay) {
          const badge = overlay.querySelector('#aiw-provider-badge');
          if (badge) badge.textContent = settings.provider === 'openai' ? 'OpenAI' : 'Claude';
        }
      });
    }

    const input = overlay.querySelector('#aiw-input');
    const sendBtn = overlay.querySelector('#aiw-send');

    // Pre-fill context textarea: saved selection > field content
    const contextTextarea = overlay.querySelector('#aiw-context');
    const contextSection = overlay.querySelector('#aiw-context-section');
    const selection = savedSelection || '';
    const existingText = getFieldValue(activeTarget)?.trim() || '';
    savedSelection = ''; // Reset after use

    if (selection) {
      contextTextarea.value = selection;
    } else if (existingText) {
      contextTextarea.value = existingText;
    }

    // Collapse/expand based on content
    if (contextTextarea.value) {
      contextSection.classList.remove('collapsed');
    } else {
      contextSection.classList.add('collapsed');
    }

    // Toggle collapse on header click
    overlay.querySelector('#aiw-context-toggle').addEventListener('click', () => {
      contextSection.classList.toggle('collapsed');
    });

    // Focus input
    setTimeout(() => input.focus(), 100);

    // Auto-resize textarea + track interaction
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      if (input.value.trim()) hasInteracted = true;
    });

    // Send on Enter (Shift+Enter for newline)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doGenerate();
      }
    });

    sendBtn.addEventListener('click', doGenerate);

    // --- Microphone / Whisper dictation ---
    const micBtn = overlay.querySelector('#aiw-mic');
    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;

    micBtn.addEventListener('click', async () => {
      if (isRecording) {
        // Stop recording
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
        return;
      }

      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

        mediaRecorder.addEventListener('dataavailable', (e) => {
          if (e.data.size > 0) audioChunks.push(e.data);
        });

        mediaRecorder.addEventListener('stop', () => {
          // Stop all tracks to release the microphone
          stream.getTracks().forEach(t => t.stop());
          isRecording = false;
          micBtn.classList.remove('aiw-mic-recording');

          if (audioChunks.length === 0) return;

          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          transcribeAudio(audioBlob, input);
        });

        mediaRecorder.start();
        isRecording = true;
        micBtn.classList.add('aiw-mic-recording');

      } catch (err) {
        if (err.name === 'NotAllowedError') {
          showToast('Accès au micro refusé');
        } else {
          showToast('Erreur micro : ' + err.message);
        }
      }
    });

    // Close (cross button always works)
    overlay.querySelector('#aiw-close').addEventListener('click', closeModal);

    // Backdrop click: only close if no interaction yet
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && !hasInteracted) closeModal();
    });

    // Escape: only close if no interaction yet
    const escHandler = (e) => {
      if (e.key === 'Escape' && !hasInteracted) closeModal();
    };
    document.addEventListener('keydown', escHandler);
    overlay.__escHandler = escHandler;

    // Save session
    overlay.querySelector('#aiw-save-session').addEventListener('click', saveCurrentSession);

    // Reset with confirmation
    overlay.querySelector('#aiw-reset').addEventListener('click', () => {
      if (conversationHistory.length > 0) {
        if (!confirm('Effacer la conversation en cours ?')) return;
      }
      if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
      conversationHistory = [];
      lastGeneratedText = '';
      hasInteracted = false;
      const chat = overlay.querySelector('#aiw-chat');
      chat.innerHTML = '';
      input.value = '';
      input.focus();
      updateMessageCount();
      renderSessionsList();
    });

    // Show saved sessions on empty state
    renderSessionsList();
  }

  function updateMessageCount() {
    if (!overlay) return;
    const count = overlay.querySelectorAll('#aiw-chat .aiw-msg').length;
    const el = overlay.querySelector('#aiw-msg-count');
    if (!el) return;
    if (count === 0) {
      el.textContent = '';
    } else {
      el.textContent = count + ' message' + (count > 1 ? 's' : '');
    }
  }

  function closeModal() {
    if (!overlay) return;
    // Stop any ongoing TTS
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    // Stop any ongoing recording
    const micBtn = overlay.querySelector('#aiw-mic');
    if (micBtn && micBtn.classList.contains('aiw-mic-recording')) {
      // The MediaRecorder stop will be handled by its own event listener
      micBtn.click();
    }
    document.removeEventListener('keydown', overlay.__escHandler);
    overlay.classList.remove('open');
    setTimeout(() => {
      overlay.remove();
      overlay = null;
    }, 200);
    // Refocus the field
    if (activeTarget) {
      try { activeTarget.focus(); } catch (e) {}
    }
  }

  function addMessage(role, text) {
    if (!overlay) return;
    const chat = overlay.querySelector('#aiw-chat');
    const div = document.createElement('div');
    div.className = `aiw-msg aiw-msg-${role === 'user' ? 'user' : 'ai'}`;
    div.textContent = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    updateMessageCount();
  }

  function addError(text) {
    if (!overlay) return;
    const chat = overlay.querySelector('#aiw-chat');
    const div = document.createElement('div');
    div.className = 'aiw-msg aiw-msg-error';
    div.textContent = '⚠️ ' + text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    updateMessageCount();
  }

  // Create an empty AI message bubble for streaming, returns the element
  function createStreamingMessage() {
    if (!overlay) return null;
    const chat = overlay.querySelector('#aiw-chat');
    const div = document.createElement('div');
    div.className = 'aiw-msg aiw-msg-ai aiw-msg-streaming';
    div.innerHTML = '<span class="aiw-msg-text"></span><span class="aiw-streaming-cursor"></span>';
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return div;
  }

  // Add action buttons (Select / Copy / TTS) under a finalized AI message
  function addMessageActions(msgEl) {
    const textEl = msgEl.querySelector('.aiw-msg-text');
    if (!textEl) return;

    const actions = document.createElement('div');
    actions.className = 'aiw-msg-actions';
    const rateLabel = ttsRate.toFixed(2).replace(/\.?0+$/, '') + 'x';
    actions.innerHTML =
      '<button class="aiw-msg-action-btn" data-action="select" title="Sélectionner tout">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 10H3"/><path d="M21 6H3"/><path d="M21 14H3"/><path d="M17 18H3"/></svg>' +
        'Sélectionner</button>' +
      '<button class="aiw-msg-action-btn" data-action="copy" title="Copier">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>' +
        'Copier</button>' +
      '<div class="aiw-tts-group">' +
        '<button class="aiw-msg-action-btn aiw-tts-speed-btn" data-action="tts-slower" title="Ralentir">' +
          '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
        '</button>' +
        '<button class="aiw-msg-action-btn aiw-tts-play-btn" data-action="tts" title="Écouter">' +
          '<svg class="aiw-tts-icon-play" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg>' +
          '<svg class="aiw-tts-icon-stop" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>' +
          '<span class="aiw-tts-label">Écouter</span>' +
          '<span class="aiw-tts-rate">' + rateLabel + '</span>' +
        '</button>' +
        '<button class="aiw-msg-action-btn aiw-tts-speed-btn" data-action="tts-faster" title="Accélérer">' +
          '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
        '</button>' +
      '</div>';
    msgEl.appendChild(actions);

    // Select button
    actions.querySelector('[data-action="select"]').addEventListener('click', () => {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(textEl);
      selection.removeAllRanges();
      selection.addRange(range);
    });

    // Copy button
    actions.querySelector('[data-action="copy"]').addEventListener('click', () => {
      const text = textEl.textContent;
      navigator.clipboard.writeText(text).then(() => {
        showToast('Texte copié !');
      });
    });

    // TTS controls
    const ttsPlayBtn = actions.querySelector('[data-action="tts"]');
    const ttsRateDisplay = actions.querySelector('.aiw-tts-rate');
    const iconPlay = actions.querySelector('.aiw-tts-icon-play');
    const iconStop = actions.querySelector('.aiw-tts-icon-stop');
    const ttsLabel = actions.querySelector('.aiw-tts-label');
    let ttsIgnoreEnd = false; // Flag to ignore onend after cancel+restart

    function setPlayingState(playing) {
      if (playing) {
        iconPlay.style.display = 'none';
        iconStop.style.display = '';
        ttsLabel.textContent = 'Stop';
        ttsPlayBtn.classList.add('active');
      } else {
        iconPlay.style.display = '';
        iconStop.style.display = 'none';
        ttsLabel.textContent = 'Écouter';
        ttsPlayBtn.classList.remove('active');
      }
    }

    function startSpeaking() {
      const utterance = new SpeechSynthesisUtterance(textEl.textContent);
      utterance.lang = 'fr-FR';
      utterance.rate = ttsRate;

      utterance.onend = () => {
        if (ttsIgnoreEnd) { ttsIgnoreEnd = false; return; }
        setPlayingState(false);
      };
      utterance.onerror = (e) => {
        if (ttsIgnoreEnd) { ttsIgnoreEnd = false; return; }
        if (e.error !== 'canceled') setPlayingState(false);
      };

      // Reset all other TTS buttons in the chat to idle state
      if (overlay) {
        overlay.querySelectorAll('.aiw-tts-play-btn.active').forEach(btn => {
          if (btn === ttsPlayBtn) return;
          btn.classList.remove('active');
          btn.querySelector('.aiw-tts-icon-play').style.display = '';
          btn.querySelector('.aiw-tts-icon-stop').style.display = 'none';
          btn.querySelector('.aiw-tts-label').textContent = 'Écouter';
        });
      }

      setPlayingState(true);
      window.speechSynthesis.speak(utterance);
    }

    // Play / Stop
    ttsPlayBtn.addEventListener('click', () => {
      if (ttsPlayBtn.classList.contains('active')) {
        // Currently playing on this button → stop
        ttsIgnoreEnd = false;
        window.speechSynthesis.cancel();
        setPlayingState(false);
        return;
      }
      // If another message is playing, stop it first
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      startSpeaking();
    });

    // Slower (−0.25, min 0.25)
    actions.querySelector('[data-action="tts-slower"]').addEventListener('click', () => {
      ttsRate = Math.max(0.25, Math.round((ttsRate - 0.25) * 100) / 100);
      updateAllRateDisplays();

      // If this message is currently speaking, restart with new rate
      if (ttsPlayBtn.classList.contains('active')) {
        ttsIgnoreEnd = true;
        window.speechSynthesis.cancel();
        startSpeaking();
      }
    });

    // Faster (+0.25, max 3)
    actions.querySelector('[data-action="tts-faster"]').addEventListener('click', () => {
      ttsRate = Math.min(3, Math.round((ttsRate + 0.25) * 100) / 100);
      updateAllRateDisplays();

      // If this message is currently speaking, restart with new rate
      if (ttsPlayBtn.classList.contains('active')) {
        ttsIgnoreEnd = true;
        window.speechSynthesis.cancel();
        startSpeaking();
      }
    });
  }

  // Update the rate display on all message action bars (shared global rate)
  function updateAllRateDisplays() {
    if (chrome?.storage?.local) chrome.storage.local.set({ plumeTtsRate: ttsRate });
    if (!overlay) return;
    const label = ttsRate.toFixed(2).replace(/\.?0+$/, '') + 'x';
    overlay.querySelectorAll('.aiw-tts-rate').forEach(el => {
      el.textContent = label;
    });
  }

  // --- Session Management (chrome.storage.local) ---
  const SESSIONS_KEY = 'plumeSessions';

  function getSessions(callback) {
    if (!chrome?.storage?.local) { callback([]); return; }
    chrome.storage.local.get(SESSIONS_KEY, (r) => {
      callback(r[SESSIONS_KEY] || []);
    });
  }

  function saveSessions(sessions, callback) {
    if (!chrome?.storage?.local) { if (callback) callback(); return; }
    chrome.storage.local.set({ [SESSIONS_KEY]: sessions }, callback);
  }

  function saveCurrentSession() {
    if (conversationHistory.length === 0) {
      showToast('Rien à sauvegarder');
      return;
    }
    const firstUserMsg = conversationHistory.find(m => m.role === 'user');
    const title = firstUserMsg
      ? firstUserMsg.content.substring(0, 50) + (firstUserMsg.content.length > 50 ? '…' : '')
      : 'Session';
    const context = overlay?.querySelector('#aiw-context')?.value?.trim() || '';
    const session = {
      id: Date.now(),
      title: title,
      date: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
      history: [...conversationHistory],
      context: context
    };
    getSessions((sessions) => {
      sessions.unshift(session);
      if (sessions.length > 20) sessions.length = 20;
      saveSessions(sessions, () => {
        showToast('Session sauvegardée');
        renderSessionsList();
      });
    });
  }

  function deleteSession(id) {
    getSessions((sessions) => {
      saveSessions(sessions.filter(s => s.id !== id), () => {
        renderSessionsList();
      });
    });
  }

  function restoreSession(id) {
    getSessions((sessions) => {
      const session = sessions.find(s => s.id === id);
      if (!session || !overlay) return;

      conversationHistory = [...session.history];
      hasInteracted = true;

      // Restore context
      const contextTextarea = overlay.querySelector('#aiw-context');
      const contextSection = overlay.querySelector('#aiw-context-section');
      if (session.context) {
        contextTextarea.value = session.context;
        contextSection.classList.remove('collapsed');
      }

      // Rebuild chat UI
      const chat = overlay.querySelector('#aiw-chat');
      chat.innerHTML = '';
      for (const msg of conversationHistory) {
        if (msg.role === 'user') {
          const div = document.createElement('div');
          div.className = 'aiw-msg aiw-msg-user';
          div.textContent = msg.content;
          chat.appendChild(div);
        } else {
          const div = document.createElement('div');
          div.className = 'aiw-msg aiw-msg-ai';
          div.innerHTML = '<span class="aiw-msg-text"></span>';
          div.querySelector('.aiw-msg-text').textContent = msg.content;
          chat.appendChild(div);
          addMessageActions(div);
        }
      }
      lastGeneratedText = conversationHistory.filter(m => m.role === 'assistant').pop()?.content || '';
      chat.scrollTop = chat.scrollHeight;
      updateMessageCount();
      overlay.querySelector('#aiw-input').focus();
    });
  }

  function renderSessionsList() {
    if (!overlay) return;
    const chat = overlay.querySelector('#aiw-chat');
    // Only show sessions list when chat is empty (no conversation)
    if (conversationHistory.length > 0) return;

    getSessions((sessions) => {
      if (!overlay || conversationHistory.length > 0) return;
      chat.innerHTML = '';
      if (sessions.length === 0) return;

      const container = document.createElement('div');
      container.className = 'aiw-sessions-list';
      container.innerHTML =
        '<div class="aiw-sessions-header">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>' +
          'Sessions récentes</div>';

      for (const s of sessions) {
        const item = document.createElement('div');
        item.className = 'aiw-session-item';
        item.innerHTML =
          '<div class="aiw-session-info">' +
            '<span class="aiw-session-title">' + escapeHtml(s.title) + '</span>' +
            '<span class="aiw-session-date">' + escapeHtml(s.date) + ' · ' + s.history.length + ' msg</span>' +
          '</div>' +
          '<button class="aiw-session-delete" title="Supprimer">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>';

        item.querySelector('.aiw-session-info').addEventListener('click', () => restoreSession(s.id));
        item.querySelector('.aiw-session-delete').addEventListener('click', (e) => {
          e.stopPropagation();
          deleteSession(s.id);
        });

        container.appendChild(item);
      }
      chat.appendChild(container);
    });
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function doGenerate() {
    if (isGenerating || !overlay) return;

    const input = overlay.querySelector('#aiw-input');
    const prompt = input.value.trim();
    if (!prompt) return;

    isGenerating = true;
    hasInteracted = true;
    const sendBtn = overlay.querySelector('#aiw-send');
    sendBtn.disabled = true;

    // Add user message to chat
    addMessage('user', prompt);
    input.value = '';
    input.style.height = 'auto';

    // Get context from the editable context textarea
    const context = overlay.querySelector('#aiw-context')?.value?.trim() || '';

    // Create streaming AI bubble
    const streamingEl = createStreamingMessage();
    lastGeneratedText = '';

    // Open long-lived port to background for streaming
    if (!chrome?.runtime?.connect) {
      addError('Extension déconnectée. Rechargez la page (F5) puis réessayez.');
      isGenerating = false;
      sendBtn.disabled = false;
      return;
    }
    const port = chrome.runtime.connect({ name: 'plume-stream' });

    port.onMessage.addListener((msg) => {
      if (!overlay || !streamingEl) return;
      const chat = overlay.querySelector('#aiw-chat');

      if (msg.type === 'chunk') {
        // Append text chunk progressively
        lastGeneratedText += msg.text;
        // Update the text span content
        const textSpan = streamingEl.querySelector('.aiw-msg-text');
        if (textSpan) textSpan.textContent = lastGeneratedText;
        chat.scrollTop = chat.scrollHeight;
      }

      if (msg.type === 'done') {
        // Finalize: remove cursor, set final text
        streamingEl.classList.remove('aiw-msg-streaming');
        const cursorEl = streamingEl.querySelector('.aiw-streaming-cursor');
        if (cursorEl) cursorEl.remove();
        const textSpan = streamingEl.querySelector('.aiw-msg-text');
        if (textSpan) textSpan.textContent = lastGeneratedText;

        // Add action buttons (Select / Copy)
        addMessageActions(streamingEl);

        // Add to conversation history for refinement
        conversationHistory.push({ role: 'user', content: prompt });
        conversationHistory.push({ role: 'assistant', content: lastGeneratedText });

        isGenerating = false;
        sendBtn.disabled = false;
        input.focus();

        try { port.disconnect(); } catch (e) {}
      }

      if (msg.type === 'error') {
        // Remove empty streaming bubble and show error
        streamingEl.remove();
        addError(msg.error);

        isGenerating = false;
        sendBtn.disabled = false;
        input.focus();

        try { port.disconnect(); } catch (e) {}
      }
    });

    port.onDisconnect.addListener(() => {
      // If disconnected unexpectedly while still generating
      if (isGenerating) {
        if (lastGeneratedText) {
          // We got partial text, finalize it
          streamingEl.classList.remove('aiw-msg-streaming');
          const cursorEl = streamingEl.querySelector('.aiw-streaming-cursor');
          if (cursorEl) cursorEl.remove();
          const textSpan = streamingEl.querySelector('.aiw-msg-text');
          if (textSpan) textSpan.textContent = lastGeneratedText;
          addMessageActions(streamingEl);
          conversationHistory.push({ role: 'user', content: prompt });
          conversationHistory.push({ role: 'assistant', content: lastGeneratedText });
        } else {
          streamingEl.remove();
          addError('Connexion interrompue');
        }
        isGenerating = false;
        sendBtn.disabled = false;
      }
    });

    // Send the generation request through the port
    port.postMessage({
      action: 'generate',
      prompt: prompt,
      context: context,
      conversationHistory: conversationHistory
    });
  }

  // --- Text Field Utilities ---
  function getFieldValue(el) {
    if (!el) return '';
    if (el.tagName?.toLowerCase() === 'textarea' || el.tagName?.toLowerCase() === 'input') {
      return el.value;
    }
    if (el.isContentEditable || el.getAttribute('role') === 'textbox') {
      return el.innerText || el.textContent || '';
    }
    return '';
  }

  function insertText(el, text) {
    if (!el) return;

    const tag = el.tagName?.toLowerCase();

    if (tag === 'textarea' || tag === 'input') {
      // Standard form elements
      el.focus();
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const current = el.value;

      // If there's a selection, replace it; otherwise replace all
      if (start !== end) {
        el.value = current.substring(0, start) + text + current.substring(end);
        el.selectionStart = el.selectionEnd = start + text.length;
      } else {
        el.value = text;
      }

      // Trigger events for frameworks (React, Vue, Angular)
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));

      // React-specific: update internal value tracker
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        tag === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
        'value'
      )?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(el, el.value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }

    } else if (el.isContentEditable || el.getAttribute('role') === 'textbox') {
      // ContentEditable (Gmail, Outlook, etc.)
      el.focus();

      // Try execCommand first (works well in Gmail)
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        // Select all content
        const range = document.createRange();
        range.selectNodeContents(el);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      // Escape HTML then convert newlines to <br> for safe insertion
      const htmlText = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\n/g, '<br>');

      // Use execCommand for undo-compatible insertion
      document.execCommand('insertHTML', false, htmlText);

      // Trigger input event
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // --- Whisper Transcription ---
  function transcribeAudio(audioBlob, inputEl) {
    if (!overlay) return;

    // Show transcribing state
    const micBtn = overlay.querySelector('#aiw-mic');
    if (micBtn) micBtn.classList.add('aiw-mic-transcribing');

    // Convert blob to base64 and send to background
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result.split(',')[1];

      if (!chrome?.runtime?.sendMessage) {
        showToast('Extension déconnectée');
        if (micBtn) micBtn.classList.remove('aiw-mic-transcribing');
        return;
      }

      chrome.runtime.sendMessage({
        action: 'transcribe',
        audioData: base64data,
        mimeType: audioBlob.type
      }, (response) => {
        if (micBtn) micBtn.classList.remove('aiw-mic-transcribing');

        if (chrome.runtime.lastError) {
          showToast('Erreur de transcription');
          return;
        }

        if (response && response.error) {
          showToast(response.error);
          return;
        }

        if (response && response.text) {
          // Append transcribed text to input
          const current = inputEl.value;
          inputEl.value = current ? current + ' ' + response.text : response.text;
          inputEl.style.height = 'auto';
          inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
          inputEl.focus();
          hasInteracted = true;
        }
      });
    };
    reader.readAsDataURL(audioBlob);
  }

  // --- Toast Notifications ---
  function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(10px);
      background: #1c1c22;
      color: #e4e4e7;
      padding: 10px 20px;
      border-radius: 10px;
      border: 1px solid #2e2e38;
      font-family: 'Segoe UI', -apple-system, sans-serif;
      font-size: 13px;
      z-index: 2147483647;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      opacity: 0;
      transition: all 0.3s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

})();
