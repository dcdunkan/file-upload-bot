import "https://deno.land/x/dotenv@v3.2.0/load.ts";
import { Bot, InputFile } from "https://deno.land/x/grammy@v1.7.0/mod.ts";
import { join } from "https://deno.land/std@0.125.0/path/mod.ts";
import { prettyBytes } from "https://deno.land/std@0.125.0/fmt/bytes.ts";

const bot = new Bot(Deno.env.get("BOT_TOKEN") as string, {
  client: { apiRoot: Deno.env.get("API_ROOT") ?? "https://api.telegram.org" },
});

// Making the bot only accessible to the owner.
const ADMIN_ID = parseInt(Deno.env.get("ADMIN_ID") as string);
bot.use(async (ctx, next) =>
  ctx.from?.id === ADMIN_ID ? await next() : undefined
);

bot.command("start", async (ctx) => {
  await ctx.reply(
    "Hello! Syntax: /folder <path>\nExample: /folder /home/user/Pictures/",
  );
});

bot.command("folder", async (ctx, next) => {
  if (!ctx.match) return await ctx.reply("Please provide a folder path.");

  const path = ctx.match as string;
  const { message_id } = await ctx.reply("Getting file list...");
  const files = await getFileList(path);
  if (files.length === 0) return await ctx.reply("No files found.");

  await ctx.api.editMessageText(
    ctx.chat.id,
    message_id,
    `Uploading ${files.length} files from <code>${path}</code>`,
    { parse_mode: "HTML" },
  );

  await ctx.pinChatMessage(message_id, {
    disable_notification: true,
  });

  // Ready for another job! I am not sure if this is a good practice or not.
  await next();
  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    // Double check.
    if (!await fileExists(file.path)) {
      await ctx.reply(
        `File <code>${file.name}</code> not found. Skipping.\nPath: <code>${file.path}</code>`,
        { parse_mode: "HTML" },
      );
    }

    // Update progress message.
    await ctx.api.editMessageText(
      ctx.chat.id,
      message_id,
      `Uploading ${files.length} files from <code>${path}</code>
[${i + 1}/${files.length}] <code>${files[i].name}</code>`,
      { parse_mode: "HTML" },
    );

    await ctx.replyWithDocument(new InputFile(file.path, file.name), {
      caption: `Filename: <code>${file.name}</code>` +
        `\nPath: <code>${file.path}</code>` +
        `\nSize: ${prettyBytes(file.size)}` +
        `\nCreated at: <code>${file.created_at}</code>`,
      parse_mode: "HTML",
    });
    // Pause for a bit.
    await pause(300);
  }

  await ctx.api.editMessageText(ctx.chat.id, message_id, "Uploaded!");
  await ctx.unpinChatMessage(message_id);

  await ctx.reply(
    `Successfully uploaded ${files.length} files from <code>${path}</code>`,
    { parse_mode: "HTML" },
  );
});

interface FileList {
  name: string;
  path: string;
  size: number;
  created_at: string;
}

async function getFileList(path: string) {
  const files: FileList[] = [];
  for await (const file of Deno.readDir(path)) {
    if (file.isDirectory) {
      const children = await getFileList(join(path, file.name));
      files.push(...children);
    } else {
      const stat = await fileExists(join(path, file.name));
      if (!stat) continue;
      // 2147483648 (2GB) is the max file size in bytes. I didn't checked is
      // that the exact limit in bytes though.
      const sizeLimit = Deno.env.get("API_ROOT") === "https://api.telegram.org"
        ? 52428800
        : 2147483648;
      if (stat.size === 0 || stat.size > sizeLimit) continue;
      files.push({
        name: file.name,
        path: join(path, file.name),
        size: stat.size,
        created_at: stat.birthtime?.toUTCString() ?? "",
      });
    }
  }
  return files;
}

async function fileExists(name: string) {
  try {
    return await Deno.stat(name);
  } catch (error) {
    return error instanceof Deno.errors.NotFound
      ? false
      : Promise.reject(error);
  }
}

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

bot.catch(console.error);
bot.start({ onStart: () => console.log("Bot started") });
