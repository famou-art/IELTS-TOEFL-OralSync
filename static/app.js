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
const prevBtn = document.getElementById('prev-btn');
const playPauseBtn = document.getElementById('play-pause-btn');
const resumeBtn = document.getElementById('resume-btn');
const nextBtn = document.getElementById('next-btn');

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
prevBtn.addEventListener('click', () => jumpToSentence(Math.max(0, currentSentenceIndex - 1), isPlaying));
nextBtn.addEventListener('click', () => jumpToSentence(Math.min(manifest.sentences.length - 1, currentSentenceIndex + 1), isPlaying));

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
