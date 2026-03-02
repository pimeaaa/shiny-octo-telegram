import { z } from "zod";

const ElevenEnvSchema = z.object({
  ELEVENLABS_API_KEY: z.string().min(1),
  ELEVENLABS_VOICE_ID: z.string().min(1).optional()
});

function getElevenEnv() {
  const parsed = ElevenEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      "Missing ElevenLabs env. Set ELEVENLABS_API_KEY (and optionally ELEVENLABS_VOICE_ID) in .env"
    );
  }
  return parsed.data;
}

export type ElevenVoiceSettings = {
  stability?: number; // 0..1
  similarity_boost?: number; // 0..1
  style?: number; // 0..1 (some models)
  use_speaker_boost?: boolean;
};

export async function elevenlabsTextToSpeechMp3(args: {
  text: string;
  voiceId?: string; // if omitted, uses ELEVENLABS_VOICE_ID
  modelId?: string; // optional
  voiceSettings?: ElevenVoiceSettings;
}): Promise<Buffer> {
  const env = getElevenEnv();
  const voiceId = (args.voiceId ?? env.ELEVENLABS_VOICE_ID)?.trim();

  if (!voiceId) {
    throw new Error("No voiceId provided. Set ELEVENLABS_VOICE_ID or pass --voiceId");
  }

  // Common ElevenLabs endpoint shape
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;

  const body = {
    text: args.text,
    model_id: args.modelId ?? "eleven_multilingual_v2",
    voice_settings: {
      stability: args.voiceSettings?.stability ?? 0.4,
      similarity_boost: args.voiceSettings?.similarity_boost ?? 0.8,
      style: args.voiceSettings?.style ?? 0.0,
      use_speaker_boost: args.voiceSettings?.use_speaker_boost ?? true
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": env.ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${text}`);
  }

  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}
