<div align="center">

# Folder Upload Bot

</div>

<div align="justify">

A dead simple Telegram bot to upload files inside your local directory to
Telegram chat. Can be used as a backup helper. Originally, I created this bot to
automate backing up my files to Telegram while I change or reinstall my Linux
distro. For example, if you have a directory of videos, you can use this bot to
upload them for you. With some slight modifications, you can make it upload as
you want. With a
[local bot API server](https://github.com/tdlib/telegram-bot-api) you can also
make it support files upto 2GB in size.

</div>

<!-- ![preview](https://user-images.githubusercontent.com/70066170/152817684-8826bb91-182e-44e2-a6f8-12fdc8f5b39a.gif) -->

<div align="center">

### Demo usage preview

<img src="preview.gif" width="90%"><br>
<sup>*It's a bit older preview, but it still almost the same thing</sup>

</div>

- [ ] It would be cool to have index messages of the uploaded files.

## Setup

You need [Deno](https://deno.land/) to run this bot. I created this bot on
v1.18.2. Also, I recommend setting up a
[local bot API server](https://github.com/tdlib/telegram-bot-api) and increasing
your file size limit.

**1. Clone the repository**

```bash
git clone https://github.com/dcdunkan/folder-upload-bot
cd folder-upload-bot
```

**2. Configure the `.env` variables**

You can either set them in a `.env` file in the root of this repo folder, or you
can set them using `export ADMIN_ID=1234567890` in your terminal.

- `BOT_TOKEN`: Telegram Bot token. Get yours from https://t.me/BotFather.
- `ADMIN_ID`: The user ID of the owner. Because- you know, you don't want other
  people downloading your private files, right?
- `API_ROOT`: Set this to the URL of your local api server, if you have one.

**3. Run `bot.ts`**

```bash
deno run --allow-net --allow-read --allow-env bot.ts
```

- `--allow-net`: For internet access.
- `--allow-env`: For accessing required ENV variables.
- `--allow-read`: To read files from your machine.

If you have everything done right, your bot should be running, and you should
see a message `"Bot started"` in your console.

But if you're still having issues, please open an issue
[here](https://github.com/dcdunkan/folder-upload-bot/issues) :)
