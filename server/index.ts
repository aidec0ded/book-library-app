import http from "node:http";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { buildLibraryIndex } from "./library-index.js";
import { loadReaderProfile } from "./profile-loader.js";
import { executeMemoryCommand, type MemoryCommand } from "./memory-handler.js";
import { executeListCommand, type ListCommand } from "./list-handler.js";
import { buildListIndex } from "./list-index.js";

config();

const MODEL = "claude-sonnet-4-5-20250929";
const PORT = 3001;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

function buildSystemPrompt(
  libraryIndex: string,
  readerProfile: string | null,
  listIndex: string | null,
): string {
  let prompt = `You are the reading companion for MoodLib, a personal book library app.
You are an empathetic, knowledgeable reading partner — not a search
engine or recommendation algorithm.

Your role:
- Discuss what the reader is currently reading and how it's affecting them
- Make connections between books in their library
- Explore why certain books resonate and others don't
- Help the reader reflect on their evolving tastes and reading life
- Remember what you learn about the reader using your memory tool

When you learn something meaningful — preferences, emotional reactions,
connections between books, evolving tastes — record it in your memory.
Check your memory at the start of each conversation.

Keep your memory organized. Prefer updating existing files over creating
new ones.

You can create and manage curated book lists using your manage_lists tool.
Create lists when the reader asks, or suggest them when you notice patterns
(e.g. "You've mentioned several cold, atmospheric novels — want me to
make a list?"). Always confirm before creating proactively.
Reference books by their exact title as shown in the library.`;

  if (readerProfile) {
    prompt += `\n\n## Reader Profile\n\n${readerProfile}`;
  }

  if (listIndex) {
    prompt += `\n\n${listIndex}`;
  }

  prompt += `\n\n## The Reader's Library\n\n${libraryIndex}`;

  return prompt;
}

interface ChatRequest {
  conversation_id: string | null;
  message: string;
}

function writeSSE(
  res: http.ServerResponse,
  event: string,
  data: Record<string, unknown>,
): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function setCorsHeaders(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function handleChat(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  // Parse body
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString()) as ChatRequest;

  if (!body.message || typeof body.message !== "string") {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "message is required" }));
    return;
  }

  // SSE headers
  setCorsHeaders(res);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  try {
    // Create or reuse conversation
    let conversationId = body.conversation_id;
    if (!conversationId) {
      const { data: conv, error: convError } = await supabase
        .from("conversations")
        .insert({})
        .select("id")
        .single();

      if (convError) throw convError;
      conversationId = conv.id as string;
    }

    writeSSE(res, "meta", { conversation_id: conversationId });

    // Insert user message
    const { error: msgError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: body.message,
    });
    if (msgError) throw msgError;

    // Load conversation history
    const { data: history, error: histError } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (histError) throw histError;

    // Build system prompt with library index, reader profile, and list context
    const [libraryIndex, readerProfile, listIndex] = await Promise.all([
      buildLibraryIndex(supabase),
      loadReaderProfile(supabase),
      buildListIndex(supabase),
    ]);
    const systemPrompt = buildSystemPrompt(libraryIndex, readerProfile, listIndex);

    // Build API messages from history
    const apiMessages: Anthropic.Beta.Messages.BetaMessageParam[] =
      history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content as string,
      }));

    // Streaming tool loop
    let accumulatedText = "";

    while (true) {
      const stream = anthropic.beta.messages.stream({
        model: MODEL,
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: apiMessages,
        tools: [
          { type: "memory_20250818" as const, name: "memory" },
          {
            name: "manage_lists",
            description:
              "Create and manage curated book lists from the reader's library. Use this to build themed lists, reading recommendations, or collections based on conversation context. Books are referenced by their exact title as shown in the library index.",
            input_schema: {
              type: "object" as const,
              properties: {
                action: {
                  type: "string",
                  enum: [
                    "create",
                    "view",
                    "add_books",
                    "remove_books",
                    "delete",
                  ],
                  description: "The action to perform",
                },
                list_name: {
                  type: "string",
                  description:
                    "Name of the list (required for all actions except view-all)",
                },
                description: {
                  type: "string",
                  description: "List description (used with create)",
                },
                books: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "Book titles exactly as they appear in the library (e.g. 'The Road')",
                },
              },
              required: ["action"],
            },
          },
        ],
        betas: ["context-management-2025-06-27"],
        max_tokens: 4096,
      });

      // Forward text deltas to client
      stream.on("text", (text) => {
        accumulatedText += text;
        writeSSE(res, "text", { content: text });
      });

      const finalMessage = await stream.finalMessage();

      // Check for tool use
      const toolUseBlocks = finalMessage.content.filter(
        (b) => b.type === "tool_use",
      );

      if (toolUseBlocks.length === 0) {
        // No tool calls — done
        break;
      }

      // Execute tool calls and build continuation messages
      apiMessages.push({
        role: "assistant",
        content: finalMessage.content,
      });

      const toolResults: Anthropic.Beta.Messages.BetaToolResultBlockParam[] =
        [];
      for (const block of toolUseBlocks) {
        if (block.type !== "tool_use") continue;

        let result: string;
        try {
          if (block.name === "manage_lists") {
            result = await executeListCommand(
              supabase,
              block.input as ListCommand,
            );
          } else {
            result = await executeMemoryCommand(
              supabase,
              block.input as MemoryCommand,
            );
          }
        } catch (err) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`;
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }

      apiMessages.push({
        role: "user",
        content: toolResults,
      });

      // Continue the loop for another round
    }

    // Save assistant message
    const { data: savedMsg, error: saveError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        role: "assistant",
        content: accumulatedText,
      })
      .select("id")
      .single();

    if (saveError) throw saveError;

    writeSSE(res, "done", { message_id: savedMsg.id });

    // Title generation: if this is the first exchange (2 messages)
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId);

    if (count === 2) {
      // Fire-and-forget title generation
      void generateTitle(conversationId, body.message, accumulatedText);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeSSE(res, "error", { message });
  }

  res.end();
}

async function generateTitle(
  conversationId: string,
  userMessage: string,
  assistantMessage: string,
): Promise<void> {
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 50,
      system:
        "Generate a 3-6 word title for this conversation. Return only the title, no quotes or punctuation.",
      messages: [
        {
          role: "user",
          content: `User: ${userMessage.slice(0, 200)}\n\nAssistant: ${assistantMessage.slice(0, 200)}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (textBlock && textBlock.type === "text") {
      await supabase
        .from("conversations")
        .update({ title: textBlock.text.trim() })
        .eq("id", conversationId);
    }
  } catch {
    // Title generation is best-effort
  }
}

const server = http.createServer((req, res) => {
  setCorsHeaders(res);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    void handleChat(req, res);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`MoodLib chat server listening on http://localhost:${PORT}`);
});
