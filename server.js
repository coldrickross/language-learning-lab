// server.js
require("dotenv").config();
const express = require("express");
const path = require("path");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function buildPrompt(knownWords, learningWords, targetWordCount) {
  const knownList = (knownWords || []).slice(0, 150).join(", ");
  const learningList = (learningWords || []).slice(0, 40).join(", ");
  const wordCount = targetWordCount || 180;

  return `
O usuário está aprendendo português brasileiro lendo pequenas histórias.

Escreva uma história em português brasileiro com cerca de ${wordCount} palavras.

Regras:
- Use principalmente estas palavras já conhecidas pelo usuário quando fizer sentido: ${knownList || "(nenhuma lista, use vocabulário básico e simples)"}.
- Inclua naturalmente várias vezes estas palavras em foco (aprendendo): ${learningList || "(nenhuma palavra em foco)"}.
- A história deve ter cerca de 85 a 90 por cento de palavras que um iniciante/intermediário provavelmente reconhece, e 10 a 15 por cento de palavras um pouco mais novas ou desafiadoras.
- Mantenha frases curtas e claras, com situações concretas do dia a dia.
- Não explique nada em inglês, não traduza, não use listas. Apenas escreva o texto da história em um único bloco.

Saída: apenas a história em português, sem título e sem comentário extra.
  `.trim();
}

app.post("/api/story", async (req, res) => {
  try {
    const { knownWords, learningWords, targetWordCount } = req.body || {};

    const systemMessage = {
      role: "system",
      content: "Você é um professor de português brasileiro que cria histórias simples e claras para leitura graduada."
    };

    const userMessage = {
      role: "user",
      content: buildPrompt(knownWords, learningWords, targetWordCount)
    };

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [systemMessage, userMessage],
      temperature: 0.7
    });

    const story = completion.choices[0]?.message?.content?.trim();

    if (!story) {
      return res.status(500).json({ error: "No story returned from OpenAI" });
    }

    res.json({ story });
  } catch (err) {
    console.error("Error generating story:", err);
    res.status(500).json({ error: "Failed to generate story" });
  }
});

app.listen(PORT, () => {
  console.log(`Language Learning Lab running on http://localhost:${PORT}`);
});
