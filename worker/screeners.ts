// Image safety screening providers. 'none' leaves every publication to human
// review (moderation.mode = 'manual'). 'openai' calls the OpenAI moderation
// endpoint with the stitched preview (requires OPENAI_API_KEY). Add other
// providers (e.g. AWS Rekognition, Hive) by implementing Screener.
import type { Screener } from '../src/server/pipeline';
import { noScreening } from '../src/server/pipeline';

export function openAiScreener(apiKey: string, model = 'omni-moderation-latest'): Screener {
  return {
    name: 'openai',
    async screen(_img, png) {
      const b64 = Buffer.from(png).toString('base64');
      const res = await fetch('https://api.openai.com/v1/moderations', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, input: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } }] }),
      });
      if (!res.ok) throw new Error(`screening provider error ${res.status}`);
      const json: any = await res.json();
      const r = json.results?.[0] ?? {};
      const categories = Object.entries(r.categories ?? {}).filter(([, v]) => v).map(([k]) => k);
      return { provider: 'openai', flagged: Boolean(r.flagged), categories };
    },
  };
}

export function screenerFromEnv(env: NodeJS.ProcessEnv): Screener {
  if (env.SCREENING_PROVIDER === 'openai') {
    if (!env.OPENAI_API_KEY) throw new Error('SCREENING_PROVIDER=openai requires OPENAI_API_KEY');
    return openAiScreener(env.OPENAI_API_KEY);
  }
  return noScreening;
}
