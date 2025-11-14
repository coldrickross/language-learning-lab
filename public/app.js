// app.js

const RANKS = [
  { name: "Copper 3", minXP: 0, minKnown: 0 },
  { name: "Copper 2", minXP: 100, minKnown: 10 },
  { name: "Copper 1", minXP: 250, minKnown: 20 },
  { name: "Bronze 3", minXP: 400, minKnown: 40 },
  { name: "Bronze 2", minXP: 700, minKnown: 70 },
  { name: "Bronze 1", minXP: 1100, minKnown: 100 },
  { name: "Silver 3", minXP: 1600, minKnown: 150 },
  { name: "Silver 2", minXP: 2200, minKnown: 220 },
  { name: "Silver 1", minXP: 2900, minKnown: 300 },
  { name: "Gold 3", minXP: 3800, minKnown: 400 },
  { name: "Gold 2", minXP: 4800, minKnown: 520 },
  { name: "Gold 1", minXP: 6000, minKnown: 650 }
];

// Built-in starter vocab (super basic PT-BR)
const DEFAULT_STARTER_VOCAB = [
  "eu","você","ele","ela","nós","eles","vocês",
  "meu","minha","seu","sua",
  "a","o","um","uma","de","do","da","em","para","com","sem","por",
  "sim","não","talvez","aqui","ali","lá","hoje","amanhã","ontem",
  "casa","rua","cidade","trabalho","escola","mercado","loja","restaurante",
  "homem","mulher","amigo","amiga","filho","filha","pai","mãe","gente",
  "dia","noite","tarde","manhã","tempo","hora","minuto","ano",
  "comer","beber","falar","andar","correr","ver","ouvir","abrir","fechar","entrar","sair","trabalhar","estudar","gostar","amar","querer","poder",
  "bom","boa","ruim","feliz","triste","cansado","cansada","calmo","calma",
  "grande","pequeno","novo","velho","quente","frio"
];

let state = {
  xp: 0,
  words: {},
  xpHistory: []
};

let currentStory = null;

const STORAGE_KEY = "languageLearningLabState";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        state = {
          xp: parsed.xp || 0,
          words: parsed.words || {},
          xpHistory: parsed.xpHistory || []
        };
      }
    }
  } catch (e) {
    console.error("Failed to load state:", e);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to save state:", e);
  }
}

function normalizeWord(token) {
  if (!token) return "";
  const cleaned = token
    .toLowerCase()
    .replace(/^[«»"“”'(){}\[\],.!?:;]+/, "")
    .replace(/[«»"“”'(){}\[\],.!?:;]+$/, "");
  return cleaned;
}

function getKnownWords() {
  return Object.entries(state.words)
    .filter(([, meta]) => meta.status === "known")
    .map(([w]) => w);
}

function getLearningWords() {
  return Object.entries(state.words)
    .filter(([, meta]) => meta.status === "learning")
    .map(([w]) => w);
}

function getWordMeta(word) {
  return state.words[word];
}

function setWordMeta(word, meta) {
  state.words[word] = meta;
}

function computeRankInfo() {
  const knownCount = getKnownWords().length;
  const xp = state.xp;

  let current = RANKS[0];
  for (const rank of RANKS) {
    if (xp >= rank.minXP && knownCount >= rank.minKnown) {
      current = rank;
    }
  }

  const currentIndex = RANKS.indexOf(current);
  const next = RANKS[currentIndex + 1] || current;

  const minXP = current.minXP;
  const maxXP = next.minXP > minXP ? next.minXP : minXP + 1;
  const progress =
    maxXP === minXP ? 1 : Math.max(0, Math.min(1, (xp - minXP) / (maxXP - minXP)));

  return {
    currentRank: current,
    nextRank: next,
    knownCount,
    xp,
    progress
  };
}

const rankValueEl = document.getElementById("rankValue");
const xpValueEl = document.getElementById("xpValue");
const xpNextValueEl = document.getElementById("xpNextValue");
const xpBarFillEl = document.getElementById("xpBarFill");
const knownCountEl = document.getElementById("knownCount");
const learningCountEl = document.getElementById("learningCount");

const knownWordsInputEl = document.getElementById("knownWordsInput");
const saveKnownWordsBtn = document.getElementById("saveKnownWordsBtn");
const resetAppBtn = document.getElementById("resetAppBtn");

const storyLengthSelect = document.getElementById("storyLengthSelect");
const generateStoryBtn = document.getElementById("generateStoryBtn");
const storyContainerEl = document.getElementById("storyContainer");
const finishStoryBtn = document.getElementById("finishStoryBtn");
const storyInfoEl = document.getElementById("storyInfo");

const logEl = document.getElementById("log");

function refreshStatsUI() {
  const rankInfo = computeRankInfo();
  const learningCount = getLearningWords().length;

  rankValueEl.textContent = rankInfo.currentRank.name;
  xpValueEl.textContent = rankInfo.xp.toString();
  xpNextValueEl.textContent = rankInfo.nextRank.minXP.toString();
  xpBarFillEl.style.width = (rankInfo.progress * 100).toFixed(1) + "%";

  knownCountEl.textContent = rankInfo.knownCount.toString();
  learningCountEl.textContent = learningCount.toString();

  const knownWords = getKnownWords();
  if (!knownWordsInputEl.dataset.userTouched) {
    knownWordsInputEl.value = knownWords.join(", ");
  }
}

function addLogEntry(text) {
  const entry = document.createElement("div");
  entry.className = "log-entry";
  const now = new Date();
  const stamp = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  entry.innerHTML = `<span>[${stamp}]</span> ${text}`;
  logEl.prepend(entry);
}

function clearStory() {
  storyContainerEl.innerHTML = '<p class="placeholder">Click "Generate new story" to start.</p>';
  storyInfoEl.textContent = "";
  currentStory = null;
  finishStoryBtn.disabled = true;
}

let currentStory = null;

function renderStory(text) {
  const tokens = text.split(/\s+/).filter(Boolean);
  const container = document.createElement("div");

  currentStory = {
    text,
    tokens,
    clickedWordsSet: new Set(),
    counts: {
      total: 0,
      knownTokens: 0,
      learningTokens: 0,
      otherTokens: 0
    }
  };

  tokens.forEach((token, index) => {
    const word = normalizeWord(token);
    const span = document.createElement("span");
    span.className = "word";
    span.textContent = token + " ";
    span.dataset.word = word;

    const meta = word ? getWordMeta(word) : null;

    if (word) {
      currentStory.counts.total += 1;
      if (meta) {
        if (meta.status === "known") {
          currentStory.counts.knownTokens += 1;
        } else if (meta.status === "learning") {
          currentStory.counts.learningTokens += 1;
        } else {
          currentStory.counts.otherTokens += 1;
        }
      } else {
        currentStory.counts.otherTokens += 1;
      }
    }

    span.addEventListener("click", () => {
      toggleUnknownWord(span);
    });

    container.appendChild(span);

    if ((index + 1) % 20 === 0) {
      container.appendChild(document.createElement("br"));
    }
  });

  storyContainerEl.innerHTML = "";
  storyContainerEl.appendChild(container);
  finishStoryBtn.disabled = false;

  updateStoryInfoUI();
}

function toggleUnknownWord(span) {
  const word = span.dataset.word;
  if (!word) return;
  if (!currentStory) return;

  const set = currentStory.clickedWordsSet;
  if (span.classList.contains("unknown")) {
    span.classList.remove("unknown");
    set.delete(word);
  } else {
    span.classList.add("unknown");
    set.add(word);
  }

  updateStoryInfoUI();
}

function updateStoryInfoUI() {
  if (!currentStory) {
    storyInfoEl.textContent = "";
    return;
  }

  const total = currentStory.counts.total || 0;
  const clickedCount = currentStory.clickedWordsSet.size;
  const diffText =
    total > 0
      ? `Clicked unknown: ${clickedCount} words out of ~${total} tokens.`
      : `Clicked unknown: ${clickedCount} words.`;

  storyInfoEl.textContent = diffText;
}

function finishStoryAndUpdate() {
  if (!currentStory) return;

  const tokens = currentStory.tokens;
  const clickedSet = new Set(currentStory.clickedWordsSet);

  const prevWords = { ...state.words };

  let newClickedCount = 0;
  let learningCleanExposures = 0;

  tokens.forEach((token) => {
    const norm = normalizeWord(token);
    if (!norm) return;

    const clicked = clickedSet.has(norm);
    const prev = prevWords[norm];
    let meta = getWordMeta(norm);

    if (!meta) {
      meta = {
        status: "learning",
        mastery: 0,
        timesSeen: 0,
        timesClicked: 0
      };
    }

    meta.timesSeen = (meta.timesSeen || 0) + 1;

    if (clicked) {
      meta.timesClicked = (meta.timesClicked || 0) + 1;

      if (!prev) {
        newClickedCount += 1;
      }

      meta.mastery = Math.max(0, (meta.mastery || 0) - 15);
      meta.status = "learning";
    } else {
      if (prev && prev.status === "learning") {
        learningCleanExposures += 1;
      }

      if (!prev) {
        meta.status = "learning";
        meta.mastery = (meta.mastery || 0) + 20;
      } else if (prev.status === "learning") {
        meta.mastery = Math.min(100, (meta.mastery || 0) + 10);
      } else if (prev.status === "known") {
        meta.mastery = Math.min(100, (meta.mastery || 0) + 2);
      }

      if (meta.mastery >= 70) {
        meta.status = "known";
      }
    }

    setWordMeta(norm, meta);
  });

  const baseXP = 20;
  const xpFromNew = newClickedCount * 10;
  const xpFromLearning = learningCleanExposures * 3;
  const gainedXP = baseXP + xpFromNew + xpFromLearning;

  state.xp += gainedXP;
  state.xpHistory.push({
    date: new Date().toISOString(),
    xp: state.xp
  });

  saveState();
  refreshStatsUI();

  addLogEntry(
    `Story finished. XP +${gainedXP} (base ${baseXP}, new words ${xpFromNew}, learning exposures ${xpFromLearning}).`
  );

  clearStory();
}

async function generateStory() {
  const knownWords = getKnownWords();
  const learningWords = getLearningWords();
  const targetWordCount = parseInt(storyLengthSelect.value, 10) || 180;

  if (knownWords.length === 0 && learningWords.length === 0) {
    alert(
      "Starter vocabulary not loaded properly. Try refreshing the page."
    );
    return;
  }

  generateStoryBtn.disabled = true;
  generateStoryBtn.textContent = "Generating...";
  finishStoryBtn.disabled = true;
  storyContainerEl.innerHTML = '<p class="placeholder">Generating story...</p>';
  storyInfoEl.textContent = "";

  try {
    const res = await fetch("/api/story", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        knownWords,
        learningWords,
        targetWordCount
      })
    });

    if (!res.ok) {
      throw new Error("Server error: " + res.status);
    }

    const data = await res.json();
    if (!data.story) {
      throw new Error("No story returned from API");
    }

    renderStory(data.story);
    addLogEntry("New story generated.");
  } catch (err) {
    console.error("Story generation failed:", err);
    storyContainerEl.innerHTML =
      '<p class="placeholder">Failed to generate story. Check console and your API key.</p>';
  } finally {
    generateStoryBtn.disabled = false;
    generateStoryBtn.textContent = "Generate new story";
  }
}

function saveKnownWordsFromInput() {
  const text = knownWordsInputEl.value || "";
  const rawWords = text
    .split(/[\s,;]+/)
    .map(w => normalizeWord(w))
    .filter(Boolean);

  const newMap = {};
  rawWords.forEach((w) => {
    newMap[w] = {
      status: "known",
      mastery: 80,
      timesSeen: 0,
      timesClicked: 0
    };
  });

  Object.entries(state.words).forEach(([word, meta]) => {
    if (!newMap[word] && meta.status === "learning") {
      newMap[word] = meta;
    }
  });

  state.words = newMap;
  saveState();
  refreshStatsUI();
  addLogEntry(`Saved ${rawWords.length} known words from input.`);
}

function resetAllData() {
  if (!confirm("Really reset all data? This cannot be undone.")) return;
  state = {
    xp: 0,
    words: {},
    xpHistory: []
  };
  saveState();
  knownWordsInputEl.value = "";
  knownWordsInputEl.dataset.userTouched = "";
  clearStory();
  refreshStatsUI();
  addLogEntry("All data reset.");
}

saveKnownWordsBtn.addEventListener("click", saveKnownWordsFromInput);
resetAppBtn.addEventListener("click", resetAllData);
generateStoryBtn.addEventListener("click", generateStory);
finishStoryBtn.addEventListener("click", finishStoryAndUpdate);
knownWordsInputEl.addEventListener("input", () => {
  knownWordsInputEl.dataset.userTouched = "1";
});

function seedDefaultVocabIfEmpty() {
  if (Object.keys(state.words).length === 0) {
    const map = {};
    DEFAULT_STARTER_VOCAB.forEach((w) => {
      const norm = normalizeWord(w);
      if (!norm) return;
      map[norm] = {
        status: "known",
        mastery: 80,
        timesSeen: 0,
        timesClicked: 0
      };
    });
    state.words = map;
    saveState();
    addLogEntry("Loaded built-in starter vocabulary.");
  }
}

function init() {
  loadState();
  seedDefaultVocabIfEmpty();
  refreshStatsUI();
  clearStory();
  addLogEntry("Language Learning Lab ready.");
}

init();
