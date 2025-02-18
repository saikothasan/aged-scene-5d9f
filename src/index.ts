interface Env {
  AI: Ai;
  IMAGE_BUCKET: R2Bucket;
  TELEGRAM_BOT_TOKEN: string;
}

async function sendTelegramMessage(chatId: number, text: string, env: Env): Promise<void> {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
    }),
  });
}

async function sendChatAction(chatId: number, action: string, env: Env): Promise<void> {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      action: action,
    }),
  });
}

async function handleImageGeneration(chatId: number, prompt: string, env: Env): Promise<void> {
  try {
    await sendTelegramMessage(chatId, `Generating image for: "${prompt}"...`, env);
    await sendChatAction(chatId, 'upload_photo', env);

    const response = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
      prompt: prompt,
    });

    if (!response.image) {
      throw new Error('No image generated');
    }

    const binaryString = atob(response.image);
    const img = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      img[i] = binaryString.charCodeAt(i);
    }

    const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.jpg`;

    await env.IMAGE_BUCKET.put(filename, img, {
      httpMetadata: {
        contentType: 'image/jpeg',
      },
    });

    const imageUrl = `https://pub-c947d778434f41f08f6bb0fd06fb4e60.r2.dev/${filename}`;

    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        photo: imageUrl,
        caption: `Here's your image based on: "${prompt}"`,
      }),
    });
  } catch (error) {
    console.error('Error in image generation:', error);
    await sendTelegramMessage(chatId, 'Sorry, an error occurred while generating your image.', env);
  }
}

async function handleAudioTranscription(chatId: number, fileId: string, env: Env): Promise<void> {
  try {
    await sendTelegramMessage(chatId, "Transcribing your audio...", env);
    await sendChatAction(chatId, 'typing', env);

    const fileInfo = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`).then(res => res.json());
    const filePath = fileInfo.result.file_path;
    const audioUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;

    const audioResponse = await fetch(audioUrl);
    const audioBlob = await audioResponse.arrayBuffer();

    const input = {
      audio: [...new Uint8Array(audioBlob)],
    };

    const response = await env.AI.run("@cf/openai/whisper", input);

    if (typeof response.text !== 'string') {
      throw new Error('Invalid transcription response');
    }

    await sendTelegramMessage(chatId, `Transcription: ${response.text}`, env);
  } catch (error) {
    console.error('Error in audio transcription:', error);
    await sendTelegramMessage(chatId, 'Sorry, an error occurred while transcribing your audio.', env);
  }
}

async function handleImageToText(chatId: number, fileId: string, env: Env): Promise<void> {
  try {
    await sendTelegramMessage(chatId, "Analyzing your image...", env);
    await sendChatAction(chatId, 'typing', env);

    const fileInfo = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`).then(res => res.json());
    const filePath = fileInfo.result.file_path;
    const imageUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;

    const imageResponse = await fetch(imageUrl);
    const imageBlob = await imageResponse.arrayBuffer();

    const input = {
      image: [...new Uint8Array(imageBlob)],
      prompt: "Generate a caption for this image",
      max_tokens: 512,
    };

    const response = await env.AI.run("@cf/llava-hf/llava-1.5-7b-hf", input);

    if (typeof response.response !== 'string') {
      throw new Error('Invalid image analysis response');
    }

    await sendTelegramMessage(chatId, `Image analysis: ${response.response}`, env);
  } catch (error) {
    console.error('Error in image analysis:', error);
    await sendTelegramMessage(chatId, 'Sorry, an error occurred while analyzing your image.', env);
  }
}

async function handleSummarization(chatId: number, text: string, env: Env): Promise<void> {
  try {
    await sendTelegramMessage(chatId, "Summarizing your text...", env);
    await sendChatAction(chatId, 'typing', env);

    const response = await env.AI.run("@cf/facebook/bart-large-cnn", {
      input_text: text,
      max_length: 100
    });

    if (typeof response.summary !== 'string') {
      throw new Error('Invalid summarization response');
    }

    await sendTelegramMessage(chatId, `Summary: ${response.summary}`, env);
  } catch (error) {
    console.error('Error in summarization:', error);
    await sendTelegramMessage(chatId, 'Sorry, an error occurred while summarizing your text.', env);
  }
}

async function handleAIChat(chatId: number, userMessage: string, env: Env): Promise<void> {
  try {
    await sendChatAction(chatId, 'typing', env);

    const messages = [
      { role: "system", content: "You are a friendly assistant" },
      { role: "user", content: userMessage },
    ];

    const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", { messages });

    if (typeof response.response !== 'string') {
      throw new Error('Invalid AI chat response');
    }

    await sendTelegramMessage(chatId, response.response, env);
  } catch (error) {
    console.error('Error in AI chat:', error);
    await sendTelegramMessage(chatId, 'Sorry, an error occurred while processing your message.', env);
  }
}

async function handleStart(chatId: number, env: Env): Promise<void> {
  const welcomeMessage = `
Welcome to the AI Assistant Bot! Here are the available commands:

/start - Show this help message
/imagine <prompt> - Generate an image based on your prompt
/transcribe - Transcribe the next voice message or audio file you send
/analyze - Analyze and describe the next image you send
/summarize <text> - Summarize the provided text
/chat <message> - Chat with the AI assistant

To use the image generation, type /imagine followed by your description.
To use the audio transcription, type /transcribe and then send a voice message or audio file.
To analyze an image, type /analyze and then send an image.
To summarize text, type /summarize followed by the text you want to summarize.
To chat with the AI, type /chat followed by your message.
  `;
  await sendTelegramMessage(chatId, welcomeMessage, env);
}

async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  try {
    const update = await request.json();
    
    if (!update.message) {
      return new Response('OK');
    }

    const chatId = update.message.chat.id;

    if (update.message.text) {
      const text = update.message.text.trim();
      
      if (text === '/start') {
        await handleStart(chatId, env);
      } else if (text.startsWith('/imagine ')) {
        const prompt = text.slice(9).trim();
        await handleImageGeneration(chatId, prompt, env);
      } else if (text === '/transcribe') {
        await sendTelegramMessage(chatId, "Please send a voice message or audio file for transcription.", env);
      } else if (text === '/analyze') {
        await sendTelegramMessage(chatId, "Please send an image for analysis.", env);
      } else if (text.startsWith('/summarize ')) {
        const textToSummarize = text.slice(11).trim();
        await handleSummarization(chatId, textToSummarize, env);
      } else if (text.startsWith('/chat ')) {
        const userMessage = text.slice(6).trim();
        await handleAIChat(chatId, userMessage, env);
      } else {
        await sendTelegramMessage(chatId, "Unrecognized command. Type /start for help.", env);
      }
    } else if (update.message.voice || update.message.audio) {
      const fileId = update.message.voice ? update.message.voice.file_id : update.message.audio.file_id;
      await handleAudioTranscription(chatId, fileId, env);
    } else if (update.message.photo) {
      const fileId = update.message.photo[update.message.photo.length - 1].file_id;
      await handleImageToText(chatId, fileId, env);
    } else {
      await sendTelegramMessage(chatId, "I can only process text messages, voice messages, audio files, or images. Type /start for help.", env);
    }

    return new Response('OK');
  } catch (error) {
    console.error('Error in webhook handler:', error);
    return new Response('Error', { status: 500 });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleTelegramWebhook(request, env);
  },
} satisfies ExportedHandler<Env>;
