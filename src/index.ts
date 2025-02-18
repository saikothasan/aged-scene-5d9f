export interface Env {
  AI: Ai;
  IMAGE_BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      // Generate the image using AI
      const response = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
        prompt: 'a cyberpunk cat',
      });

      // Convert from base64 string to Uint8Array
      const binaryString = atob(response.image);
      const img = Uint8Array.from(binaryString, (m) => m.codePointAt(0));

      // Generate a unique filename using timestamp and random number
      const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.jpg`;

      // Upload the image to R2
      await env.IMAGE_BUCKET.put(filename, img, {
        httpMetadata: {
          contentType: 'image/jpeg',
        },
      });

      // Construct the public URL for the image
      const imageUrl = `https://pub-c947d778434f41f08f6bb0fd06fb4e60.r2.dev/${filename}`;

      // Return the URL in the response
      return new Response(JSON.stringify({ url: imageUrl }), {
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      console.error('Error:', error);
      return new Response('An error occurred', { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
