import type Mail from 'nodemailer/lib/mailer';
import type { EmailAdapter, SendEmailOptions } from 'payload';
import { APIError } from 'payload';

export type SendGridAdapterArgs = {
  apiKey: string;
  defaultFromAddress: string;
  defaultFromName: string;
};

type SendGridAdapter = EmailAdapter<SendGridResponse>;

type SendGridError = {
  id?: string;
  errors: {
    message: string;
    field: string | null;
    help: Record<string, string>;
  }[];
};

type SendGridResponse = void | SendGridError;

/**
 * Email adapter for [SendGrid](https://sendgrid.com) REST API
 */
export const sendGridAdapter = (args: SendGridAdapterArgs): SendGridAdapter => {
  const { apiKey, defaultFromAddress, defaultFromName } = args;

  const adapter: SendGridAdapter = () => ({
    name: 'sendgrid-rest',
    defaultFromAddress,
    defaultFromName,
    sendEmail: async (message) => {
      // Map the Payload email options to SendGrid email options
      const sendEmailOptions = mapPayloadEmailToSendGridEmail(message, defaultFromAddress, defaultFromName);

      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        body: JSON.stringify(sendEmailOptions),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });

      if (res.status === 202) return;
      else {
        const data = (await res.json()) as SendGridError;

        let formattedError = `Error sending email: ${res.status} ${res.statusText}${data.id ? ` (ID: ${data.id})` : ''}.`;

        (data.errors || []).forEach(({ message, field, help }, idx) => {
          if (field && message)
            formattedError += `${idx !== 0 ? '; ' : ' '}${field && field !== 'null' ? `Field: ${field}, ` : ''}Message: ${message}${help ? `, Help: ${help} ` : ''}`;
        });

        throw new APIError(formattedError, res.status);
      }
    },
  });

  return adapter;
};

function mapPayloadEmailToSendGridEmail(
  message: SendEmailOptions,
  defaultFromAddress: string,
  defaultFromName: string,
): SendGridSendEmailOptions {
  const cc = mapAddresses(message.cc);
  const bcc = mapAddresses(message.bcc);
  const attachments = mapAttachments(message.attachments);

  const email: SendGridSendEmailOptions = {
    // Required
    from: mapFromAddress(message.from, defaultFromName, defaultFromAddress),
    subject: message.subject ?? '',
    personalizations: [
      {
        // Required
        to: mapAddresses(message.to),
        // Other To fields
        cc: cc.length ? cc : undefined,
        bcc: bcc.length ? cc : undefined,
      },
    ],

    // Optional
    attachments: attachments?.length ? attachments : undefined,
  };

  if (message.html || message.text) {
    email.content = [];

    if (message.text) email.content.push({ type: 'text/plain', value: message.text.toString?.() || '' });
    if (message.html) email.content.push({ type: 'text/html', value: message.html.toString?.() || '' });
  }

  if (message.replyTo) {
    if (message.replyTo === 'string') {
      email.reply_to = {
        email: extractEmailFromAddressString(message.replyTo),
        name:
          extractNameFromAddressString(message.replyTo) === message.replyTo
            ? undefined
            : extractNameFromAddressString(message.replyTo),
      };
    } else if (Array.isArray(message.replyTo)) {
      const addresses = mapAddresses(message.replyTo);

      if (addresses.length) {
        if (addresses.length > 1) email.reply_to_list = addresses;
        else email.reply_to = addresses[0];
      }
    } else {
      email.reply_to = {
        email: extractEmailFromAddressString((message.replyTo as Mail.Address).address),
        name:
          (message.replyTo as Mail.Address).name === (message.replyTo as Mail.Address).address
            ? undefined
            : (message.replyTo as Mail.Address).name,
      };
    }
  }

  return email;
}

function extractEmailFromAddressString(address: string) {
  return address.replace(/(.*)<.*>/, '$1').trim();
}

function extractNameFromAddressString(address: string) {
  return address.replace(/.*<(.*)>/, '$1').trim();
}

function mapFromAddress(
  address: SendEmailOptions['from'],
  defaultFromName: string,
  defaultFromAddress: string,
): SendGridSendEmailOptions['from'] {
  if (!address)
    return {
      email: defaultFromAddress,
      name: defaultFromName,
    };

  if (typeof address === 'string')
    return {
      email: extractEmailFromAddressString(address),
      name: extractNameFromAddressString(address) === address ? undefined : extractNameFromAddressString(address),
    };

  return {
    email: extractEmailFromAddressString(address.address),
    name: address.name === address.address ? undefined : address.name,
  };
}

function mapAddresses(addresses: SendEmailOptions['to']): SendGridSendEmailOptions['personalizations'][0]['to'] {
  if (!addresses) return [];

  if (typeof addresses === 'string')
    return [
      {
        email: extractEmailFromAddressString(addresses),
        name:
          extractNameFromAddressString(addresses) === addresses ? undefined : extractNameFromAddressString(addresses),
      },
    ];

  if (Array.isArray(addresses))
    return addresses.map((address) => ({
      email:
        typeof address === 'string'
          ? extractEmailFromAddressString(address)
          : extractEmailFromAddressString(address.address),
      name:
        typeof address === 'string'
          ? extractNameFromAddressString(address) === address
            ? undefined
            : extractNameFromAddressString(address)
          : address.name === address.address
            ? undefined
            : address.name,
    }));

  return [
    {
      email: extractEmailFromAddressString(addresses.address),
      name: addresses.name === addresses.address ? undefined : addresses.name,
    },
  ];
}

function mapAttachments(attachments: SendEmailOptions['attachments']): SendGridSendEmailOptions['attachments'] {
  if (!attachments) return undefined;

  return attachments.map((attachment) => {
    if (!attachment.filename || !attachment.content)
      throw new APIError('Attachment is missing filename or content', 400);

    if (typeof attachment.content === 'string')
      return {
        content: Buffer.from(attachment.content),
        filename: attachment.filename,
      };

    if (attachment.content instanceof Buffer)
      return {
        content: attachment.content,
        filename: attachment.filename,
      };

    throw new APIError('Attachment content must be a string or a buffer', 400);
  });
}

type SendGridSendEmailOptions = {
  personalizations: Personalization[];
  /**
   * Sender email address object. "email" property is required; to include a friendly name, use the "name" property.
   *
   * @link https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send#request-body
   */
  from: EmailAddress;
  /**
   * Reply-to email address.
   * You can use either the "reply_to" property or "reply_to_list" property but not both.
   *
   * @link https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send#request-body
   */
  reply_to?: EmailAddress;
  /**
   * Reply-to email addresses list.
   * You can use either the "reply_to" property or "reply_to_list" property but not both.
   *
   * @link https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send#request-body
   */
  reply_to_list?: EmailAddress[];
  /**
   * Email subject (global level).
   *
   * See line length limits specified in [RFC 2822](https://www.rfc-editor.org/rfc/rfc2822#section-2.1.1) for guidance on subject line character limits.
   *
   * @link https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send#request-body
   */
  subject: string;
  /**
   * Content array. The plain text and/or html version of the message with the appropriate mime type.
   *
   * @link https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send#request-body
   */
  content?: Content[];
  /**
   * Filename and content of attachments (max 30mb per email as the system limit, recommended size is up to 10mb).
   *
   * @link https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send#request-body
   */
  attachments?: Attachment[];
  /**
   * Custom headers to add to the email.
   *
   * @link https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send#request-body
   */
  headers?: Record<string, string>;
  /**
   * Values that are specific to the entire send that will be carried along with the email and its activity data.
   * Any string that is assigned to this property will be assumed to be the custom argument that you would like to be used.
   * This parameter may bu overridden by the "custom_args" property set at the personalizations level.
   * Total "custom_args" size may not exceed 10,000 bytes.
   */
  custom_args?: Record<string, string>;
  /**
   * A unix timestamp allowing you to specify when your email should be sent.
   * A send cannot be scheduled more than 72 hours in advance.
   * This property may be overridden by the "send_at" property set at the personalizations level.
   */
  send_at?: number;
  /**
   * The IP Pool that you would like to send this email from.
   * IP Pools allow you to group your dedicated Twilio SendGrid IP addresses in order to have more control over your deliverability.
   * See [IP Pools](https://www.twilio.com/docs/sendgrid/ui/account-and-settings/ip-pools) for more information.
   * Minimum length: 2 characters.
   * Maximum length: 64 characters.
   */
  ip_pool_name?: string;
  /**
   * A collection of different mail settings that you can use to specify how you would like this email to be handled.
   * Mail settings provide extra functionality to your mail send.
   * See [Mail Settings](https://www.twilio.com/docs/sendgrid/ui/account-and-settings/mail) for more information.
   */
  mail_settings?: MailSettings;
  /**
   * Settings to determine how you would like to track the metrics of how your recipients interact with your email.
   * See [Tracking Settings](https://www.twilio.com/docs/sendgrid/ui/account-and-settings/tracking) for more information.
   */
  tracking_settings?: TrackingSettings;
};

type EmailAddress = {
  email: string;
  name?: string;
};

type Content = {
  type: 'text/plain' | 'text/html';
  value: string;
};

type Attachment = {
  // Content of an attached file.
  content: Buffer | string;
  // Name of attached file.
  filename: string;
  // MimeType of an attached file
  type?: string;
};

type Personalization = {
  from?: EmailAddress;
  to: EmailAddress[];
  /**
   * Carbon copy recipient email addresses.
   *
   * @link https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send#request-body
   */
  cc?: EmailAddress[];
  /**
   * Blind carbon copy recipient email addresses.
   *
   * @link https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send#request-body
   */
  bcc?: EmailAddress[];
  /**
   * The subject of your email. See line length limits specified in [RFC 2822](https://www.rfc-editor.org/rfc/rfc2822#section-2.1.1) for guidance on subject line character limits.
   */
  subject?: string;
  headers?: Record<string, string>;
  /**
   * Values that are specific to the entire send that will be carried along with the email and its activity data.
   * Any string that is assigned to this property will be assumed to be the custom argument that you would like to be used.
   * This parameter is overrides "custom_args" property set at the global level.
   * Total "custom_args" size may not exceed 10,000 bytes.
   */
  custom_args?: Record<string, string>;
  /**
   * A unix timestamp allowing you to specify when your email should be sent.
   * A send cannot be scheduled more than 72 hours in advance.
   * This property is overrides "send_at" property set at the global level.
   */
  send_at?: number;
};

type EnabledOptionObject = {
  enable?: boolean;
};

type MailSettingsFooterOptions = EnabledOptionObject & {
  text?: string;
  html?: string;
};

type MailSettings = {
  bypass_list_management?: EnabledOptionObject;
  bypass_spam_management?: EnabledOptionObject;
  bypass_bounce_management?: EnabledOptionObject;
  bypass_unsubscribe_management?: EnabledOptionObject;
  footer?: MailSettingsFooterOptions;
  sandbox_mode?: EnabledOptionObject;
};

type TrackingSettingsClickTrackingOptions = EnabledOptionObject & {
  enable_text?: boolean;
};

type TrackingSettingsOpenTrackingOptions = EnabledOptionObject & {
  substitution_tag?: string;
};

type TrackingSettingsSubscriptionTrackingOptions = EnabledOptionObject & {
  text?: string;
  html?: string;
  substitution_tag?: string;
};

type TrackingSettingsGanalyticsOptions = EnabledOptionObject & {
  utm_source?: string;
  utm_medium?: string;
  utm_term?: string;
  utm_content?: string;
  utm_campaign?: string;
};

type TrackingSettings = {
  click_tracking?: TrackingSettingsClickTrackingOptions;
  open_tracking?: TrackingSettingsOpenTrackingOptions;
  subscription_tracking?: TrackingSettingsSubscriptionTrackingOptions;
  ganalytics?: TrackingSettingsGanalyticsOptions;
};
