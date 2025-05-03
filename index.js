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
 * Determines if the input is a word, phrase, or complete sentence
 * @param {string} input - The input text to analyze
 * @returns {string} Type of input: 'word', 'phrase', or 'sentence'
 */
function determineInputType(input) {
  const trimmedInput = input.trim();

  // Check if it's a single word
  if (/^[\w\-']+$/i.test(trimmedInput)) {
    return "word";
  }

  // Check if it's a complete sentence (ends with .!? and has a structure resembling a sentence)
  if (/[.!?]$/.test(trimmedInput) && /\b\w+\b.*\b\w+\b/i.test(trimmedInput)) {
    return "sentence";
  }

  // Otherwise, treat as a phrase
  return "phrase";
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
 * Generates a sentence incorporating the target phrase
 * @param {string} targetPhrase - The phrase or sentence to incorporate
 * @param {string} difficulty - The difficulty level (a2, b1, b2)
 * @returns {Promise<string>} The generated sentence
 */
async function generateSentenceFromPhrase(targetPhrase, difficulty) {
  let difficultyLevel = "beginner (A2)";
  if (difficulty === "b1") difficultyLevel = "intermediate (B1)";
  else if (difficulty === "b2") difficultyLevel = "advanced (B2)";

  const promptWithReplacements = process.env.PHRASE_SENTENCE_PROMPT.replaceAll(
    "<target-phrase>",
    targetPhrase
  )
    .replaceAll("<DIFFICULTY_LEVEL>", difficultyLevel)
    .replaceAll("<TARGET_LANGUAGE>", process.env.TARGET_LANGUAGE);

  return await callChatGPT(promptWithReplacements);
}

/**
 * Fetches the definition of a word or phrase using ChatGPT
 * @param {string} targetText - The word or phrase to define
 * @param {string} prompt - The base prompt template
 * @returns {Promise<string>} The definition
 */
async function getWordDefinitionFromChatGPT(targetText, prompt) {
  const promptWithReplacements = prompt
    .replaceAll("<target-word>", targetText)
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

    const voices = ["nova", "alloy", "fable", "shimmer"];
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

/**
 * Highlights the target text within the sentence
 * @param {string} sentence - The full sentence
 * @param {string} targetText - The text to highlight
 * @returns {string} The sentence with the target text highlighted
 */
function highlightTargetText(sentence, targetText) {
  // Escape special regex characters in the target text
  const escapedTarget = targetText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Create a regex that looks for the exact target text with word boundaries if it's a single word
  const isWord = /^[\w\-']+$/i.test(targetText.trim());
  const regexPattern = isWord
    ? new RegExp(`\\b${escapedTarget}\\b`, "gi")
    : new RegExp(escapedTarget, "gi");

  return sentence.replace(regexPattern, `<b>${targetText}</b>`);
}

async function pushSentenceAndAudioToAnki(
  targetTextTranslation,
  chatGPTsentence,
  targetText,
  sentenceTranslation,
  audioFilePath,
  inputType,
  deckName = "French::Sentences from target words"
) {
  await ensureDeckExists(deckName);

  // Only highlight if it's a word or phrase, not a sentence
  const formattedSentence =
    inputType === "sentence"
      ? chatGPTsentence
      : highlightTargetText(chatGPTsentence, targetText);

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

  // Create appropriate content based on input type
  let backContent = "";

  if (inputType === "sentence") {
    // For sentences, only show the sentence and hide the translation
    backContent =
      formattedSentence +
      "<br /> <br />" +
      "<div style='border-top: 1px solid #ccc; padding-top: 10px; margin-top: 10px;'>" +
      "<small>Click for translation or press '.' key</small><br/>" +
      hiddenTranslation +
      "</div>" +
      keyboardScript;
  } else {
    // For words and phrases, show definition and translation
    backContent =
      formattedSentence +
      "<br /> <br />" +
      targetTextTranslation +
      "<br /> <br />" +
      "<div style='border-top: 1px solid #ccc; padding-top: 10px; margin-top: 10px;'>" +
      "<small>Click for translation or press '.' key</small><br/>" +
      hiddenTranslation +
      "</div>" +
      keyboardScript;
  }

  const note = {
    action: "addNote",
    version: 6,
    params: {
      note: {
        deckName: deckName,
        modelName: "Basic",
        fields: {
          Front: ``,
          Back: backContent,
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
  const targetText = process.argv[2];
  const difficulty = process.argv[3];

  if (!targetText || !difficulty) {
    console.error(
      "Usage: node script.js <target-word-or-phrase> <a2 | b1 | b2>"
    );
    process.exit(1);
  }

  const inputType = determineInputType(targetText);
  console.log(`Input type detected: ${inputType}`);

  let chatGPTsentence = "";

  // Handle different input types
  if (inputType === "word") {
    // For single words, use the original word-based prompt
    let prompt = "";
    if (difficulty === "a2") prompt = process.env.BEGINNER_PROMPT;
    else if (difficulty === "b1") prompt = process.env.INTERMEDIATE_PROMPT;
    else if (difficulty === "b2") prompt = process.env.ADVANCED_PROMPT;

    chatGPTsentence = await generateSentenceFromKnownWords(
      [],
      targetText,
      prompt
    );
  } else {
    // For phrases and sentences, use the new phrase-handling function
    chatGPTsentence = await generateSentenceFromPhrase(targetText, difficulty);
  }

  // Get definition/translation of the target text
  const textDefinition = await getWordDefinitionFromChatGPT(
    targetText,
    process.env.WORD_DEFINITION_PROMPT
  );

  // Get translation of the full sentence
  const sentenceTranslation = await translateSentence(chatGPTsentence);

  // Create audio file
  const audioFilePath = createFilePath(chatGPTsentence);
  await textToSpeech(chatGPTsentence, audioFilePath);

  // Push everything to Anki with the input type
  await pushSentenceAndAudioToAnki(
    textDefinition,
    chatGPTsentence,
    targetText,
    sentenceTranslation,
    audioFilePath,
    inputType
  );
}

run();
