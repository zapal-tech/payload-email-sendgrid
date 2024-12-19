import { jest } from '@jest/globals'
import { Payload } from 'payload'

import { sendGridAdapter } from '.'

describe('payload-email-sendgrid', () => {
  const domain = 'zapal.tech'
  const defaultFromAddress = `hello+default@${domain}`
  const defaultFromName = 'Zapal'

  const apiKey = 'test-api-key'

  const expectedFromName = defaultFromName
  const expectedFromEmail = `hello+from@${domain}`

  const expectedToName = defaultFromName
  const expectedToEmail = `hello+to@${domain}`

  const from = ` "${expectedFromName} " <${expectedFromEmail}> `
  const to = ` " ${expectedToName} "  <${expectedToEmail}> `
  const subject = 'This was sent on init'
  const text = 'This is my message body'
  const html = '<p>This is my message body</p>'

  const mockPayload = {} as unknown as Payload

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should handle sending an email', async () => {
    // @ts-expect-error mocking global fetch
    global.fetch = jest.spyOn(global, 'fetch').mockImplementation(
      // @ts-expect-error mocking global fetch
      jest.fn(() =>
        Promise.resolve({
          status: 202,
          json: () => undefined,
        }),
      ) as jest.Mock,
    ) as jest.Mock

    const adapter = sendGridAdapter({
      apiKey,
      defaultFromAddress,
      defaultFromName,
    })

    await adapter({ payload: mockPayload }).sendEmail({
      from,
      to,
      subject,
      text,
      html,
    })

    // @ts-expect-error mocking global fetch
    expect(global.fetch.mock.calls[0][0]).toStrictEqual('https://api.sendgrid.com/v3/mail/send')

    // @ts-expect-error mocking global fetch
    const request = global.fetch.mock.calls[0][1]

    expect(request.headers.Authorization).toStrictEqual(`Bearer ${apiKey}`)
    expect(JSON.parse(request.body)).toMatchObject({
      from: {
        email: expectedFromEmail,
        name: expectedFromName,
      },
      subject,
      content: [
        {
          type: 'text/plain',
          value: text,
        },
        {
          type: 'text/html',
          value: html,
        },
      ],
      personalizations: [
        {
          to: [
            {
              email: expectedToEmail,
              name: expectedToName,
            },
          ],
        },
      ],
    })
  })

  it('should throw an error if the email fails to send', async () => {
    const errorResponse = {
      errors: [
        {
          message: 'error message',
          field: 'field',
          help: 'https://sendgrid.com/docs/API_Reference/Web_API_v3/Mail/errors.html',
        },
      ],
      id: 'test-id',
    }
    // @ts-expect-error mocking global fetch
    global.fetch = jest.spyOn(global, 'fetch').mockImplementation(
      // @ts-expect-error mocking global fetch
      jest.fn(() =>
        Promise.resolve({
          status: 400,
          statusText: 'Bad Request',
          json: () => errorResponse,
        }),
      ) as jest.Mock,
    ) as jest.Mock

    const adapter = sendGridAdapter({
      apiKey,
      defaultFromAddress,
      defaultFromName,
    })

    await expect(() =>
      adapter({ payload: mockPayload }).sendEmail({
        from,
        subject,
        text,
        to,
      }),
    ).rejects.toThrow(
      `Error sending email: 400 Bad Request (ID: ${errorResponse.id}). Field: ${errorResponse.errors[0].field}, Message: ${errorResponse.errors[0].message}, Help: ${errorResponse.errors[0].help} `,
    )
  })
})
