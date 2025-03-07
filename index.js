require("dotenv").config();
const axios = require("axios");
const { OpenAI } = require("openai");
const fs = require("fs");
const path = require("path");

const API_URL = "https://api.openai.com/v1/chat/completions";
const API_KEY = process.env.OPENAI_API_KEY;

/**
 * Calls the ChatGPT API with the given prompt
 * @param {string} prompt - The prompt to send to the API
 * @returns {Promise<string>} The response content from ChatGPT
 */
async function callChatGPT(prompt) {
  try {
    console.log("Sending prompt:", prompt);

    const response = await axios.post(
      API_URL,
      {
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
      }
    );

    const { total_tokens } = response.data.usage;
    const cachedTokens =
      response.data.usage?.prompt_tokens_details?.cached_tokens;
    const content = response.data.choices[0].message.content.endsWith(".")
      ? response.data.choices[0].message.content.slice(0, -1)
      : response.data.choices[0].message.content;

    console.log("Tokens used:", total_tokens);
    if (cachedTokens !== undefined) {
      console.log("Tokens cached:", cachedTokens);
    }
    console.log("Response:", content);

    return content;
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
    return "";
  }
}

/**
 * Generates a sentence using known words and the target word
 * @param {string[]} knownWords - List of words that the user knows
 * @param {string} targetWord - The target word to learn
 * @param {string} prompt - The base prompt template
 * @returns {Promise<string>} The generated sentence
 */
async function generateSentenceFromKnownWords(knownWords, targetWord, prompt) {
  const promptWithReplacements = prompt
    .replaceAll("<TARGET_LANGUAGE>", process.env.TARGET_LANGUAGE)
    .replaceAll("<target-word>", targetWord);

  return await callChatGPT(promptWithReplacements);
}

/**
 * Fetches the definition of a word using ChatGPT
 * @param {string} targetWord - The word to define
 * @param {string} prompt - The base prompt template
 * @returns {Promise<string>} The word definition
 */
async function getWordDefinitionFromChatGPT(targetWord, prompt) {
  const promptWithReplacements = prompt
    .replaceAll("<target-word>", targetWord)
    .replaceAll("<NATIVE_LANGUAGE>", process.env.NATIVE_LANGUAGE)
    .replaceAll("<TARGET_LANGUAGE>", process.env.TARGET_LANGUAGE);

  console.log("promptWithReplacements", promptWithReplacements);

  return await callChatGPT(promptWithReplacements);
}

/**
 * Translates a sentence to the native language using ChatGPT
 * @param {string} sentence - The sentence to translate
 * @returns {Promise<string>} The translated sentence
 */
async function translateSentence(sentence) {
  const prompt = `Translate this ${process.env.TARGET_LANGUAGE} sentence to ${process.env.NATIVE_LANGUAGE}:\n\n"${sentence}"`;
  return await callChatGPT(prompt);
}

async function textToSpeech(sentence, filePath) {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const voices = ["nova", "alloy", "echo", "fable", "shimmer"];
    const randomVoice = voices[Math.floor(Math.random() * voices.length)];

    console.log("Using voice", randomVoice, "to generate", sentence);

    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: randomVoice,
      input: sentence,
      format: "mp3",
      language: process.env.TARGET_LANGUAGE_CHATGPT_CODE,
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.promises.writeFile(filePath, buffer);

    console.log(`Audio file saved`);
  } catch (error) {
    console.error("Error generating speech audio:", error.message);
  }
}

async function ensureDeckExists(deckName) {
  try {
    const deckListResponse = await fetch("http://localhost:8765", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deckNames", version: 6 }),
    });

    const deckList = await deckListResponse.json();
    if (deckList.error) {
      throw new Error(deckList.error);
    }

    if (!deckList.result.includes(deckName)) {
      const createDeckResponse = await fetch("http://localhost:8765", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createDeck",
          version: 6,
          params: { deck: deckName },
        }),
      });

      const createDeckResult = await createDeckResponse.json();
      if (createDeckResult.error) {
        throw new Error(createDeckResult.error);
      }
      console.log(`Created deck: ${deckName}`);
    }
  } catch (error) {
    console.error("Failed to ensure deck exists:", error);
  }
}

async function pushSentenceAndAudioToAnki(
  targetWordTranslation,
  chatGPTsentence,
  targetWord,
  sentenceTranslation,
  audioFilePath,
  deckName = "French::Sentences from target words"
) {
  await ensureDeckExists(deckName);

  const formattedSentence = chatGPTsentence.replace(
    new RegExp(`\\b${targetWord}\\b`, "gi"),
    `<b>${targetWord}</b>`
  );

  const keyboardScript = `
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      setupRevealListeners();
    });
    
    setupRevealListeners();
    
    function setupRevealListeners() {
      document.addEventListener('keydown', function(event) {
        if (event.key === '.') {
          revealTranslation();
        }
      });
      
      const hiddenText = document.getElementById('hidden-translation');
      if (hiddenText) {
        hiddenText.addEventListener('click', revealTranslation);
      }
      
      if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
        setTimeout(revealTranslation, 500);
      }
    }

    function revealTranslation() {
      const hiddenText = document.getElementById('hidden-translation');
      if (hiddenText) {
        hiddenText.style.backgroundColor = 'transparent';
        hiddenText.style.color = '#5C5C5C';
        hiddenText.style.textShadow = '0 0 0 #5C5C5C'; 
      }
    }
  </script>
  `;

  const hiddenTranslation = `
  <div id="hidden-translation" style="
    background-color: #AAAAAA; 
    color: #AAAAAA; 
    padding: 5px;
    margin-top: 10px;
    border-radius: 4px;
    cursor: pointer;
    user-select: none;
  ">
    ${sentenceTranslation}
  </div>
  `;

  const note = {
    action: "addNote",
    version: 6,
    params: {
      note: {
        deckName: deckName,
        modelName: "Basic",
        fields: {
          Front: ``,
          Back:
            formattedSentence +
            "<br /> <br />" +
            targetWordTranslation +
            "<br /> <br />" +
            "<div style='border-top: 1px solid #ccc; padding-top: 10px; margin-top: 10px;'>" +
            "<small>Click for translation or press '.' key</small><br/>" +
            hiddenTranslation +
            "</div>" +
            keyboardScript,
        },
        options: {
          allowDuplicate: false,
        },
        audio: [
          {
            path: audioFilePath,
            filename: audioFilePath.split("/").pop(),
            fields: ["Front"],
          },
        ],
      },
    },
  };

  try {
    const response = await fetch("http://localhost:8765", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(note),
    });

    const result = await response.json();
    if (result.error) {
      console.error("AnkiConnect Error:", result.error);
    } else {
      console.log("Note added successfully");
      return true;
    }
  } catch (error) {
    console.error("Failed to connect to AnkiConnect:", error);
    return false;
  }
}

function createFilePath(sentence) {
  const fileName =
    sentence.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9\-]/g, "") + ".mp3";
  const destDir = path.join(__dirname, "speech_files");

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir);
  }
  return path.join(destDir, fileName);
}

async function run() {
  const targetWord = process.argv[2];
  const difficulty = process.argv[3];

  if (!targetWord || !difficulty) {
    console.error("Usage: node script.js <target-word> <a2 | b1 | b2>");
    process.exit(1);
  }

  let prompt = "";

  if (difficulty === "a2") prompt = process.env.BEGINNER_PROMPT;
  else if (difficulty === "b1") prompt = process.env.INTERMEDIATE_PROMPT;
  else if (difficulty === "b2") prompt = process.env.ADVANCED_PROMPT;

  // Generate the sentence in target language
  const chatGPTsentence = await generateSentenceFromKnownWords(
    [],
    targetWord,
    prompt
  );

  // Get word definition
  const wordDefinition = await getWordDefinitionFromChatGPT(
    targetWord,
    process.env.WORD_DEFINITION_PROMPT
  );

  // Get translation of the full sentence
  const sentenceTranslation = await translateSentence(chatGPTsentence);

  // Create audio file
  const audioFilePath = createFilePath(chatGPTsentence);
  await textToSpeech(chatGPTsentence, audioFilePath);

  // Push everything to Anki
  await pushSentenceAndAudioToAnki(
    wordDefinition,
    chatGPTsentence,
    targetWord,
    sentenceTranslation,
    audioFilePath
  );
}

run();
