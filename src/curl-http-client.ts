// eslint-disable-next-line max-classes-per-file
import { spawn } from 'child_process';

import * as fs from 'fs';
import * as path from 'path';

interface Headers {
  [key: string]: string;
}

interface Config {
  headers?: Headers;
  data?: Record<string, unknown> | string | Buffer | fs.ReadStream;
  url?: string;
  method?: string;
}

interface CurlHttpClientResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
  config: Config;
  request: { command: string };
}

export class CurlHttpClientError<T = unknown> extends Error {
  public response: CurlHttpClientResponse<T>;

  public config: Config;

  public request: unknown;

  constructor(message: string, config: Config, request: unknown, response: CurlHttpClientResponse<T>) {
    super(message);
    this.name = 'CurlHttpClientError';
    this.response = response;
    this.config = config;
    this.request = request;
  }
}

export class CurlHttpClient {
  private static prepareHeaders(headers: Headers): string[] {
    const curlHeaders: string[] = [];

    Object.entries(headers).forEach(([key, value]) => {
      const formattedHeader = `${key}: ${value}`;
      curlHeaders.push('-H', formattedHeader);
    });

    return curlHeaders;
  }

  private static async executeCurlCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const curl = spawn(args[0], args.slice(1));

      let stdout = '';
      let stderr = '';

      curl.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      curl.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      curl.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(stderr);
        }
      });

      curl.on('error', (error) => {
        reject(new Error(`Spawn error: ${error}`));
      });
    });
  }

  private static isJson(contentType: string): boolean {
    return contentType && contentType.includes('application/json')
      || contentType.includes('application/hal+json');
  }

  private static handleResponse<T>(
    stdout: string,
    config: Config,
    command: string
  ): CurlHttpClientResponse<T> {
    const [headerPart, ...bodyParts] = stdout.split('\r\n\r\n');
    const body = bodyParts.join('\r\n\r\n');
    const headers = CurlHttpClient.parseHeaders(headerPart);
    const statusLine = headerPart.split('\r\n')[0];
    const statusMatch = statusLine?.match(/HTTP\/\d\.\d (\d{3}) (.*)/);
    const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 0;
    const statusText = statusMatch && statusMatch[2] ? statusMatch[2] : '';
    if (statusCode === 100) {
      return CurlHttpClient.handleResponse<T>(body, config, command);
    }

    // Attempt to parse the body as JSON if the content-type is 'application/json'
    let data: T | string;
    try {
      if (CurlHttpClient.isJson(headers['Content-Type']) && body.length > 0) {
        data = JSON.parse(body) as T;
      } else {
        data = body;
      }

      // Check if the status code indicates an error
      if (statusCode < 200 || statusCode >= 300) {
        throw new CurlHttpClientError(
          `Request failed with status code ${statusCode}`,
          config,
          { command },
          {
            data,
            status: statusCode,
            statusText,
            headers,
            config,
            request: { command },
          }
        );
      }
    } catch (error) {
      // If JSON parsing fails, use the raw body
      data = body;
    }

    return {
      data: data as T,
      status: statusCode,
      statusText,
      headers,
      config,
      request: { command },
    };
  }

  private static parseHeaders(headerStr: string): Headers {
    const headers: Headers = {};
    const lines = headerStr.split('\r\n');

    lines.forEach((line) => {
      const separatorIndex = line.indexOf(':');

      if (separatorIndex > -1) {
        const key = line.substring(0, separatorIndex).trim();
        const value = line.substring(separatorIndex + 1).trim();

        // Handle potential multiline headers
        if (headers[key]) {
          headers[key] += `, ${value}`;
        } else {
          headers[key] = value;
        }
      }
    });

    return headers;
  }

  private static getContentType(filePath: string): string {
    // Add logic here to determine the content type based on the file's extension
    // extract file extension and determine type
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg') return 'image/jpeg';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.pdf') return 'application/pdf';
    if (ext === '.doc') return 'application/msword';
    if (ext === '.docx')
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (ext === '.xls') return 'application/vnd.ms-excel';
    if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (ext === '.ppt') return 'application/vnd.ms-powerpoint';
    if (ext === '.pptx')
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    if (ext === '.zip') return 'application/zip';
    if (ext === '.txt') return 'text/plain';
    if (ext === '.csv') return 'text/csv';
    if (ext === '.json') return 'application/json';
    if (ext === '.xml') return 'application/xml';

    return 'application/octet-stream'; // Default content type
  }

  public static async get<T = unknown>(
    url: string,
    config: Config = {}
  ): Promise<CurlHttpClientResponse<T>> {
    const headers = CurlHttpClient.prepareHeaders(config.headers || {});
    const encodedUrl = encodeURI(url);
    const curlCommand = ['curl', '-i', '-s', '-S', '-X', 'GET', ...headers, encodedUrl];
    const command = curlCommand.join(' ');
    const stdout = await CurlHttpClient.executeCurlCommand(curlCommand);
    return CurlHttpClient.handleResponse<T>(stdout, { ...config, url, method: 'GET' }, command);
  }

  public static async post<T = unknown>(
    url: string,
    config: Config = {}
  ): Promise<CurlHttpClientResponse<T>> {
    return CurlHttpClient.sendData<T>('POST', url, config);
  }

  public static async put<T = unknown>(
    url: string,
    config: Config = {}
  ): Promise<CurlHttpClientResponse<T>> {
    return CurlHttpClient.sendData<T>('PUT', url, config);
  }

  private static async sendData<T>(
    method: string,
    url: string,
    config: Config
  ): Promise<CurlHttpClientResponse<T>> {
    const headers = CurlHttpClient.prepareHeaders(config.headers || {});
    const encodedUrl = encodeURI(url);
    const contentType = config.headers?.['Content-Type'] || '';
    let command: string;
    if (contentType.includes('application/json')) {
      const data = typeof config.data === 'string' ? config.data : JSON.stringify(config.data);
      command = `curl -s -S -X ${method} ${headers.join(' ')} -d '${data}' "${encodedUrl}"`;
      const curlCommand = [
        'curl',
        '-i',
        '-s',
        '-S',
        '-X',
        method,
        ...headers,
        '-d',
        data,
        encodedUrl,
      ];
      const stdout = await CurlHttpClient.executeCurlCommand(curlCommand);
      return CurlHttpClient.handleResponse<T>(stdout, { ...config, url, method }, command);
    }
    return CurlHttpClient.executeCurlWithStream(method, encodedUrl, headers, config.data || {});
  }

  private static async executeCurlWithStream<T = unknown>(
    method: string,
    url: string,
    headers: string[],
    data: Record<string, unknown> | string | Buffer | fs.ReadStream
  ): Promise<CurlHttpClientResponse<T>> {
    return new Promise((resolve, reject) => {
      const boundary = `----CurlHttpClientFormBoundary${Math.random().toString(16)}`;
      headers.push('-H', `Content-Type: multipart/form-data; boundary=${boundary}`);

      // remove double quotes from header values
      headers = headers.map((header) => {
        if (header === '-H') {
          return header;
        }

        // remove trailing and leading double quotes
        return header.replace(/^"(.*)"$/, '$1');
      });

      const curlCommand = [
        'curl',
        '-i',
        '-s',
        '-S',
        '-X',
        method,
        ...headers,
        url,
        '--data-binary',
        '@-',
      ];
      const curl = spawn(curlCommand[0], curlCommand.slice(1), {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const streamFile = (key: string, fileStream: fs.ReadStream) =>
        new Promise<void>((streamResolve, streamReject) => {
          try {
            curl.stdin.write(`--${boundary}\r\n`);
            curl.stdin.write(
              `Content-Disposition: form-data; name="${key}"; filename="${path.basename(
                fileStream.path.toString()
              )}"\r\n`
            );
            curl.stdin.write(
              `Content-Type: ${CurlHttpClient.getContentType(fileStream.path.toString())}\r\n\r\n`
            );
            fileStream.on('error', reject).pipe(curl.stdin, { end: false });
            fileStream.on('end', () => {
              curl.stdin.write(`\r\n`);
              streamResolve();
            });
            fileStream.on('error', (error) => {
              streamReject(error);
            });
          } catch (error) {
            streamReject(error);
          }
        });

      (async () => {
        // eslint-disable-next-line no-restricted-syntax
        for (const [key, value] of Object.entries(data)) {
          if (value instanceof fs.ReadStream) {
            try {
              // eslint-disable-next-line no-await-in-loop
              await streamFile(key, value);
            } catch (error) {
              reject(error);
            }
          } else {
            curl.stdin.write(`--${boundary}\r\n`);
            const newValue = typeof value === 'string' ? value : JSON.stringify(value);
            curl.stdin.write(
              `Content-Disposition: form-data; name="${key}"\r\n\r\n${newValue}\r\n`
            );
          }
        }
        curl.stdin.write(`--${boundary}--\r\n`);
        curl.stdin.end();
      })();

      curl.stderr.on('data', (errorData) => {
        // eslint-disable-next-line no-console
        console.error(`stderr: ${errorData}`);
      });
      let stdout = '';
      curl.stdout.on('data', (stdoutData) => {
        stdout += stdoutData.toString();
      });
      curl.on('error', (err) => {
        // eslint-disable-next-line no-console
        console.error('Error with curl process:', err);
      });

      curl.on('close', (code) => {
        if (code === 0) {
          resolve(
            CurlHttpClient.handleResponse(
              stdout,
              { headers: {}, url, method },
              'curl command with stream'
            )
          );
        } else {
          reject(new Error(`cURL failed with status code ${code}`));
        }
      });
    });
  }
}
