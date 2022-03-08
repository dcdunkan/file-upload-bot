import "https://deno.land/x/dotenv@v3.2.0/load.ts";
import { Bot, InputFile } from "https://deno.land/x/grammy@v1.7.0/mod.ts";
import { basename, join } from "https://deno.land/std@0.128.0/path/mod.ts";
import { prettyBytes as bytes } from "https://deno.land/std@0.128.0/fmt/bytes.ts";

// 20 messages per minute to same group. 60000 / 20 = 3000
const GROUP_WAITING_TIME = 3000; // 3 seconds delay.
const PRIVATE_WAITING_TIME = 25; // A small delay.

const BOT_TOKEN = Deno.env.get("BOT_TOKEN") ?? "";
const ADMIN_ID = parseInt(Deno.env.get("ADMIN_ID") as string);
const API_ROOT = Deno.env.get("API_ROOT") ?? "https://api.telegram.org";

const bot = new Bot(BOT_TOKEN, {
  client: { apiRoot: API_ROOT },
});

// Making the bot only accessible to the owner.
bot.use(async (ctx, next) =>
  ctx.from?.id === ADMIN_ID ? await next() : undefined
);

bot.command("start", async (ctx) => {
  await ctx.reply(
    "Hello! I can help you upload your local files to here." +
      "\nSyntax: /upload <path>" +
      "\nExamples: /upload /home/user/Pictures/" +
      "\nOr /upload /home/user/Pictures/image.jpg" +
      "\n\nRepository: github.com/dcdunkan/file-upload-bot",
    { disable_web_page_preview: true },
  );
});

interface UploadedFileList {
  name: string;
  link: string;
}

bot.command(["upload", "to"], async (ctx) => {
  if (!ctx.match) {
    return await ctx.reply(
      "Please provide a file/folder path." +
        "\nSyntax: /upload <path>" +
        "\nSyntax: /to <target chat id> <path>",
    );
  }

  let path = ctx.match as string;
  if (ctx.message?.text?.startsWith("/to")) {
    if (path.split(" ").length < 2) {
      return await ctx.reply(
        "Please provide a file/folder path and the destination." +
          "\nSyntax: /to <chat id> <file path>",
      );
    }
    ctx.chat.id = parseInt(path.split(" ")[0]);
    await ctx.api.getChat(ctx.chat.id).catch(async () => {
      return await ctx.reply(
        `Could'nt find the target chat ${ctx.chat.id}.` +
          `\nMake sure the chat exists and the bot has permission to send messages to it.`,
      );
    });
    path = path.split(" ").slice(1).join(" ");
  }

  const { message_id } = await ctx.reply("Reading path...");

  const exists = await fileExists(path);
  if (!exists) return await ctx.reply("File/Folder not found.");

  // Single file upload.
  if (exists.isFile) {
    const filename = basename(path);
    await ctx.api.editMessageText(
      ctx.chat.id,
      message_id,
      `Uploading <code>${sanitize(filename)}</code> from <code>${
        sanitize(path)
      }</code>`,
      { parse_mode: "HTML" },
    );

    await ctx.replyWithDocument(new InputFile(path, filename), {
      caption: `Filename: <code>${sanitize(filename)}</code>` +
        `\nPath: <code>${sanitize(path)}</code>` +
        `\nSize: ${bytes(exists.size)}` +
        `\nCreated at: <code>${exists.birthtime?.toUTCString()}</code>`,
      parse_mode: "HTML",
    });

    return await ctx.api.deleteMessage(ctx.chat.id, message_id);
  }

  // Directory upload.
  const files = await getFileList(path);
  if (files.length === 0) return await ctx.reply("No files found.");

  await ctx.api.editMessageText(
    ctx.chat.id,
    message_id,
    `Uploading ${files.length} file${files.length > 1 ? "s" : ""} from <code>${
      sanitize(path)
    }</code>`,
    { parse_mode: "HTML" },
  );

  await ctx
    .pinChatMessage(message_id, { disable_notification: true })
    .catch((e) => e);

  const uploadedFiles: UploadedFileList[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    // Double check.
    if (!await fileExists(file.path)) {
      await ctx.reply(
        `'<code>${
          sanitize(file.name)
        }</code>' not found. Skipping.\nPath: <code>${
          sanitize(file.path)
        }</code>`,
        { parse_mode: "HTML" },
      );
      continue;
    }

    // Update progress message.
    if (ctx.chat.type === "private") {
      await ctx.api.editMessageText(
        ctx.chat.id,
        message_id,
        `📤 [${i + 1}/${files.length}] <code>${
          sanitize(files[i].name)
        }</code> from <code>${sanitize(path)}</code>`,
        { parse_mode: "HTML" },
      );
    }

    try {
      const { message_id: fileMsgId } = await ctx.replyWithDocument(
        new InputFile(file.path, file.name),
        {
          caption: `Filename: <code>${sanitize(file.name)}</code>` +
            `\nPath: <code>${sanitize(file.path)}</code>` +
            `\nSize: ${bytes(file.size)}` +
            `\nCreated at: <code>${file.created_at}</code>`,
          parse_mode: "HTML",
        },
      );

      // Why not private? There's no such link to messages in private chats.
      if (ctx.chat.type !== "private") {
        uploadedFiles.push({
          name: sanitize(file.name),
          link: `https://t.me/c/${
            ctx.chat.id.toString().startsWith("-100")
              ? ctx.chat.id.toString().substring(4)
              : ctx.chat.id
          }/${fileMsgId}`,
        });
      }
      // Pause for a bit.
      await pause(ctx.chat.type);
    } catch (error) {
      await ctx.reply(`Failed to upload <code>${sanitize(file.name)}</code>.`);
      await pause(ctx.chat.type);
      console.error(error);
      continue;
    }
  }

  await ctx.api.editMessageText(ctx.chat.id, message_id, "Uploaded!");
  await ctx.unpinChatMessage(message_id).catch((e) => e);

  await ctx.reply(
    `<b>Successfully uploaded ${files.length} file${
      files.length > 1 ? "s" : ""
    } from</b> <code>${sanitize(path)}</code>`,
    { parse_mode: "HTML" },
  );

  if (uploadedFiles.length < 1) return;
  const indexMessages = createIndexMessages(uploadedFiles);

  for (let i = 0; i < indexMessages.length; i++) {
    const { message_id: idxMsgId } = await ctx.reply(
      indexMessages[i],
      { parse_mode: "HTML" },
    );
    await pause(ctx.chat.type);
    if (i !== 0) continue;
    await ctx.api.editMessageText(
      ctx.chat.id,
      message_id,
      `Uploaded! <a href="https://t.me/c/${
        ctx.chat.id.toString().startsWith("-100")
          ? ctx.chat.id.toString().substring(4)
          : ctx.chat.id
      }/${idxMsgId}">See index</a>`,
      { parse_mode: "HTML" },
    );
  }
});

function createIndexMessages(fileList: UploadedFileList[]): string[] {
  const messages: string[] = [""];
  let index = 0;
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const text = `\n${i + 1}. ${file.name}`;
    const length = messages[index].length + text.length;

    if (length > 4096) index++;

    if (messages[index] === undefined) messages[index] = "";
    messages[index] += `\n${i + 1}. <a href="${file.link}">${file.name}</a>`;
  }
  return messages;
}

interface FileList {
  name: string;
  path: string;
  size: number;
  created_at: string;
}

async function getFileList(path: string): Promise<FileList[]> {
  const files: FileList[] = [];
  for await (const file of Deno.readDir(path)) {
    if (file.name === ".git") continue;
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

  return files.sort((a, b) => {
    if (a.path > b.path) return 1;
    if (b.path > a.path) return -1;
    return 0;
  });
}

async function fileExists(name: string): Promise<Deno.FileInfo | false> {
  try {
    return await Deno.stat(name);
  } catch (error) {
    return error instanceof Deno.errors.NotFound
      ? false
      : Promise.reject(error);
  }
}

function pause(
  chatType: "channel" | "group" | "private" | "supergroup",
): Promise<void> {
  const ms = chatType === "private" ? PRIVATE_WAITING_TIME : GROUP_WAITING_TIME;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitize(html: string): string {
  return html
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&/g, "&amp;");
}

bot.catch(console.error);
bot.start({
  drop_pending_updates: true,
  onStart: ({ username }) => console.log(`${username} started.`),
});
