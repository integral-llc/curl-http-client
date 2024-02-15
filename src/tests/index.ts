import { CurlHttpClient } from "../curl-http-client";
import * as fs from "fs";
import path from "path";

const obj = {
  numberField: 1,
  stringField: 'string',
  booleanField: true,
  nullField: null,
  arrayField: [1, 2, 3],
  objectField: {
    nestedField: 'nested'
  }
}

const data = {
  "jsonKey": JSON.stringify(obj),
  "file1": fs.readFileSync('./src/tests/assets/file1.txt'),
  "file2": fs.readFileSync('./src/tests/assets/file2.txt'),
};

const request = {
  url: 'https://webhook.site/0ccafd1a-b758-4af4-bcfd-442d1b717290',
  method: 'POST',
  headers: {
    'Content-Type': 'multipart/form-data'
  },
  data: data
};

async function main() {
  const response = await CurlHttpClient.post('https://webhook.site/0ccafd1a-b758-4af4-bcfd-442d1b717290'
    , request);

  console.log(`main:main#`, response.status, response.data);
}

main();
