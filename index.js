require("dotenv").config();
const axios = require("axios");
const { OpenAI } = require("openai");
const fs = require("fs");
const path = require("path");

const API_URL = "https://api.openai.com/v1/chat/completions";
const API_KEY = process.env.OPENAI_API_KEY;

/**
 *
 * @param {string[]} knownWords - list words that the user knows to build sentences from
 * @param {string} targetWord - target word to learn
 * @param {string} prompt - prompt to create the sentence to be
 *
 * @returns {string} sentence with the target word, to then be converted to audio
 */
async function generateSentenceFromKnownWords(knownWords, targetWord, prompt) {
  try {
    const promptWithTargetWordAndLanguage = prompt
      .replace("<target-word>", targetWord)
      .replace("<language>", process.env.TARGET_LANGUAGE);

    console.log(promptWithTargetWordAndLanguage);

    const response = await axios.post(
      API_URL,
      {
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: promptWithTargetWordAndLanguage }],
        max_tokens: 50,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
      }
    );

    console.log("Tokens used:", response.data.usage.total_tokens);
    console.log(
      "Tokens cached:",
      response.data.usage.prompt_tokens_details.cached_tokens
    );
    console.log("Response:", response.data.choices[0].message.content);

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
  }
}

async function textToSpeech(sentence) {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const fileName =
      sentence.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9\-]/g, "") + ".mp3";
    const destDir = path.join(__dirname, "speech_files");

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir);
    }

    const voices = ["nova", "alloy", "echo", "fable", "shimmer"];
    const randomVoice = voices[Math.floor(Math.random() * voices.length)];

    console.log("Using voice", randomVoice, "to generate", sentence);

    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: randomVoice,
      input: sentence,
      format: "mp3",
      language: process.env.TARGET_LANGUAGE,
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    const filePath = path.join(destDir, fileName);
    await fs.promises.writeFile(filePath, buffer);

    console.log(`Audio file saved`);
  } catch (error) {
    console.error("Error generating speech audio:", error.message);
  }
}

async function run() {
  const targetWord = process.argv[2];
  const difficulty = process.argv[3];

  if (!targetWord || !difficulty) {
    console.error("Usage: node script.js <target-word> <a2 | b1 | b2>");
    process.exit(1);
  }

  let promptDifficulty = "";

  if (difficulty === "a2") promptDifficulty = process.env.BEGINNER_PROMPT;
  else if (difficulty === "b1")
    promptDifficulty = process.env.INTERMEDIATE_PROMPT;
  else if (difficulty === "b2") promptDifficulty = process.env.ADVANCED_PROMPT;

  const example1 = await generateSentenceFromKnownWords(
    [],
    targetWord,
    promptDifficulty
  );
  // const example2 = await generateSentenceFromKnownWords(
  //   [],
  //   targetWord,
  //   process.env.INTERMEDIATE_PROMPT
  // );
  // const example3 = await generateSentenceFromKnownWords(
  //   [],
  //   targetWord,
  //   process.env.ADVANCED_PROMPT
  // );
  await textToSpeech(example1);
  // await textToSpeech(example2);
  // await textToSpeech(example3);
}

run();
