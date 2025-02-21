require("dotenv").config();
const axios = require("axios");
const { OpenAI } = require("openai");
const fs = require("fs");
const path = require("path");

const API_URL = "https://api.openai.com/v1/chat/completions";
const API_KEY = process.env.OPENAI_API_KEY;

// TODO read in settings from a config file

async function chatWithGPT(prompt) {
  try {
    const response = await axios.post(
      API_URL,
      {
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 5,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
      }
    );

    console.log("ChatGPT Response:", response.data.choices[0].message.content);
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

    const voices = ["nova", "alloy", "echo", "fable", "onyx", "shimmer"];
    const randomVoice = voices[Math.floor(Math.random() * voices.length)];

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

    console.log(`Audio file saved at: ${filePath}`);
  } catch (error) {
    console.error("Error generating speech audio:", error.message);
  }
}
// Example usage
// chatWithGPT("Test call for echo-anki.");
textToSpeech("Bonjour le monde");
