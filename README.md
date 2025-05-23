# Community Archive Stream

This repo is for docs, bugs, and suggestions for the Community Archive Stream browser extension, which intercepts some tweets as you view them and adds them to the [Twitter Community Archive](http://community-archive.org/) open database

Install it here:

[TBD]


This is a [Plasmo extension](https://docs.plasmo.com/) project bootstrapped with [`plasmo init`](https://www.npmjs.com/package/plasmo).

## Getting Started

First, make sure you have a valid local environment of [Community Archive](https://github.com/ri72miieop/community-archive/blob/main/docs/local-setup.md) running.

Then make sure you have the .env file properly set. After that run the development server:

```bash
pnpm dev
# or
npm run dev
```

Open your browser and load the appropriate development build. For example, if you are developing for the chrome browser, using manifest v3, use: `build/chrome-mv3-dev`.

You can start editing the popup by modifying `popup.tsx`. It should auto-update as you make changes. To add an options page, simply add a `options.tsx` file to the root of the project, with a react component default exported. Likewise to add a content page, add a `content.ts` file to the root of the project, importing some module and do some logic, then reload the extension on your browser.

For further guidance, [visit our Documentation](https://docs.plasmo.com/)

