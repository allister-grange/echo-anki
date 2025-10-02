require("dotenv").config();
const { OpenAI } = require("openai");
const fs = require("fs");
const path = require("path");
const { ElevenLabsClient } = require("elevenlabs");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Calls the ChatGPT API with the given prompt
 * @param {string} prompt - The prompt to send to the API
 * @returns {Promise<string>} The response content from ChatGPT
 */
async function callChatGPT(prompt) {
  try {
    console.log("Sending prompt:", prompt);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
    });

    const { total_tokens } = response.usage;
    const content = response.choices[0].message.content.endsWith(".")
      ? response.choices[0].message.content.slice(0, -1)
      : response.choices[0].message.content;

    console.log("Tokens used:", total_tokens);
    console.log("Response:", content);

    return content;
  } catch (error) {
    console.error("Error:", error.message);
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
  const prompt = `Translate the following ${process.env.TARGET_LANGUAGE} text to ${process.env.NATIVE_LANGUAGE}. Respond with only the translated text itself, without any extra words, explanations, or formatting.\n\n"${sentence}"`;
  let translation = await callChatGPT(prompt);

  // If the response is a full sentence explaining the translation, try to extract it.
  // e.g., 'The phrase "..." translates to "..."'
  const matches = translation.match(/"(.*?)"/g);
  if (translation.includes("translates to") && matches && matches.length > 1) {
    // Take the last quoted part
    translation = matches[matches.length - 1];
  }

  // Clean up surrounding quotes that are often added by the model
  if (translation.startsWith('"') && translation.endsWith('"')) {
    translation = translation.slice(1, -1);
  }

  return translation;
}

async function readableStreamToBuffer(stream) {
  const reader = stream.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function textToSpeech(sentence, filePath) {
  try {
    if (!process.env.ELEVENLABS_API_KEY) {
      throw new Error(
        "ELEVENLABS_API_KEY is not set in the environment variables."
      );
    }

    const elevenlabs = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY,
    });

    const voiceId = "JBFqnCBsd6RMkjVDRZzb"; // Adam

    console.log(
      "Using ElevenLabs voice",
      voiceId,
      "to generate speech for:",
      sentence
    );

    // Using the user-specified method.
    const audioStream = await elevenlabs.textToSpeech.convert(voiceId, {
      text: sentence,
      modelId: "eleven_multilingual_v2",
      outputFormat: "mp3_44100_128",
      languageCode: "fr", // camelCase
      voice_settings: {
        speed: 1.1,
      },
    });

    const audioBuffer = await readableStreamToBuffer(audioStream);

    await fs.promises.writeFile(filePath, audioBuffer);
    console.log("Audio saved to:", filePath);
  } catch (error) {
    console.error(
      "Error generating speech audio with ElevenLabs:",
      error.message
    );
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

/**
 * Adds a second card to Anki for speaking practice:
 * English sentence on front, French sentence on back
 */
async function pushBilingualCardToAnki(
  nativeSentence,
  targetSentence,
  audioFilePath,
  deckName = "French::English to French Speaking Practise"
) {
  await ensureDeckExists(deckName);

  const note = {
    action: "addNote",
    version: 6,
    params: {
      note: {
        deckName: deckName,
        modelName: "Basic",
        fields: {
          Front: `(french) ${nativeSentence}`,
          Back: targetSentence,
        },
        options: {
          allowDuplicate: false,
        },
        audio: [
          {
            path: audioFilePath,
            filename: audioFilePath.split("/").pop(),
            fields: ["Back"],
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
      console.log("Bilingual note added successfully");
      return true;
    }
  } catch (error) {
    console.error("Failed to connect to AnkiConnect (bilingual card):", error);
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

  const isQuoted = targetText.startsWith('"') && targetText.endsWith('"');
  const actualText = isQuoted ? targetText.slice(1, -1) : targetText;

  if (isQuoted) {
    // Quoted phrase logic
    const inputType = "phrase";
    console.log(`Input type detected: quoted ${inputType}`);

    const chatGPTsentence = actualText;

    const textDefinition = await getWordDefinitionFromChatGPT(
      actualText,
      process.env.WORD_DEFINITION_PROMPT
    );

    const sentenceTranslation = await translateSentence(chatGPTsentence);

    const audioFilePath = createFilePath(chatGPTsentence);
    await textToSpeech(chatGPTsentence, audioFilePath);

    // await pushSentenceAndAudioToAnki(
    //   textDefinition,
    //   chatGPTsentence,
    //   actualText,
    //   sentenceTranslation,
    //   audioFilePath,
    //   inputType
    // );

    // await pushBilingualCardToAnki(
    //   sentenceTranslation,
    //   chatGPTsentence,
    //   audioFilePath
    // );
  } else {
    // Standard logic for words/phrases (not quoted)
    const inputType = determineInputType(actualText);
    console.log(`Input type detected: ${inputType}`);

    const chatGPTsentence = await generateSentenceFromPhrase(
      actualText,
      difficulty
    );

    const textDefinition = await getWordDefinitionFromChatGPT(
      actualText,
      process.env.WORD_DEFINITION_PROMPT
    );

    if (chatGPTsentence) {
      const sentenceTranslation = await translateSentence(chatGPTsentence);
      const audioFilePath = createFilePath(chatGPTsentence);
      await textToSpeech(chatGPTsentence, audioFilePath);

      await pushSentenceAndAudioToAnki(
        textDefinition,
        chatGPTsentence,
        actualText,
        sentenceTranslation,
        audioFilePath,
        inputType
      );

      await pushBilingualCardToAnki(
        sentenceTranslation,
        chatGPTsentence,
        audioFilePath
      );
    }
  }
}

run();
