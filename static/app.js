let manifest = null;
let currentSentenceIndex = 0;
let audio = new Audio();
let isPlaying = false;

let rafId = null;
let activeWordIndex = -1;

let statusPollInterval = null;
let manifestPollInterval = null;

let wordSpeakStatusTimer = null;

const uploadBtn = document.getElementById('upload-btn');
const genZhBtn = document.getElementById('gen-zh-btn');
const translationEngine = document.getElementById('translationEngine');
const translationProgressBox = document.getElementById('translationProgressBox');
const translationProgressText = document.getElementById('translationProgressText');
const translationProgressFill = document.getElementById('translationProgressFill');

const immersiveBtn = document.getElementById('immersive-btn');
const historyBtn = document.getElementById('history-btn');
const clearBtn = document.getElementById('clear-btn');
const currentPracticeTitle = document.getElementById('currentPracticeTitle');
const fileInput = document.getElementById('file-input');
const playerControls = document.getElementById('player-controls');
const downloadControls = document.getElementById('download-controls');
const textArea = document.getElementById('text-area');
const vocabArea = document.getElementById('vocab-area');
const appLayout = document.getElementById('app-layout');
const panelToggleBtn = document.getElementById('panel-toggle');

const restartBtn = document.getElementById('restart-btn');
const playPauseBtn = document.getElementById('play-pause-btn');
const resumeBtn = document.getElementById('resume-btn');

const speedSelect = document.getElementById('speed-select');
const progressText = document.getElementById('progress-text');

const formatSelect = document.getElementById('format-select');
const dlCurrentBtn = document.getElementById('dl-current-btn');
const dlAllBtn = document.getElementById('dl-all-btn');
const dlMergedBtn = document.getElementById('dl-merged-btn');

const wordSpeakStatus = document.getElementById('wordSpeakStatus');

// Debug Panel Elements
const debugPanel = document.getElementById('debug-panel');
const debugHeader = document.getElementById('debug-header');
const dbgCollapseBtn = document.getElementById('dbg-collapse-btn');
const dbgHideBtn = document.getElementById('dbg-hide-btn');
const dbgResetBtn = document.getElementById('dbg-reset-btn');
const showDebugBtn = document.getElementById('show-debug-btn');

// History Modal Elements
const historyModal = document.getElementById('historyModal');
const closeHistoryBtn = document.getElementById('closeHistoryBtn');
const historyList = document.getElementById('historyList');

function cleanWord(raw) {
    return String(raw || "")
        .trim()
        .replace(/[^\p{L}'-]/gu, "");
}

// --- Initialization ---
function initPage() {
    if (localStorage.getItem("vocabPanelCollapsed") === "true") {
        appLayout.classList.add('vocab-collapsed');
        vocabArea.classList.add('collapsed');
        panelToggleBtn.innerText = "‹";
    }
    
    if (localStorage.getItem("immersiveMode") === "true") {
        document.body.classList.add('immersive-mode');
    }
    
    if (localStorage.getItem("debugHidden") === "true") {
        debugPanel.classList.add('hidden');
        showDebugBtn.classList.remove('hidden');
    }
    if (localStorage.getItem("debugCollapsed") === "true") {
        debugPanel.classList.add('collapsed');
    }
    
    const l = localStorage.getItem("debugLeft");
    const t = localStorage.getItem("debugTop");
    const w = localStorage.getItem("debugWidth");
    const h = localStorage.getItem("debugHeight");
    if (l) debugPanel.style.left = l;
    if (t) debugPanel.style.top = t;
    if (w) debugPanel.style.width = w;
    if (h) debugPanel.style.height = h;

    const savedSpeed = localStorage.getItem("playbackSpeed");
    if (savedSpeed) {
        speedSelect.value = savedSpeed;
        audio.playbackRate = parseFloat(savedSpeed);
    }
    
    clearCurrentPractice();
}

document.addEventListener("DOMContentLoaded", initPage);

// --- Clear Current Practice ---
function clearCurrentPractice() {
    audio.pause();
    isPlaying = false;
    cancelAnimationFrame(rafId);
    if (statusPollInterval) clearInterval(statusPollInterval);
    if (manifestPollInterval) clearInterval(manifestPollInterval);
    
    manifest = null;
    currentSentenceIndex = 0;
    activeWordIndex = -1;
    
    textArea.innerHTML = `<p class="placeholder-text">Please upload a .txt or .md file, or open a saved practice from History.</p>`;
    vocabArea.innerHTML = `<h3>Vocabulary</h3><p class="placeholder-text">No practice loaded.</p>`;
    currentPracticeTitle.innerText = "None";
    
    playerControls.classList.add('hidden');
    downloadControls.classList.add('hidden');
    genZhBtn.classList.add('hidden');
    translationEngine.classList.add('hidden');
    translationProgressBox.classList.add('hidden');
    
    updateDebugPanel();
    updateArticlePlayingClass();
}

clearBtn.addEventListener('click', clearCurrentPractice);

// --- History Logic ---
historyBtn.addEventListener('click', () => {
    historyModal.classList.remove('hidden');
    fetchHistory();
});
closeHistoryBtn.addEventListener('click', () => {
    historyModal.classList.add('hidden');
});

async function fetchHistory() {
    historyList.innerHTML = '<p style="text-align:center;">Loading history...</p>';
    try {
        const res = await fetch('/api/history');
        const data = await res.json();
        if(data.length === 0) {
            historyList.innerHTML = '<p style="text-align:center; color:#64748b;">No practice history found.</p>';
            return;
        }
        
        let html = '';
        data.forEach(run => {
            let engineText = run.translation_engine ? `via ${run.translation_engine}` : '';
            html += `
                <div class="history-card">
                    <div class="history-card-info">
                        <h4>${run.title}</h4>
                        <div class="history-card-meta">
                            <span><strong>Sentences:</strong> ${run.sentence_count}</span>
                            <span><strong>Translated:</strong> ${run.translated_count} / ${run.sentence_count} ${engineText}</span>
                            <span><strong>Original File:</strong> ${run.original_filename || 'N/A'}</span>
                            <span><strong>Updated:</strong> ${new Date(run.updated_at).toLocaleString()}</span>
                        </div>
                    </div>
                    <div class="history-card-actions">
                        <button class="btn-open" onclick="window.openHistoryRun('${run.run_id}')">Open</button>
                        <button class="btn-rename" onclick="window.renameHistoryRun('${run.run_id}', '${run.title.replace(/'/g, "\\'")}')">Rename</button>
                        <button class="btn-delete" onclick="window.deleteHistoryRun('${run.run_id}')">Delete</button>
                    </div>
                </div>
            `;
        });
        historyList.innerHTML = html;
    } catch(e) {
        historyList.innerHTML = '<p style="text-align:center; color:red;">Failed to load history.</p>';
    }
}

window.openHistoryRun = async (runId) => {
    historyModal.classList.add('hidden');
    
    try {
        const res = await fetch(`/api/manifest/${runId}`);
        if (!res.ok) {
            alert("Failed to load practice. It might have been deleted.");
            return;
        }
        manifest = await res.json();
        
        const histRes = await fetch('/api/history');
        if (histRes.ok) {
            const histData = await histRes.json();
            const runInfo = histData.find(r => r.run_id === runId);
            if (runInfo) {
                currentPracticeTitle.innerText = runInfo.title;
            }
        }
        
        playerControls.classList.remove('hidden');
        downloadControls.classList.remove('hidden');
        genZhBtn.classList.remove('hidden');
        translationEngine.classList.remove('hidden');
        
        const allDone = manifest.sentences.every(s => s.zh_status === 'done' || s.zh_status === 'failed');
        if (allDone) {
            genZhBtn.innerText = "Chinese Generated";
            genZhBtn.disabled = true;
            translationEngine.disabled = true;
            translationProgressBox.classList.add('hidden');
        } else {
            genZhBtn.innerText = "Generate Chinese";
            genZhBtn.disabled = false;
            translationEngine.disabled = false;
        }

        renderManifest();
        jumpToSentence(0, false);
    } catch (e) {
        console.error("Error opening run:", e);
        alert("Error loading this practice.");
    }
};

window.renameHistoryRun = async (runId, oldTitle) => {
    const newTitle = prompt("Enter new title:", oldTitle);
    if (!newTitle || newTitle === oldTitle) return;
    try {
        const res = await fetch(`/api/history/${runId}/rename`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({title: newTitle})
        });
        if(res.ok) {
            fetchHistory(); // refresh list
            if(manifest && manifest.run_id === runId) {
                currentPracticeTitle.innerText = newTitle;
            }
        } else {
            alert("Rename failed.");
        }
    } catch(e) {
        alert("Rename error: " + e);
    }
};

window.deleteHistoryRun = async (runId) => {
    if (!confirm("Are you sure you want to delete this practice? This will remove all generated audio and translations.")) return;
    try {
        const res = await fetch(`/api/history/${runId}`, { method: 'DELETE' });
        if (res.ok) {
            fetchHistory();
            if(manifest && manifest.run_id === runId) {
                clearCurrentPractice();
            }
        } else {
            alert("Delete failed.");
        }
    } catch(e) {
        alert("Delete error: " + e);
    }
};


// --- Toggles & Modes ---
panelToggleBtn.addEventListener('click', () => {
    appLayout.classList.toggle('vocab-collapsed');
    vocabArea.classList.toggle('collapsed');
    const isCollapsed = appLayout.classList.contains('vocab-collapsed');
    panelToggleBtn.innerText = isCollapsed ? "‹" : "›";
    localStorage.setItem("vocabPanelCollapsed", isCollapsed);
});

immersiveBtn.addEventListener('click', () => {
    document.body.classList.toggle('immersive-mode');
    const isImmersive = document.body.classList.contains('immersive-mode');
    localStorage.setItem("immersiveMode", isImmersive);
    if (isImmersive) {
        debugPanel.classList.add('collapsed');
        localStorage.setItem("debugCollapsed", "true");
        if (!appLayout.classList.contains('vocab-collapsed')) {
            appLayout.classList.add('vocab-collapsed');
            vocabArea.classList.add('collapsed');
        }
    }
});

// --- Debug Panel Logic ---
let isDragging = false;
let startX, startY, initialLeft, initialTop;

debugHeader.addEventListener('mousedown', (e) => {
    if (e.target.tagName.toLowerCase() === 'span') return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    initialLeft = debugPanel.offsetLeft;
    initialTop = debugPanel.offsetTop;
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    debugPanel.style.left = `${initialLeft + dx}px`;
    debugPanel.style.top = `${initialTop + dy}px`;
    debugPanel.style.right = 'auto';
    debugPanel.style.bottom = 'auto';
});

document.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        localStorage.setItem("debugLeft", debugPanel.style.left);
        localStorage.setItem("debugTop", debugPanel.style.top);
    }
});

new ResizeObserver(() => {
    if (debugPanel.style.width) localStorage.setItem("debugWidth", debugPanel.style.width);
    if (debugPanel.style.height) localStorage.setItem("debugHeight", debugPanel.style.height);
}).observe(debugPanel);

dbgCollapseBtn.addEventListener('click', () => {
    debugPanel.classList.toggle('collapsed');
    localStorage.setItem("debugCollapsed", debugPanel.classList.contains('collapsed'));
});

dbgHideBtn.addEventListener('click', () => {
    debugPanel.classList.add('hidden');
    showDebugBtn.classList.remove('hidden');
    localStorage.setItem("debugHidden", "true");
});

showDebugBtn.addEventListener('click', () => {
    debugPanel.classList.remove('hidden');
    showDebugBtn.classList.add('hidden');
    localStorage.setItem("debugHidden", "false");
});

dbgResetBtn.addEventListener('click', () => {
    debugPanel.style.left = '';
    debugPanel.style.top = '';
    debugPanel.style.right = '20px';
    debugPanel.style.bottom = '20px';
    debugPanel.style.width = '';
    debugPanel.style.height = '';
    debugPanel.classList.remove('collapsed');
    localStorage.removeItem("debugLeft");
    localStorage.removeItem("debugTop");
    localStorage.removeItem("debugWidth");
    localStorage.removeItem("debugHeight");
    localStorage.setItem("debugCollapsed", "false");
});

// --- Download API ---
async function checkDownloadResponse(url) {
    const res = await fetch(url);
    if (!res.ok) {
        let msg = "Download failed.";
        try { const err = await res.json(); msg = err.error || msg; } catch(e){}
        alert(msg);
        return;
    }
    const blob = await res.blob();
    const urlBlob = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = urlBlob;
    
    let filename = "download";
    const disposition = res.headers.get('content-disposition');
    if (disposition && disposition.indexOf('filename=') !== -1) {
        filename = disposition.split('filename=')[1].replace(/["']/g, "");
    }
    
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(urlBlob);
}

dlCurrentBtn.addEventListener('click', () => {
    if (!manifest) return;
    const fmt = formatSelect.value;
    const url = `/api/download/current?run_id=${manifest.run_id}&index=${currentSentenceIndex}&format=${fmt}`;
    checkDownloadResponse(url);
});
dlAllBtn.addEventListener('click', () => {
    if (!manifest) return;
    const fmt = formatSelect.value;
    const url = `/api/download/all.zip?run_id=${manifest.run_id}&format=${fmt}`;
    checkDownloadResponse(url);
});
dlMergedBtn.addEventListener('click', () => {
    if (!manifest) return;
    const fmt = formatSelect.value;
    const url = `/api/download/merged?run_id=${manifest.run_id}&format=${fmt}`;
    checkDownloadResponse(url);
});

// --- Upload & Gen Chinese ---
uploadBtn.addEventListener('click', async () => {
    if (!fileInput.files[0]) {
        alert("Please select a .txt or .md file first!");
        return;
    }
    
    uploadBtn.disabled = true;
    uploadBtn.innerText = "Generating (Fast Mode)...";
    
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    
    try {
        const res = await fetch('/api/generate', { method: 'POST', body: formData });
        if (!res.ok) throw new Error("Server error");
        manifest = await res.json();
        
        const histRes = await fetch('/api/history');
        if (histRes.ok) {
            const histData = await histRes.json();
            const runInfo = histData.find(r => r.run_id === manifest.run_id);
            if (runInfo) currentPracticeTitle.innerText = runInfo.title;
        }
        
        playerControls.classList.remove('hidden');
        downloadControls.classList.remove('hidden');
        genZhBtn.classList.remove('hidden');
        translationEngine.classList.remove('hidden');
        genZhBtn.innerText = "Generate Chinese";
        genZhBtn.disabled = false;
        translationEngine.disabled = false;
        if (statusPollInterval) clearInterval(statusPollInterval);
        if (manifestPollInterval) clearInterval(manifestPollInterval);
        translationProgressBox.classList.add('hidden');
        
        renderManifest();
        jumpToSentence(0, false);
    } catch (err) {
        alert("Error generating practice: " + err.message);
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.innerText = "Generate Practice (Fast)";
    }
});

genZhBtn.addEventListener('click', async () => {
    if (!manifest) return;
    genZhBtn.disabled = true;
    translationEngine.disabled = true;
    
    const engine = translationEngine.value;
    
    try {
        await fetch('/api/generate_chinese_fast', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ run_id: manifest.run_id, engine: engine, chunk_mode: 'halves' })
        });
        
        translationProgressBox.classList.remove('hidden');
        translationProgressFill.style.width = '0%';
        translationProgressText.innerText = `Translating via ${engine}...`;

        if (statusPollInterval) clearInterval(statusPollInterval);
        if (manifestPollInterval) clearInterval(manifestPollInterval);
        
        statusPollInterval = setInterval(async () => {
            const res = await fetch(`/api/translation_status/${manifest.run_id}`);
            if (res.ok) {
                const stat = await res.json();
                if(stat.percent !== undefined) {
                    translationProgressFill.style.width = `${stat.percent}%`;
                }
                translationProgressText.innerText = `Translation: ${stat.percent}% (${stat.completed_chunks}/${stat.total_chunks})`;
                
                if (stat.status === 'done' || stat.status === 'failed') {
                    clearInterval(statusPollInterval);
                    genZhBtn.disabled = false;
                    translationEngine.disabled = false;
                    if(stat.status === 'failed') {
                        translationProgressText.innerText = `Translation Failed: ${stat.message}`;
                    } else {
                        translationProgressText.innerText = `Translation Completed`;
                        genZhBtn.innerText = "Chinese Generated";
                        genZhBtn.disabled = true;
                        translationEngine.disabled = true;
                    }
                }
            }
        }, 1000);

        manifestPollInterval = setInterval(async () => {
            const res = await fetch(`/api/manifest/${manifest.run_id}`);
            if (res.ok) {
                manifest = await res.json();
                updateZhUI();
                updateDebugPanel();
                
                const allDone = manifest.sentences.every(s => s.zh_status === 'done' || s.zh_status === 'failed');
                if (allDone) {
                    clearInterval(manifestPollInterval);
                }
            }
        }, 2000);
    } catch (e) {
        alert("Error requesting Chinese generation.");
        genZhBtn.disabled = false;
        translationEngine.disabled = false;
    }
});


// --- Render & DOM Updates ---
function renderManifest() {
    textArea.innerHTML = manifest.sentences.map((s, i) => {
        const wordsHtml = s.words.map((w, wi) => {
            const safeWord = cleanWord(w.text);
            return `<span class="word" data-word-index="${wi}" data-start="${w.start}" data-end="${w.end}" data-word-text="${safeWord}">${w.text}</span> `;
        }).join('');

        let zhHtml = s.zh || "";
        if (s.zh_segments && s.zh_segments.length > 0) {
            zhHtml = s.zh_segments.map(seg => {
                return `<span class="zh-segment" data-start-word="${seg.start_word}" data-end-word="${seg.end_word}">${seg.text}</span>`;
            }).join(' ');
        }

        return `
            <div class="sentence-row" data-sentence-index="${i}" id="s-${i}">
                <button class="sentence-play-btn" data-sentence-index="${i}">▶</button>
                <div class="sentence-content">
                    <div class="en">${wordsHtml}</div>
                    <div class="zh-line" id="zh-line-${i}">${zhHtml}</div>
                </div>
            </div>
        `;
    }).join('');
    
    // Bind click events on words immediately after rendering
    document.querySelectorAll('.word').forEach(span => {
        span.addEventListener('click', handleWordClick);
    });
    
    let vocabHtml = `<h3>Core Words</h3><ul>`;
    manifest.vocab.core_words.forEach(v => {
        vocabHtml += `<li><strong>${v.word}</strong> `;
        if (v.ipa) vocabHtml += `<span class="ipa">${v.ipa}</span> `;
        if (v.pos) vocabHtml += `<span class="pos">${v.pos}</span> `;
        vocabHtml += `<span class="zh">${v.zh}</span></li>`;
    });
    vocabHtml += `</ul><h3>Core Phrases</h3><ul>`;
    manifest.vocab.core_phrases.forEach(v => {
        vocabHtml += `<li><strong>${v.phrase}</strong> <span class="zh">${v.zh}</span></li>`;
    });
    vocabHtml += `</ul>`;
    vocabArea.innerHTML = vocabHtml;
    
    updateDebugPanel();
    updatePlayButtonVisuals();
}

function updateZhUI() {
    manifest.sentences.forEach((s, i) => {
        const sentenceDiv = document.getElementById(`s-${i}`);
        if (!sentenceDiv) return;
        
        const zhLine = sentenceDiv.querySelector(`#zh-line-${i}`);
        if (!zhLine) return;

        let zhHtml = s.zh || "";
        if (s.zh_segments && s.zh_segments.length > 0) {
            zhHtml = s.zh_segments.map(seg => {
                return `<span class="zh-segment" data-start-word="${seg.start_word}" data-end-word="${seg.end_word}">${seg.text}</span>`;
            }).join(' ');
        }
        
        zhLine.innerHTML = zhHtml;
    });
}

function updatePlayButtonVisuals() {
    document.querySelectorAll('.sentence-play-btn').forEach(btn => {
        const idx = parseInt(btn.dataset.sentenceIndex);
        if (idx === currentSentenceIndex && isPlaying) {
            btn.innerText = "❚❚";
        } else {
            btn.innerText = "▶";
        }
    });
}

function scrollSentenceIntoCenter(index) {
    const el = document.querySelector(`[data-sentence-index="${index}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
}

function updateArticlePlayingClass() {
    if (isPlaying) {
        document.body.classList.add("article-playing");
    } else {
        document.body.classList.remove("article-playing");
    }
}

function showWordSpeakHint(message) {
    if (!wordSpeakStatus) return;
    
    const text = String(message || "");
    wordSpeakStatus.textContent = text.length > 80 ? text.slice(0, 80) + "..." : text;
    wordSpeakStatus.classList.add('show');
    
    clearTimeout(window.wordSpeakStatusTimer);
    window.wordSpeakStatusTimer = setTimeout(() => {
        wordSpeakStatus.textContent = "";
        wordSpeakStatus.classList.remove('show');
    }, 1500);
}

function speakSingleWord(word, el = null) {
    const clean = cleanWord(word);
    if (!clean) return;

    if (!("speechSynthesis" in window)) {
        showWordSpeakHint("Speech synthesis is not supported in this browser.");
        return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = "en-US";
    utterance.rate = 0.85;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const usVoice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith("en-us"));
    if (usVoice) utterance.voice = usVoice;

    if (el) {
        document.querySelectorAll(".speaking-word")
            .forEach(node => node.classList.remove("speaking-word"));
        el.classList.add("speaking-word");

        utterance.onend = () => {
            el.classList.remove("speaking-word");
        };

        utterance.onerror = () => {
            el.classList.remove("speaking-word");
        };
    }

    showWordSpeakHint(`Speaking: ${clean}`);
    window.speechSynthesis.speak(utterance);
}

function handleWordClick(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!audio.paused && !audio.ended && audio.currentTime > 0 && isPlaying) {
        showWordSpeakHint("Pause article first to hear individual words.");
        return;
    }

    const el = event.currentTarget;
    const word = el.dataset.wordText;

    if (!word) return;

    speakSingleWord(word, el);
}

// --- Event Delegation for Clickable Sentences ---
textArea.addEventListener('click', (e) => {
    // Check if clicking on .word is intercepted by handleWordClick (via stopPropagation)
    if (e.target.closest(".word")) {
        return;
    }

    // Check if clicking on play button
    const btn = e.target.closest('.sentence-play-btn');
    if (btn) {
        const idx = parseInt(btn.dataset.sentenceIndex);
        jumpToSentence(idx, true);
        return;
    }
    
    // Check if clicking row
    const row = e.target.closest('.sentence-row');
    if (row) {
        const idx = parseInt(row.dataset.sentenceIndex);
        jumpToSentence(idx, isPlaying);
    }
});

textArea.addEventListener('dblclick', (e) => {
    if (e.target.closest(".word")) {
        return;
    }
    
    const row = e.target.closest('.sentence-row');
    if (row) {
        const idx = parseInt(row.dataset.sentenceIndex);
        jumpToSentence(idx, true);
    }
});

// --- Core Playback Logic ---
async function jumpToSentence(index, shouldPlay = true) {
    if (!manifest || !manifest.sentences[index]) return;

    cancelAnimationFrame(rafId);

    currentSentenceIndex = index;
    activeWordIndex = -1;

    document.querySelectorAll('.sentence-row').forEach(el => el.classList.remove('active-sentence'));
    const activeS = document.getElementById(`s-${index}`);
    if (activeS) activeS.classList.add('active-sentence');

    document.querySelectorAll('.active-word').forEach(el => el.classList.remove('active-word'));
    document.querySelectorAll('.active-zh-segment').forEach(el => el.classList.remove('active-zh-segment'));

    scrollSentenceIntoCenter(index);

    const sentence = manifest.sentences[index];
    audio.pause();
    audio.src = sentence.audio_url;
    audio.currentTime = 0;
    audio.playbackRate = parseFloat(speedSelect.value);

    updateProgress();
    updateDebugPanel();

    if (shouldPlay) {
        isPlaying = true;
        updatePlayPauseBtn();
        updatePlayButtonVisuals();
        updateArticlePlayingClass();
        try {
            await audio.play();
            rafId = requestAnimationFrame(updateWordHighlight);
        } catch(e) { console.log("Play interrupted", e); }
    } else {
        isPlaying = false;
        updatePlayPauseBtn();
        updatePlayButtonVisuals();
        updateArticlePlayingClass();
    }
}

function updateWordHighlight() {
    if (!manifest || currentSentenceIndex < 0) return;
    const currentSentence = manifest.sentences[currentSentenceIndex];
    
    const t = audio.currentTime;
    const words = currentSentence.words || [];

    let nextIndex = -1;

    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const end = w.end + 0.05;
        if (t >= w.start && t < end) {
            nextIndex = i;
            break;
        }
    }

    if (nextIndex !== activeWordIndex) {
        document.querySelectorAll(".word.active-word").forEach(el => el.classList.remove("active-word"));
        document.querySelectorAll(".zh-segment.active-zh-segment").forEach(el => el.classList.remove("active-zh-segment"));
        
        if (nextIndex >= 0) {
            const currentSentenceDiv = document.getElementById(`s-${currentSentenceIndex}`);
            if (currentSentenceDiv) {
                const el = currentSentenceDiv.querySelector(`[data-word-index="${nextIndex}"]`);
                if (el) el.classList.add("active-word");
                
                const zhSegs = currentSentenceDiv.querySelectorAll('.zh-segment');
                zhSegs.forEach(seg => {
                    const start = parseInt(seg.getAttribute('data-start-word'));
                    const end = parseInt(seg.getAttribute('data-end-word'));
                    if (nextIndex >= start && nextIndex <= end) {
                        seg.classList.add('active-zh-segment');
                    }
                });
            }
        }

        activeWordIndex = nextIndex;
    }

    updateDebugPanel();

    if (!audio.paused && !audio.ended) {
        rafId = requestAnimationFrame(updateWordHighlight);
    }
}

audio.addEventListener('play', () => {
    updateArticlePlayingClass();
});

audio.addEventListener('pause', () => {
    updateArticlePlayingClass();
});

audio.addEventListener('ended', async () => {
    cancelAnimationFrame(rafId);
    document.querySelectorAll('.active-word').forEach(el => el.classList.remove('active-word'));
    document.querySelectorAll('.active-zh-segment').forEach(el => el.classList.remove('active-zh-segment'));
    
    if (currentSentenceIndex < manifest.sentences.length - 1) {
        await jumpToSentence(currentSentenceIndex + 1, true);
    } else {
        isPlaying = false;
        updatePlayPauseBtn();
        updatePlayButtonVisuals();
        updateArticlePlayingClass();
    }
    updateDebugPanel();
});

// Load voices proactively
if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
}

// --- Nav Controls ---
restartBtn.addEventListener('click', () => jumpToSentence(0, true));
resumeBtn.addEventListener('click', () => jumpToSentence(currentSentenceIndex, true));

playPauseBtn.addEventListener('click', () => {
    if (!manifest) return;
    
    if (isPlaying) {
        audio.pause();
        cancelAnimationFrame(rafId);
        isPlaying = false;
    } else {
        if (!audio.src || audio.src === window.location.href) {
            jumpToSentence(currentSentenceIndex, true);
            return;
        }
        isPlaying = true;
        audio.play().catch(e => console.log(e));
        rafId = requestAnimationFrame(updateWordHighlight);
    }
    updatePlayPauseBtn();
    updatePlayButtonVisuals();
    updateArticlePlayingClass();
});

function updatePlayPauseBtn() {
    playPauseBtn.innerText = isPlaying ? "Pause" : "Play";
}

speedSelect.addEventListener('change', (e) => {
    audio.playbackRate = parseFloat(e.target.value);
    localStorage.setItem("playbackSpeed", e.target.value);
});

function updateProgress() {
    progressText.innerText = `Sentence ${currentSentenceIndex + 1} / ${manifest.sentences.length}`;
}

function updateDebugPanel() {
    document.getElementById('dbg-s-idx').innerText = currentSentenceIndex;
    document.getElementById('dbg-time').innerText = audio.currentTime.toFixed(3);
    document.getElementById('dbg-w-idx').innerText = activeWordIndex;
    
    let wText = "";
    let wLen = 0;
    let zhLen = 0;
    let pendingCount = 0;
    
    if (manifest) {
        pendingCount = manifest.sentences.filter(s => s.zh_status === 'pending').length;
        if (manifest.sentences[currentSentenceIndex]) {
            const s = manifest.sentences[currentSentenceIndex];
            wLen = s.words ? s.words.length : 0;
            zhLen = s.zh_segments ? s.zh_segments.length : 0;
            if (activeWordIndex >= 0 && activeWordIndex < wLen) {
                wText = s.words[activeWordIndex].text;
            }
        }
    }
    document.getElementById('dbg-w-text').innerText = wText;
    document.getElementById('dbg-w-len').innerText = wLen;
    document.getElementById('dbg-zh-len').innerText = zhLen;
    document.getElementById('dbg-pending-zh').innerText = pendingCount;
    
    const currentSentenceDiv = document.getElementById(`s-${currentSentenceIndex}`);
    let wordCount = 0;
    let activeCount = 0;
    if (currentSentenceDiv) {
        wordCount = currentSentenceDiv.querySelectorAll('.word').length;
        activeCount = currentSentenceDiv.querySelectorAll('.active-word').length;
    }
    document.getElementById('dbg-word-count').innerText = wordCount;
    document.getElementById('dbg-active-count').innerText = activeCount;
}


// --- Keyboard Controls ---
document.addEventListener('keydown', (e) => {
    // Only intercept Space key if we're not typing in an input/textarea
    if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault(); // Prevent page scrolling
        if (manifest) {
            playPauseBtn.click(); // Trigger the exact same logic as Play/Pause button
        }
    }
});

// ═══════════════════════════════════════════════════════════
//  新增模块 1：播客导出按钮
// ═══════════════════════════════════════════════════════════
const dlPodcastBtn          = document.getElementById('dl-podcast-btn');
const podcastModeSelect     = document.getElementById('podcast-mode-select');
const podcastMultiplierSel  = document.getElementById('podcast-multiplier-select');

dlPodcastBtn.addEventListener('click', () => {
    if (!manifest) return;
    const mode       = podcastModeSelect.value;
    const multiplier = podcastMultiplierSel.value;
    const url = `/api/download/podcast?run_id=${manifest.run_id}&mode=${mode}&multiplier=${multiplier}`;
    dlPodcastBtn.disabled = true;
    dlPodcastBtn.innerText = '⏳ Generating...';
    checkDownloadResponse(url).finally(() => {
        dlPodcastBtn.disabled = false;
        dlPodcastBtn.innerText = '🎧 DL Podcast';
    });
});

// ═══════════════════════════════════════════════════════════
//  新增模块 2：Anki 导出按钮
// ═══════════════════════════════════════════════════════════
const dlAnkiBtn = document.getElementById('dl-anki-btn');

dlAnkiBtn.addEventListener('click', () => {
    if (!manifest) return;
    const hasZh = manifest.sentences.some(s => s.zh && s.zh.trim());
    if (!hasZh) {
        alert('请先生成中文翻译后再导出 Anki 卡片。');
        return;
    }
    const url = `/api/download/anki?run_id=${manifest.run_id}`;
    dlAnkiBtn.disabled = true;
    dlAnkiBtn.innerText = '⏳ Packing...';
    checkDownloadResponse(url).finally(() => {
        dlAnkiBtn.disabled = false;
        dlAnkiBtn.innerText = '📦 Export Anki';
    });
});

// ═══════════════════════════════════════════════════════════
//  新增模块 3：Shadowing Mode — 跟读评测
// ═══════════════════════════════════════════════════════════
let activeRecognition = null;

function levenshteinWords(a, b) {
    // 单词级编辑距离
    const aW = a, bW = b;
    const m = aW.length, n = bW.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (aW[i-1] === bW[j-1]) dp[i][j] = dp[i-1][j-1];
            else dp[i][j] = 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
        }
    }
    return dp[m][n];
}

function diffWordsArr(originalWords, spokenWords) {
    // 返回原文单词数组，每个词带 correct: bool
    const spokenSet = new Set(spokenWords.map(w => w.replace(/[^\p{L}'-]/gu, '').toLowerCase()));
    return originalWords.map(w => {
        const clean = w.replace(/[^\p{L}'-]/gu, '').toLowerCase();
        return { text: w, correct: clean.length > 0 && spokenSet.has(clean) };
    });
}

function startShadowing(sentenceIdx) {
    if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) {
        showWordSpeakHint('浏览器不支持语音识别，请使用 Chrome 或 Safari。');
        return;
    }

    // 暂停正在播放的音频
    if (isPlaying) {
        audio.pause();
        cancelAnimationFrame(rafId);
        isPlaying = false;
        updatePlayPauseBtn();
        updatePlayButtonVisuals();
        updateArticlePlayingClass();
    }

    const sentenceDiv = document.getElementById(`s-${sentenceIdx}`);
    if (!sentenceDiv) return;

    const micBtn = sentenceDiv.querySelector('.shadowing-btn');
    if (!micBtn) return;

    // 已在录音 → 取消
    if (activeRecognition) {
        activeRecognition.abort();
        activeRecognition = null;
        micBtn.classList.remove('recording');
        micBtn.innerText = '🎙';
        return;
    }

    // 3 秒倒计时
    let countdown = document.createElement('div');
    countdown.className = 'shadowing-countdown';
    sentenceDiv.style.position = 'relative';
    sentenceDiv.appendChild(countdown);

    let count = 3;
    countdown.innerText = count;
    const timer = setInterval(() => {
        count--;
        if (count <= 0) {
            clearInterval(timer);
            sentenceDiv.removeChild(countdown);
            beginRecognition(sentenceIdx, sentenceDiv, micBtn);
        } else {
            countdown.innerText = count;
        }
    }, 1000);
}

function beginRecognition(sentenceIdx, sentenceDiv, micBtn) {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRec();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    activeRecognition = rec;
    micBtn.classList.add('recording');
    micBtn.innerText = '⏹';

    rec.onresult = (event) => {
        const spoken = event.results[0][0].transcript.toLowerCase();
        const original = manifest.sentences[sentenceIdx].en;
        const origWords = original.split(/\s+/);
        const spokWords = spoken.split(/\s+/);

        const diffResult = diffWordsArr(origWords, spokWords);
        const correctCount = diffResult.filter(w => w.correct).length;
        const score = Math.round((correctCount / Math.max(diffResult.length, 1)) * 100);

        // 重绘英文单词高亮
        const enDiv = sentenceDiv.querySelector('.en');
        if (enDiv) {
            // 保留原有 word span 结构，只改 class
            const wordSpans = enDiv.querySelectorAll('.word');
            wordSpans.forEach((span, wi) => {
                span.classList.remove('word-correct', 'word-wrong');
                if (wi < diffResult.length) {
                    span.classList.add(diffResult[wi].correct ? 'word-correct' : 'word-wrong');
                }
            });
        }

        // 显示得分气泡
        let badge = sentenceDiv.querySelector('.shadowing-score-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'shadowing-score-badge';
            const content = sentenceDiv.querySelector('.sentence-content');
            if (content) content.appendChild(badge);
        }
        badge.innerText = `${score}%`;
        badge.className = 'shadowing-score-badge ' + (score >= 80 ? 'score-high' : score >= 50 ? 'score-mid' : 'score-low');

        showWordSpeakHint(`跟读得分：${score}%`);
    };

    rec.onerror = (e) => {
        showWordSpeakHint(`语音识别错误：${e.error}`);
    };

    rec.onend = () => {
        activeRecognition = null;
        micBtn.classList.remove('recording');
        micBtn.innerText = '🎙';
        // 通知 pitch 采集停止
        document.dispatchEvent(new CustomEvent('shadowing-ended'));
    };

    rec.start();
}

// 把 🎙 按钮注入每个 sentence-row（在 renderManifest 执行后调用）
function injectShadowingButtons() {
    document.querySelectorAll('.sentence-row').forEach(row => {
        if (row.querySelector('.shadowing-btn')) return; // 避免重复注入
        const idx = parseInt(row.dataset.sentenceIndex);
        const btn = document.createElement('button');
        btn.className = 'shadowing-btn';
        btn.title = '跟读评测（Shadowing）';
        btn.innerText = '🎙';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            startShadowing(idx);
        });
        row.appendChild(btn);
    });
}

// Hook renderManifest 之后自动注入按钮
const _origRenderManifest = renderManifest;
window.renderManifest = function() {
    _origRenderManifest();
    injectShadowingButtons();
};
// 直接覆盖全局同名函数（renderManifest 在同一文件中已用 function 声明）
// 方案：在 DOMContentLoaded 之后，每次调用原函数时追加
(function patchRenderManifest() {
    // 包装：每当调用 renderManifest 后自动注入 shadowing 按钮
    const orig = renderManifest;
    // 由于 renderManifest 是 function 声明，重新赋值给全局变量需要用 window
    // 此处通过 MutationObserver 监听 text-area 的内容变化更可靠
    const observer = new MutationObserver(() => {
        injectShadowingButtons();
    });
    observer.observe(document.getElementById('text-area'), { childList: true, subtree: false });
})();

// ═══════════════════════════════════════════════════════════
//  新增模块 4：Pitch Contour 实时音高可视化
// ═══════════════════════════════════════════════════════════
const pitchCanvasContainer = document.getElementById('pitch-canvas-container');
const pitchCanvas          = document.getElementById('pitch-canvas');
const pitchStatusText      = document.getElementById('pitch-status-text');
const pitchCtx             = pitchCanvas.getContext('2d');

let audioCtx        = null;
let analyserNative  = null;
let sourceNode      = null;
let pitchRafId      = null;

// 原声音高数据（当前句子播放期间积累）
let nativePitchData  = [];
// 用户跟读音高数据
let userPitchData    = [];
let userAnalyser     = null;
let userStream       = null;
let userPitchRafId   = null;

function initAudioContext() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

// 简化版 YIN 基频估算（在时域缓冲上检测周期性）
function estimatePitch(buffer, sampleRate) {
    const SIZE = buffer.length;
    const yinBuffer = new Float32Array(SIZE / 2);
    let runningSum = 0;

    for (let tau = 1; tau < SIZE / 2; tau++) {
        let sum = 0;
        for (let i = 0; i < SIZE / 2; i++) {
            const diff = buffer[i] - buffer[i + tau];
            sum += diff * diff;
        }
        yinBuffer[tau] = sum;
        runningSum += sum;
        yinBuffer[tau] *= tau / runningSum;
    }

    // 找第一个低于阈值的 tau
    const threshold = 0.1;
    for (let tau = 2; tau < SIZE / 2; tau++) {
        if (yinBuffer[tau] < threshold) {
            while (tau + 1 < SIZE / 2 && yinBuffer[tau + 1] < yinBuffer[tau]) tau++;
            return sampleRate / tau;
        }
    }
    return -1; // 无音高（静音或噪音）
}

function resizeCanvas() {
    pitchCanvas.width  = pitchCanvas.offsetWidth  * window.devicePixelRatio;
    pitchCanvas.height = pitchCanvas.offsetHeight * window.devicePixelRatio;
    pitchCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
}

function drawPitchCurve(data, color, canvasW, canvasH) {
    if (data.length < 2) return;
    const validData = data.filter(p => p > 0);
    if (validData.length < 2) return;

    const minP = 60, maxP = 400; // Hz 范围
    pitchCtx.beginPath();
    pitchCtx.strokeStyle = color;
    pitchCtx.lineWidth = 2;
    pitchCtx.lineJoin = 'round';

    let started = false;
    data.forEach((pitch, i) => {
        if (pitch <= 0) return;
        const x = (i / (data.length - 1)) * canvasW;
        const y = canvasH - ((Math.min(maxP, Math.max(minP, pitch)) - minP) / (maxP - minP)) * canvasH;
        if (!started) { pitchCtx.moveTo(x, y); started = true; }
        else pitchCtx.lineTo(x, y);
    });
    pitchCtx.stroke();
}

function renderPitchCanvas() {
    resizeCanvas();
    const W = pitchCanvas.offsetWidth;
    const H = pitchCanvas.offsetHeight;
    pitchCtx.clearRect(0, 0, W, H);

    // 背景网格
    pitchCtx.strokeStyle = 'rgba(255,255,255,0.05)';
    pitchCtx.lineWidth = 1;
    for (let y = 0; y < H; y += H / 4) {
        pitchCtx.beginPath();
        pitchCtx.moveTo(0, y);
        pitchCtx.lineTo(W, y);
        pitchCtx.stroke();
    }

    drawPitchCurve(nativePitchData, '#f97316', W, H);
    drawPitchCurve(userPitchData,   '#38bdf8', W, H);
}

// 原声 pitch 采集（挂在 audio 元素上）
function startNativePitchCapture() {
    initAudioContext();
    if (!analyserNative) {
        analyserNative = audioCtx.createAnalyser();
        analyserNative.fftSize = 2048;
        if (!sourceNode) {
            sourceNode = audioCtx.createMediaElementSource(audio);
            sourceNode.connect(analyserNative);
            analyserNative.connect(audioCtx.destination);
        }
    }

    nativePitchData = [];
    pitchCanvasContainer.classList.remove('hidden');
    pitchStatusText.innerText = '🎵 播放中...';

    const buffer = new Float32Array(analyserNative.fftSize);
    function loop() {
        if (audio.paused || audio.ended) {
            pitchStatusText.innerText = '🎵 播放结束';
            return;
        }
        analyserNative.getFloatTimeDomainData(buffer);
        const pitch = estimatePitch(buffer, audioCtx.sampleRate);
        if (pitch > 60 && pitch < 600) nativePitchData.push(pitch);
        else nativePitchData.push(0);

        renderPitchCanvas();
        pitchRafId = requestAnimationFrame(loop);
    }
    cancelAnimationFrame(pitchRafId);
    pitchRafId = requestAnimationFrame(loop);
}

function stopNativePitchCapture() {
    cancelAnimationFrame(pitchRafId);
    renderPitchCanvas();
}

// 用户麦克风 pitch 采集（Shadowing 时调用）
async function startUserPitchCapture() {
    try {
        userStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        initAudioContext();
        const source = audioCtx.createMediaStreamSource(userStream);
        userAnalyser = audioCtx.createAnalyser();
        userAnalyser.fftSize = 2048;
        source.connect(userAnalyser);

        userPitchData = [];
        pitchCanvasContainer.classList.remove('hidden');
        pitchStatusText.innerText = '🎙 录音中...';

        const buffer = new Float32Array(userAnalyser.fftSize);
        function loop() {
            if (!userStream || !userStream.active) {
                pitchStatusText.innerText = '🎙 录音结束';
                return;
            }
            userAnalyser.getFloatTimeDomainData(buffer);
            const pitch = estimatePitch(buffer, audioCtx.sampleRate);
            if (pitch > 60 && pitch < 600) userPitchData.push(pitch);
            else userPitchData.push(0);

            renderPitchCanvas();
            userPitchRafId = requestAnimationFrame(loop);
        }
        cancelAnimationFrame(userPitchRafId);
        userPitchRafId = requestAnimationFrame(loop);
    } catch (e) {
        pitchStatusText.innerText = '麦克风权限被拒绝';
    }
}

function stopUserPitchCapture() {
    cancelAnimationFrame(userPitchRafId);
    if (userStream) {
        userStream.getTracks().forEach(t => t.stop());
        userStream = null;
    }
    renderPitchCanvas();
    pitchStatusText.innerText = '🎙 录音已停止';
}

// Hook 到音频播放事件
audio.addEventListener('play', () => {
    startNativePitchCapture();
});
audio.addEventListener('pause', () => {
    stopNativePitchCapture();
});
audio.addEventListener('ended', () => {
    stopNativePitchCapture();
});


// Shadowing 与 Pitch 联动：包装 startShadowing，在倒计时结束前先启动用户音高采集
window._origStartShadowing = startShadowing;
window.startShadowing = function(sentenceIdx) {
    userPitchData = [];
    startUserPitchCapture(); // 异步启动麦克风 pitch，不阻塞倒计时
    window._origStartShadowing(sentenceIdx);
};

// 当录音结束时停止用户 pitch 采集（通过 CustomEvent 触发）
document.addEventListener('shadowing-ended', stopUserPitchCapture);


