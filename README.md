# SendGrid REST Email Adapter for Payload CMS

This adapter allows you to send emails using the [SendGrid](https://sendgrid.com) REST API.

## Installation

```sh
pnpm add @zapal/payload-email-sendgrid
```

## Usage

- Sign up for a [SendGrid](https://sendgrid.com) account
- Create an API key
- Set API key as SENDGRID_API_KEY environment variable
- Configure your Payload config

```ts
// payload.config.js
import { sendGridAdapter } from '@zapal/payload-email-sendgrid';

export default buildConfig({
  email: sendGridAdapter({
    defaultFromAddress: 'hello@zapal.tech',
    defaultFromName: 'Zapal',
    apiKey: process.env.SENDGRID_API_KEY || '',
  }),
});
```
