export interface Env {
  AI: Ai;
}

export default {
  async fetch(request, env): Promise<Response> {
    const response = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
      prompt: 'a cyberpunk cat',
    });
    // Convert from base64 string
    const binaryString = atob(response.image);
    // Create byte representation
    const img = Uint8Array.from(binaryString, (m) => m.codePointAt(0));
    return new Response(img, {
      headers: {
        'Content-Type': 'image/jpeg',
      },
    });
  },
} satisfies ExportedHandler<Env>;
