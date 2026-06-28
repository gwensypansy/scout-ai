import { createFileRoute } from "@tanstack/react-router";

// TEMPORARY: delete this file after copying the key to Vercel.
export const Route = createFileRoute("/api/_reveal-key")({
  server: {
    handlers: {
      GET: async () => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("missing", { status: 404 });
        return new Response(key, {
          headers: { "Content-Type": "text/plain" },
        });
      },
    },
  },
});
